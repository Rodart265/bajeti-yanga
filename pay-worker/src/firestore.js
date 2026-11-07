// A small Firestore client for Cloudflare Workers, using Google's REST API.
//
// Why this exists: the Firebase Admin SDK (what the Cloud Function used) does not run on Workers. This file offers the
// same handful of calls that logic.js needs (collection / doc / get / set / update / where / limit / runTransaction),
// so logic.js did not have to change.
//
// It signs in as a Google "service account" (a robot account with its own key). A service account is not subject to
// the Firestore security rules, exactly like the Admin SDK, so the rules keep blocking the app from writing Premium
// fields while this Worker can.

const enc = new TextEncoder();

// ── values ───────────────────────────────────────────────────────────────────
export class Ts {                       // a Firestore timestamp
  constructor(ms) { this.ms = ms; }
  toMillis() { return this.ms; }
}
export const tsFromMillis = ms => new Ts(ms);

export function encodeValue(v) {
  if (v === null) return { nullValue: null };
  if (v instanceof Ts) return { timestampValue: new Date(v.ms).toISOString() };
  switch (typeof v) {
    case 'boolean': return { booleanValue: v };
    case 'number': return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    case 'string': return { stringValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v) } };
  throw new Error('cannot store a value of type ' + typeof v);
}
export function encodeFields(obj) {
  const f = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) f[k] = encodeValue(v);
  return f;
}
export function decodeValue(f) {
  if (!f) return undefined;
  if ('nullValue' in f) return null;
  if ('booleanValue' in f) return f.booleanValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('stringValue' in f) return f.stringValue;
  if ('timestampValue' in f) return new Ts(Date.parse(f.timestampValue));
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in f) return decodeFields(f.mapValue.fields || {});
  return undefined;
}
export function decodeFields(fields) {
  const o = {};
  for (const k of Object.keys(fields || {})) o[k] = decodeValue(fields[k]);
  return o;
}
const fieldPath = k => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : '`' + k.replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`');

// ── signing in as the service account ────────────────────────────────────────
const b64url = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };

async function importPrivateKey(pem) {
  const body = String(pem).replace(/\\n/g, '\n').replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

// Returns an async function that gives a valid access token, signing a new one only when the last one is about to expire.
export function makeTokenProvider({ serviceAccountJson, fetchImpl = fetch, now = Date.now }) {
  let sa;
  try { sa = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson; }
  catch (_) { throw new Error('GOOGLE_SERVICE_ACCOUNT is not valid JSON. Paste the whole key file.'); }
  if (!sa || !sa.client_email || !sa.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT is missing client_email or private_key.');
  let cached = null, keyPromise = null;
  return async function getToken() {
    if (cached && cached.exp - 60000 > now()) return cached.token;
    keyPromise = keyPromise || importPrivateKey(sa.private_key);
    const key = await keyPromise;
    const iat = Math.floor(now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 };
    const input = b64url(enc.encode(JSON.stringify(header))) + '.' + b64url(enc.encode(JSON.stringify(claims)));
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(input)));
    const r = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + input + '.' + b64url(sig),
    });
    let j = null; try { j = await r.json(); } catch (_) {}
    if (!r.ok || !j || !j.access_token) throw new Error('Google sign-in failed: ' + ((j && (j.error_description || j.error)) || r.status));
    cached = { token: j.access_token, exp: now() + (Number(j.expires_in) || 3600) * 1000 };
    return cached.token;
  };
}

// ── the client ───────────────────────────────────────────────────────────────
const OPS = { '==': 'EQUAL', '>': 'GREATER_THAN', '<': 'LESS_THAN', '>=': 'GREATER_THAN_OR_EQUAL', '<=': 'LESS_THAN_OR_EQUAL' };

export class FirestoreRest {
  constructor({ projectId, getToken, fetchImpl = fetch }) {
    this.getToken = getToken; this.fetchImpl = fetchImpl;
    this.root = `projects/${projectId}/databases/(default)/documents`;
    this.base = 'https://firestore.googleapis.com/v1/';
  }

  async _send(method, url, body) {
    // Call fetch WITHOUT a `this`: Cloudflare's fetch throws "Illegal invocation" when called as a method of another object.
    const r = await (0, this.fetchImpl)(url, {
      method,
      headers: { Authorization: 'Bearer ' + (await this.getToken()), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, ok: r.ok, json: j };
  }
  _fail(res, what) {
    const msg = (res.json && res.json.error && res.json.error.message) || '';
    const e = new Error('Firestore ' + what + ' failed: HTTP ' + res.status + (msg ? ' ' + String(msg).slice(0, 200) : ''));
    e.status = res.status; return e;
  }
  async _post(suffix, body, what) {
    const res = await this._send('POST', this.base + this.root + suffix, body);
    if (!res.ok) throw this._fail(res, what || suffix);
    return res.json;
  }
  _docUrl(path) { return this.base + this.root + '/' + path.split('/').map(encodeURIComponent).join('/'); }

  async _getDoc(path, txId) {
    const url = this._docUrl(path) + (txId ? '?transaction=' + encodeURIComponent(txId) : '');
    const res = await this._send('GET', url);
    if (res.status === 404) return snap(path.split('/').pop(), null);
    if (!res.ok) throw this._fail(res, 'read');
    return snap(path.split('/').pop(), decodeFields(res.json.fields));
  }
  async _patch(path, data, { mask, mustExist }) {
    const q = [];
    if (mask) for (const k of Object.keys(data).filter(k => data[k] !== undefined)) q.push('updateMask.fieldPaths=' + encodeURIComponent(fieldPath(k)));
    if (mustExist) q.push('currentDocument.exists=true');
    const res = await this._send('PATCH', this._docUrl(path) + (q.length ? '?' + q.join('&') : ''), { fields: encodeFields(data) });
    if (!res.ok) throw this._fail(res, 'write');
  }

  collection(name) { return new Col(this, name); }

  // Runs fn(tx) and commits its writes in one go. Reads inside fn lock the documents; if another request got there
  // first Firestore answers 409 (aborted) and the whole function is simply run again, up to 3 times.
  async runTransaction(fn) {
    for (let attempt = 1; ; attempt++) {
      const { transaction } = await this._post(':beginTransaction', { options: { readWrite: {} } }, 'begin');
      const writes = [];
      const name = ref => this.root + '/' + ref.path;
      const tx = {
        get: ref => this._getDoc(ref.path, transaction),
        set: (ref, data, opts) => writes.push(opts && opts.merge
          ? { update: { name: name(ref), fields: encodeFields(data) }, updateMask: { fieldPaths: Object.keys(data).filter(k => data[k] !== undefined).map(fieldPath) } }
          : { update: { name: name(ref), fields: encodeFields(data) } }),
        update: (ref, data) => writes.push({
          update: { name: name(ref), fields: encodeFields(data) },
          updateMask: { fieldPaths: Object.keys(data).filter(k => data[k] !== undefined).map(fieldPath) },
          currentDocument: { exists: true },
        }),
      };
      let result;
      try { result = await fn(tx); }
      catch (e) { await this._post(':rollback', { transaction }, 'rollback').catch(() => {}); throw e; }
      try { await this._post(':commit', { writes, transaction }, 'commit'); return result; }
      catch (e) { if (e.status === 409 && attempt < 3) continue; throw e; }
    }
  }
}

function snap(id, data) { return { id, exists: data !== null, data: () => (data === null ? undefined : data) }; }

class Col {
  constructor(db, name) { this.db = db; this.name = name; }
  doc(id) { return new DocRef(this.db, this.name + '/' + id); }
  where(f, op, v) { return new Query(this.db, this.name, [[f, op, v]], 0); }
  limit(n) { return new Query(this.db, this.name, [], n); }
  get() { return new Query(this.db, this.name, [], 0).get(); }
}

class DocRef {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split('/').pop(); }
  get() { return this.db._getDoc(this.path); }
  set(data, opts) { return this.db._patch(this.path, data, { mask: !!(opts && opts.merge) }); }
  update(data) { return this.db._patch(this.path, data, { mask: true, mustExist: true }); }
}

class Query {
  constructor(db, name, filters, lim) { this.db = db; this.name = name; this.filters = filters; this.lim = lim; }
  where(f, op, v) { return new Query(this.db, this.name, [...this.filters, [f, op, v]], this.lim); }
  limit(n) { return new Query(this.db, this.name, this.filters, n); }
  async get() {
    const fs = this.filters.map(([f, op, v]) => {
      if (!OPS[op]) throw new Error('unsupported operator ' + op);
      return { fieldFilter: { field: { fieldPath: f }, op: OPS[op], value: encodeValue(v) } };
    });
    const sq = { from: [{ collectionId: this.name }] };
    if (fs.length === 1) sq.where = fs[0]; else if (fs.length > 1) sq.where = { compositeFilter: { op: 'AND', filters: fs } };
    if (this.lim) sq.limit = this.lim;
    const rows = await this.db._post(':runQuery', { structuredQuery: sq }, 'query');
    const docs = (rows || []).filter(r => r.document).map(r => snap(r.document.name.split('/').pop(), decodeFields(r.document.fields)));
    return { docs, size: docs.length, forEach: fn => docs.forEach(fn) };
  }
}
