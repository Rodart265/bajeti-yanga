// Run:  node pay-worker/test.mjs      (no install needed; Node 18+)
// Everything runs against pretend services: a fake Firestore that speaks Google's REST format (including "someone else
// changed it first" conflicts), a scripted PayChangu, and fake Google sign-in / key endpoints. Nothing leaves this computer.
import * as logic from './src/logic.js';
import { FirestoreRest, makeTokenProvider, tsFromMillis, Ts, encodeFields, decodeFields, decodeValue, DELETE } from './src/firestore.js';
import { verifyFirebaseToken, resetKeyCache } from './src/auth.js';
import worker from './src/index.js';

let passed = 0, failed = 0;
const ok = (name, cond, extra) => { if (cond) { passed++; console.log('  ok  ', name); } else { failed++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); } };
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want });
const section = s => console.log('\n' + s);
const throwsAsync = async (name, fn, part) => { try { await fn(); ok(name, false, 'did not throw'); } catch (e) { ok(name, !part || String(e.message).includes(part), e.message); } };

const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const json = (status, body) => new Response(JSON.stringify(body), { status });
const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 18, 10, 0, 0);                 // 18 Oct 2026, 12:00 in Malawi

// ── fake Firestore (Google's REST format) ────────────────────────────────────
function miniFirestore() {
  const ROOT = 'projects/bajeti-yanga/databases/(default)/documents';
  const PREFIX = 'https://firestore.googleapis.com/v1/' + ROOT;
  const docs = new Map(), ver = new Map(), txs = new Map(), created = new Map();
  let n = 0;
  // nested field paths (dotted, with `quoting`) inside Google's typed-value format
  const segs = fp => { const out = []; let cur = '', q = false; for (let i = 0; i < fp.length; i++) { const c = fp[i]; if (c === '`') { q = !q; continue; } if (c === '\\' && q) { cur += fp[++i]; continue; } if (c === '.' && !q) { out.push(cur); cur = ''; continue; } cur += c; } out.push(cur); return out; };
  const getAt = (fields, path) => { let f = fields; for (let i = 0; i < path.length; i++) { if (!f || !(path[i] in f)) return undefined; const v = f[path[i]]; if (i === path.length - 1) return v; f = v.mapValue && v.mapValue.fields; } };
  const setAt = (fields, path, v) => { let f = fields; for (let i = 0; i < path.length - 1; i++) { const k = path[i]; if (!f[k] || !f[k].mapValue) f[k] = { mapValue: { fields: {} } }; if (!f[k].mapValue.fields) f[k].mapValue.fields = {}; f = f[k].mapValue.fields; } f[path[path.length - 1]] = v; };
  const delAt = (fields, path) => { let f = fields; for (let i = 0; i < path.length - 1; i++) { const v = f[path[i]]; if (!v || !v.mapValue || !v.mapValue.fields) return; f = v.mapValue.fields; } delete f[path[path.length - 1]]; };
  const applyMask = (existing, mask, incoming) => { const next = structuredClone(existing || {}); for (const fp of mask) { const path = segs(fp); const v = getAt(incoming || {}, path); if (v === undefined) delAt(next, path); else setAt(next, path, structuredClone(v)); } return next; };
  const project = (fields, sel) => { const out = {}; for (const fp of sel) { const path = segs(fp); const v = getAt(fields, path); if (v !== undefined) setAt(out, path, structuredClone(v)); } return out; };
  const api = { calls: [], failCommits: 0 };
  const err = (status, message) => json(status, { error: { message } });
  const bump = p => ver.set(p, (ver.get(p) || 0) + 1);
  const pathOf = name => name.slice(ROOT.length + 1);
  const unq = p => (p.startsWith('`') ? p.slice(1, -1).replace(/\\(.)/g, '$1') : p);
  function matches(f, where) {
    if (!where) return true;
    if (where.compositeFilter) return where.compositeFilter.filters.every(x => matches(f, x));
    const { field, op, value } = where.fieldFilter;
    const x = decodeValue(f[field.fieldPath]), want = decodeValue(value);
    if (op === 'EQUAL') return JSON.stringify(x) === JSON.stringify(want);
    if (op === 'GREATER_THAN') return x > want;
    if (op === 'LESS_THAN') return x < want;
    throw new Error('fake does not know op ' + op);
  }
  api.seed = (path, obj, createMs) => { docs.set(path, encodeFields(obj)); if (!created.has(path)) created.set(path, new Date(createMs || T0).toISOString()); bump(path); };
  api.list = col => [...docs.entries()].filter(([p]) => p.startsWith(col + '/') && p.split('/').length === 2).map(([p, f]) => ({ id: p.split('/')[1], ...decodeFields(f) }));
  api.peek = path => (docs.has(path) ? decodeFields(docs.get(path)) : undefined);
  api.count = suffix => api.calls.filter(c => c.url.endsWith(suffix)).length;
  api.fetch = async (url, init = {}) => {
    url = String(url); const method = (init.method || 'GET').toUpperCase();
    api.calls.push({ method, url });
    if (((init.headers || {}).Authorization || '') !== 'Bearer tok') return err(401, 'bad token');
    if (!url.startsWith(PREFIX)) throw new Error('unexpected url ' + url);
    let rest = url.slice(PREFIX.length);
    const body = init.body ? JSON.parse(init.body) : null;
    const qi = rest.indexOf('?'); const query = new URLSearchParams(qi >= 0 ? rest.slice(qi + 1) : ''); if (qi >= 0) rest = rest.slice(0, qi);

    if (method === 'POST' && rest === ':beginTransaction') { const id = 'tx' + (++n); txs.set(id, { reads: new Map() }); return json(200, { transaction: id }); }
    if (method === 'POST' && rest === ':rollback') { txs.delete(body.transaction); return json(200, {}); }
    if (method === 'POST' && rest === ':commit') {
      const t = txs.get(body.transaction); if (!t) return err(400, 'unknown transaction');
      txs.delete(body.transaction);
      if (api.failCommits > 0) { api.failCommits--; return err(409, 'aborted'); }
      for (const [p, v] of t.reads) if ((ver.get(p) || 0) !== v) return err(409, 'contention');   // someone changed it after we read it
      for (const w of body.writes) if (w.update && w.currentDocument && w.currentDocument.exists && !docs.has(pathOf(w.update.name))) return err(404, 'no such document');
      for (const w of body.writes) {
        if (w.delete) { const p = pathOf(w.delete); docs.delete(p); bump(p); continue; }
        const p = pathOf(w.update.name);
        if (w.updateMask) docs.set(p, applyMask(docs.get(p), w.updateMask.fieldPaths, w.update.fields));
        else docs.set(p, w.update.fields || {});
        if (!created.has(p)) created.set(p, new Date(T0).toISOString());
        bump(p);
      }
      return json(200, { writeResults: [] });
    }
    if (method === 'POST' && rest === ':runQuery') {
      const sq = body.structuredQuery, col = sq.from[0].collectionId;
      let out = [];
      for (const [p, f] of docs) { const parts = p.split('/'); if (parts.length === 2 && parts[0] === col && matches(f, sq.where)) out.push({ document: { name: ROOT + '/' + p, fields: f, createTime: created.get(p) }, readTime: 'x' }); }
      if (sq.orderBy) {
        const keys = sq.orderBy.map(o => ({ path: segs(o.field.fieldPath), desc: o.direction === 'DESCENDING' }));
        out = out.filter(r => keys.every(k => getAt(r.document.fields, k.path) !== undefined));      // Firestore leaves out documents missing the sort field
        out.sort((a, b) => { for (const k of keys) { const x = decodeValue(getAt(a.document.fields, k.path)), y = decodeValue(getAt(b.document.fields, k.path)); if (x !== y) return (x < y ? -1 : 1) * (k.desc ? -1 : 1); } return 0; });
      }
      if (sq.limit) out = out.slice(0, sq.limit);
      if (sq.select) out = out.map(r => ({ ...r, document: { ...r.document, fields: project(r.document.fields, sq.select.fields.map(f => f.fieldPath)) } }));
      return json(200, out.length ? out : [{ readTime: 'x' }]);
    }
    if (rest.startsWith('/')) {
      const p = rest.slice(1).split('/').map(decodeURIComponent).join('/');
      if (method === 'GET') {
        const t = query.get('transaction');
        if (t) { const tx = txs.get(t); if (!tx) return err(400, 'unknown transaction'); if (!tx.reads.has(p)) tx.reads.set(p, ver.get(p) || 0); }
        const fm = query.getAll('mask.fieldPaths');
        return docs.has(p) ? json(200, { name: ROOT + '/' + p, fields: fm.length ? project(docs.get(p), fm) : docs.get(p), createTime: created.get(p) }) : err(404, 'not found');
      }
      if (method === 'DELETE') { docs.delete(p); bump(p); return json(200, {}); }
      if (method === 'PATCH') {
        if (query.get('currentDocument.exists') === 'true' && !docs.has(p)) return err(404, 'no such document');
        const masks = query.getAll('updateMask.fieldPaths');
        if (masks.length) docs.set(p, applyMask(docs.get(p), masks, body.fields));
        else docs.set(p, body.fields || {});
        if (!created.has(p)) created.set(p, new Date(T0).toISOString());
        bump(p);
        return json(200, { name: ROOT + '/' + p, fields: docs.get(p) });
      }
    }
    throw new Error('fake Firestore: unhandled ' + method + ' ' + url);
  };
  return api;
}

// ── scripted PayChangu ───────────────────────────────────────────────────────
function scriptedPayChangu() {
  const s = { creates: [], verifies: [], createStatus: 200, verifyHttp: 200, results: {} };
  s.fetch = async (url, init = {}) => {
    url = String(url);
    if (url === 'https://api.paychangu.com/payment') {
      const body = JSON.parse(init.body); s.creates.push({ headers: init.headers, body });
      return s.createStatus === 200 ? json(200, { status: 'success', data: { checkout_url: 'https://checkout.paychangu.com/' + body.tx_ref } }) : json(s.createStatus, { status: 'failed', message: 'no' });
    }
    if (url.startsWith('https://api.paychangu.com/verify-payment/')) {
      const ref = decodeURIComponent(url.split('/').pop()); s.verifies.push(ref);
      if (s.verifyHttp !== 200) return json(s.verifyHttp, {});
      const r = s.results[ref];
      return json(200, { status: 'success', data: r ? { status: r.status || 'success', amount: r.amount, currency: r.currency || 'MWK' } : { status: 'pending', amount: 0, currency: 'MWK' } });
    }
    throw new Error('fake PayChangu: unexpected ' + url);
  };
  return s;
}

// ── pretend Firebase Authentication (the list of accounts) ───────────────────
function fakeIdentity() {
  const s = { users: [], pageSize: 1000, status: 200, calls: [] };
  s.fetch = async (url, init = {}) => {
    url = String(url); const method = (init.method || 'GET').toUpperCase(); s.calls.push(method + ' ' + url.split('/accounts')[1]);
    if (((init.headers || {}).Authorization || '') !== 'Bearer tok') return json(401, { error: { message: 'bad token' } });
    if (s.status !== 200) return json(s.status, { error: { message: 'PERMISSION_DENIED' } });
    const body = init.body ? JSON.parse(init.body) : null;
    const wire = u => ({ localId: u.localId, email: u.email, phoneNumber: u.phone, emailVerified: u.verified !== false, disabled: !!u.disabled, createdAt: String(u.created), lastLoginAt: u.last ? String(u.last) : undefined, providerUserInfo: [{ providerId: 'google.com' }] });
    if (url.includes('/accounts:batchGet')) {
      const q = new URL(url).searchParams, from = Number(q.get('nextPageToken') || 0), page = s.users.slice(from, from + s.pageSize);
      return json(200, { users: page.map(wire), nextPageToken: from + s.pageSize < s.users.length ? String(from + s.pageSize) : undefined });
    }
    if (url.endsWith('/accounts:lookup')) { const u = s.users.find(x => x.localId === body.localId[0]); return json(200, u ? { users: [wire(u)] } : {}); }
    if (url.endsWith('/accounts:update')) { const u = s.users.find(x => x.localId === body.localId); if (!u) return json(400, { error: { message: 'USER_NOT_FOUND' } }); u.disabled = body.disableUser === true; return json(200, { localId: u.localId }); }
    throw new Error('fake identity: unhandled ' + method + ' ' + url);
  };
  return s;
}

// ── keys for the pretend Google ──────────────────────────────────────────────
const rsa = () => crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const saKeys = await rsa();                                      // the robot (service account) key
const idKeys = await rsa();                                      // Google's key that signs people's sign-in tokens
const pem = '-----BEGIN PRIVATE KEY-----\n' + btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', saKeys.privateKey)))).match(/.{1,64}/g).join('\n') + '\n-----END PRIVATE KEY-----\n';
const SA = { type: 'service_account', client_email: 'robot@bajeti-yanga.iam.gserviceaccount.com', private_key: pem };
const idJwk = { ...(await crypto.subtle.exportKey('jwk', idKeys.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const signJwt = async (priv, header, payload) => {
  const e = o => b64url(enc.encode(JSON.stringify(o))); const input = e(header) + '.' + e(payload);
  return input + '.' + b64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', priv, enc.encode(input))));
};
const idToken = (over = {}) => {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(idKeys.privateKey, { alg: 'RS256', kid: 'k1', typ: 'JWT' }, { aud: 'bajeti-yanga', iss: 'https://securetoken.google.com/bajeti-yanga', sub: 'u1', email: 'a@x.com', iat: now - 5, exp: now + 3600, ...over });
};
const jwkFetch = async () => json(200, { keys: [idJwk] });
async function verifyAssertion(assertion) {                     // what Google's token endpoint would check
  const [h, c, s] = assertion.split('.');
  const good = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', saKeys.publicKey, Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4)), x => x.charCodeAt(0)), enc.encode(h + '.' + c));
  return { good, header: JSON.parse(atob(h.replace(/-/g, '+').replace(/_/g, '/'))), claims: JSON.parse(atob(c.replace(/-/g, '+').replace(/_/g, '/'))) };
}

// ═════════════════════════════════════════════════════════════════════════════
section('dates: how long Premium lasts');
eq('1 month from today', logic.extendExpiry(null, 1, T0), '2026-11-18');
eq('extends from a future expiry', logic.extendExpiry('2026-10-25', 1, T0), '2026-11-25');
eq('expired Premium starts again from today (3 months)', logic.extendExpiry('2026-10-01', 3, T0), '2027-01-18');
eq('31 Jan + 1 month clamps to 28 Feb', logic.extendExpiry('2027-01-31', 1, Date.UTC(2027, 0, 20)), '2027-02-28');
eq('expiry day still counts until the end of that day in Malawi', logic.extendExpiry('2026-10-18', 1, T0), '2026-11-18');
eq('prices match the app (1 month 1500, 3 months 4000)', [logic.PRICES[1], logic.PRICES[3]], [1500, 4000]);

section('webhook signature');
{
  const body = enc.encode('{"reference":"by_abc123_0123456789"}');
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', enc.encode('whsec'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), body));
  const hex = [...mac].map(b => b.toString(16).padStart(2, '0')).join('');
  ok('correct hex signature accepted', await logic.signatureOk(body, hex, 'whsec'));
  ok('correct base64 signature accepted', await logic.signatureOk(body, btoa(String.fromCharCode(...mac)), 'whsec'));
  ok('wrong secret rejected', !(await logic.signatureOk(body, hex, 'other')));
  ok('changed body rejected', !(await logic.signatureOk(enc.encode('{"reference":"by_zzzzzz_0123456789"}'), hex, 'whsec')));
  ok('missing signature rejected', !(await logic.signatureOk(body, '', 'whsec')));
  ok('missing secret rejected', !(await logic.signatureOk(body, hex, '')));
  ok('garbage signature rejected', !(await logic.signatureOk(body, '!!!notbase64!!!', 'whsec')));
}
eq('finds our reference in several places', logic.candidateRefs({ data: { reference: 'by_abc123_0123456789' }, charge_id: 'not-ours' }, { tx_ref: 'by_def456_abcdef0123' }).sort(), ['by_abc123_0123456789', 'by_def456_abcdef0123']);
eq('ignores references that are not ours', logic.candidateRefs({ reference: 'ABC', tx_ref: 'x' }, null), []);

section('Firestore value encoding');
{
  const o = { s: 'hi', i: 5, d: 1.5, b: true, n: null, a: [1, 'x', { y: 2 }], m: { k: { z: false } }, t: tsFromMillis(T0) };
  const back = decodeFields(encodeFields(o));
  eq('round trip keeps everything', JSON.stringify(back), JSON.stringify(o));
  ok('timestamps come back as timestamps', back.t instanceof Ts && back.t.toMillis() === T0);
  eq('undefined fields are skipped', Object.keys(encodeFields({ a: 1, b: undefined })), ['a']);
  eq('whole numbers are stored as integers', encodeFields({ a: 1500 }).a, { integerValue: '1500' });
}

section('Worker signs in to Google');
{
  let calls = 0, assertion = '', t = Date.now();
  const fetchTok = async (url, init) => { calls++; assertion = new URLSearchParams(init.body).get('assertion'); return json(200, { access_token: 'tok', expires_in: 3600 }); };
  const getToken = makeTokenProvider({ serviceAccountJson: JSON.stringify(SA), fetchImpl: fetchTok, now: () => t });
  eq('returns the token', await getToken(), 'tok');
  await getToken();
  eq('re-uses the token instead of signing in again', calls, 1);
  const v = await verifyAssertion(assertion);
  ok('the signed request verifies with the robot public key', v.good);
  eq('asks only for database access', v.claims.scope, 'https://www.googleapis.com/auth/datastore');
  eq('names the robot account', v.claims.iss, SA.client_email);
  eq('lasts one hour', v.claims.exp - v.claims.iat, 3600);
  t += 3600 * 1000; await getToken();
  eq('signs in again when the token is about to expire', calls, 2);
  const escaped = JSON.stringify({ ...SA, private_key: pem.replace(/\n/g, '\\n') });
  ok('also accepts a key whose line breaks were pasted as \\n', (await makeTokenProvider({ serviceAccountJson: escaped, fetchImpl: fetchTok, now: () => t + 9e9 })()) === 'tok');
  let threw = false; try { makeTokenProvider({ serviceAccountJson: '{nope' }); } catch (e) { threw = /not valid JSON/.test(e.message); }
  ok('a broken key file gives a clear message', threw);
  await throwsAsync('Google refusing the key gives a clear message', () => makeTokenProvider({ serviceAccountJson: JSON.stringify(SA), fetchImpl: async () => json(400, { error: 'invalid_grant' }), now: () => 1 })(), 'Google sign-in failed');
}

section('checking who is asking (app sign-in token)');
{
  resetKeyCache(); const env = { FIREBASE_PROJECT_ID: 'bajeti-yanga' };
  const u = await verifyFirebaseToken(await idToken(), env, jwkFetch);
  eq('good token gives the user id and email', u, { uid: 'u1', email: 'a@x.com' });
  await throwsAsync('wrong project is refused', async () => verifyFirebaseToken(await idToken({ aud: 'other' }), env, jwkFetch), 'wrong audience');
  await throwsAsync('wrong issuer is refused', async () => verifyFirebaseToken(await idToken({ iss: 'https://evil.example' }), env, jwkFetch), 'wrong issuer');
  await throwsAsync('expired token is refused', async () => verifyFirebaseToken(await idToken({ exp: Math.floor(Date.now() / 1000) - 10 }), env, jwkFetch), 'expired');
  const good = await idToken(); const [h, , s] = good.split('.');
  const forged = h + '.' + b64url(enc.encode(JSON.stringify({ aud: 'bajeti-yanga', iss: 'https://securetoken.google.com/bajeti-yanga', sub: 'someone-else', iat: 1, exp: 9999999999 }))) + '.' + s;
  await throwsAsync('a token with edited contents is refused', () => verifyFirebaseToken(forged, env, jwkFetch), 'bad signature');
  await throwsAsync('a token signed with a different key is refused', async () => verifyFirebaseToken(await signJwt((await rsa()).privateKey, { alg: 'RS256', kid: 'k1' }, { aud: 'bajeti-yanga', iss: 'https://securetoken.google.com/bajeti-yanga', sub: 'u1', iat: 1, exp: 9999999999 }), env, jwkFetch), 'bad signature');
  await throwsAsync('junk is refused', () => verifyFirebaseToken('abc', env, jwkFetch), 'malformed');
}

// ═════════════════════════════════════════════════════════════════════════════
function logicWorld() {
  const fs = miniFirestore(), pc = scriptedPayChangu(), clock = { t: T0 };
  const db = new FirestoreRest({ projectId: 'bajeti-yanga', getToken: async () => 'tok', fetchImpl: fs.fetch });
  const deps = { db, fetchImpl: pc.fetch, secretKey: 'sk-test', now: () => clock.t, tsFromMillis };
  fs.seed('households/HH1', { owner: 'u1', memberUids: ['u1', 'u2'], config: {} });
  fs.seed('users/u1', { displayName: 'Ann' });
  return { fs, pc, clock, db, deps };
}
const pend = (fs, ref, over = {}) => fs.seed('payments/' + ref, { uid: 'u1', householdId: 'HH1', months: 1, amount: 1500, currency: 'MWK', status: 'pending', createdAtMs: T0, ...over });
const REF = 'by_abc123_0123456789', REF2 = 'by_abc124_0123456780';

section('Firestore client: reads, writes, queries');
{
  const { fs, db } = logicWorld();
  await db.collection('things').doc('a').set({ x: 1, y: 'one' });
  eq('write then read', (await db.collection('things').doc('a').get()).data(), { x: 1, y: 'one' });
  ok('missing document says it does not exist', !(await db.collection('things').doc('nope').get()).exists);
  await db.collection('things').doc('a').update({ y: 'two' });
  eq('update changes only the named field', fs.peek('things/a'), { x: 1, y: 'two' });
  await throwsAsync('updating a missing document fails', () => db.collection('things').doc('nope').update({ y: 1 }), 'HTTP 404');
  await db.collection('things').doc('a').set({ z: true }, { merge: true });
  eq('set with merge keeps the other fields', fs.peek('things/a'), { x: 1, y: 'two', z: true });
  await db.collection('things').doc('b').set({ x: 1, y: 'b' }); await db.collection('things').doc('c').set({ x: 2, y: 'c' });
  eq('query with one filter', (await db.collection('things').where('x', '==', 1).get()).docs.map(d => d.id).sort(), ['a', 'b']);
  eq('query with two filters', (await db.collection('things').where('x', '==', 1).where('y', '==', 'b').get()).docs.map(d => d.id), ['b']);
  eq('query with a limit', (await db.collection('things').limit(2).get()).size, 2);
  eq('query with no matches is empty', (await db.collection('things').where('x', '==', 99).get()).size, 0);
  eq('a bad token is refused by Firestore', await new FirestoreRest({ projectId: 'bajeti-yanga', getToken: async () => 'wrong', fetchImpl: fs.fetch }).collection('things').doc('a').get().catch(e => e.status), 401);
}

section('Firestore client: transactions');
{
  const { fs, db } = logicWorld();
  fs.seed('c/a', { n: 1 });
  await db.runTransaction(async tx => { const s = await tx.get(db.collection('c').doc('a')); tx.update(db.collection('c').doc('a'), { n: s.data().n + 1 }); tx.set(db.collection('c').doc('b'), { made: true }, { merge: true }); });
  eq('commits all writes together', [fs.peek('c/a'), fs.peek('c/b')], [{ n: 2 }, { made: true }]);
  fs.failCommits = 1; let runs = 0;
  await db.runTransaction(async tx => { runs++; const s = await tx.get(db.collection('c').doc('a')); tx.update(db.collection('c').doc('a'), { n: s.data().n + 1 }); });
  eq('a conflict is retried and then succeeds', [runs, fs.peek('c/a').n], [2, 3]);
  fs.failCommits = 5; let thrown = null;
  await db.runTransaction(async tx => { await tx.get(db.collection('c').doc('a')); tx.update(db.collection('c').doc('a'), { n: 99 }); }).catch(e => { thrown = e; });
  ok('gives up after 3 conflicts', thrown && thrown.status === 409 && fs.peek('c/a').n === 3, thrown && thrown.message);
  fs.failCommits = 0;
  await throwsAsync('an error inside the transaction changes nothing', () => db.runTransaction(async tx => { tx.update(db.collection('c').doc('a'), { n: 500 }); throw new Error('boom'); }), 'boom');
  eq('nothing was written', fs.peek('c/a').n, 3);
}

section('starting a payment');
{
  const w = logicWorld(); const base = { deps: w.deps, uid: 'u1', email: 'a@x.com', householdId: 'HH1', months: 1, selfUrl: 'https://pay.example/', appUrl: 'https://app.example/' };
  const r = await logic.createCheckout(base);
  ok('returns a PayChangu checkout address and a reference', r.code === 200 && /^https:\/\/checkout\.paychangu\.com\//.test(r.body.checkout_url) && logic.isTxRef(r.body.tx_ref), r);
  const sent = w.pc.creates[0].body;
  eq('asks PayChangu for the right amount and currency', [sent.amount, sent.currency, sent.tx_ref === r.body.tx_ref], [1500, 'MWK', true]);
  eq('tells PayChangu where to send the customer back', [sent.callback_url, sent.return_url], ['https://pay.example/', 'https://app.example/?paid=1']);
  eq('uses the PayChangu secret key', w.pc.creates[0].headers.Authorization, 'Bearer sk-test');
  eq('saves a pending payment', w.fs.peek('payments/' + r.body.tx_ref), { uid: 'u1', householdId: 'HH1', months: 1, amount: 1500, currency: 'MWK', status: 'pending', createdAtMs: T0 });
  eq('3 months costs 4000', (await logic.createCheckout({ ...base, months: 3 })).code, 200);
  eq('amount for 3 months', w.pc.creates[1].body.amount, 4000);
  eq('rejects an unknown plan', (await logic.createCheckout({ ...base, months: 2 })).code, 400);
  eq('rejects a bad household code', (await logic.createCheckout({ ...base, householdId: 'a/b' })).code, 400);
  eq('rejects someone who is not in the household', (await logic.createCheckout({ ...base, uid: 'stranger' })).code, 403);
  eq('rejects a household that does not exist', (await logic.createCheckout({ ...base, householdId: 'NOPE1' })).code, 403);
  w.fs.seed('households/GONE', { owner: 'u1', memberUids: ['u1'], deletedAt: '2026-10-01' });
  eq('rejects a household that was deleted', (await logic.createCheckout({ ...base, householdId: 'GONE' })).code, 403);
  for (let i = 0; i < 2; i++) await logic.createCheckout(base);      // 4 payments so far, one more allowed
  eq('5th attempt in 10 minutes is allowed', (await logic.createCheckout(base)).code, 200);
  eq('6th attempt in 10 minutes is refused', (await logic.createCheckout(base)).code, 429);
  w.clock.t += 11 * 60 * 1000;
  eq('allowed again after 10 minutes', (await logic.createCheckout(base)).code, 200);
  const bad = logicWorld(); bad.pc.createStatus = 500;
  const r2 = await logic.createCheckout({ ...base, deps: bad.deps });
  ok('PayChangu down: friendly error, payment marked init_failed', r2.code === 502 && Object.values(bad.fs.peek ? [bad.fs.peek('payments/' + bad.pc.creates[0].body.tx_ref)] : [])[0].status === 'init_failed', r2);
}

section('confirming a payment and switching Premium on');
{
  let w = logicWorld(); pend(w.fs, REF);
  eq('not paid yet: stays pending', await logic.settlePayment({ deps: w.deps, txRef: REF }), { status: 'pending' });
  eq('and Premium stays off', w.fs.peek('households/HH1').isPremium, undefined);
  w.pc.results[REF] = { amount: 1500 };
  const r = await logic.settlePayment({ deps: w.deps, txRef: REF });
  eq('paid: reports the new expiry', r, { status: 'paid', premiumExpiry: '2026-11-18' });
  const hh = w.fs.peek('households/HH1');
  eq('household gets Premium and the expiry', [hh.isPremium, hh.premiumExpiry, hh.premiumActivatedAt], [true, '2026-11-18', new Date(T0).toISOString()]);
  eq('owner profile gets premiumUntil (end of that day, Malawi time)', w.fs.peek('users/u1').premiumUntil.toMillis(), logic.endOfDayMs('2026-11-18'));
  eq('owner profile keeps its other fields', w.fs.peek('users/u1').displayName, 'Ann');
  const p = w.fs.peek('payments/' + REF);
  eq('payment is marked paid', [p.status, p.premiumExpiry, p.paidAtMs], ['paid', '2026-11-18', T0]);
  const before = w.pc.verifies.length;
  eq('asking again changes nothing', await logic.settlePayment({ deps: w.deps, txRef: REF }), { status: 'paid', premiumExpiry: '2026-11-18' });
  eq('and does not bother PayChangu again', w.pc.verifies.length, before);

  w = logicWorld(); pend(w.fs, REF); w.pc.results[REF] = { amount: 1500 };
  const both = await Promise.all([logic.settlePayment({ deps: w.deps, txRef: REF }), logic.settlePayment({ deps: w.deps, txRef: REF })]);
  eq('two webhooks at the same moment: Premium extended only once', [both.map(x => x.status), w.fs.peek('households/HH1').premiumExpiry], [['paid', 'paid'], '2026-11-18']);

  w = logicWorld(); w.fs.seed('households/HH1', { owner: 'u1', memberUids: ['u1'], isPremium: true, premiumExpiry: '2026-12-01' }); pend(w.fs, REF, { months: 3, amount: 4000 }); w.pc.results[REF] = { amount: 4000 };
  eq('active Premium is extended, not restarted', (await logic.settlePayment({ deps: w.deps, txRef: REF })).premiumExpiry, '2027-03-01');
  eq('and the original activation date is not overwritten', w.fs.peek('households/HH1').premiumActivatedAt, undefined);

  // Old manual activations live in config.* until migrate-premium.js is run. A payment must not drop the days they have left.
  w = logicWorld(); w.fs.seed('households/HH1', { owner: 'u1', memberUids: ['u1'], config: { isPremium: true, premiumExpiry: '2026-12-31' } }); pend(w.fs, REF); w.pc.results[REF] = { amount: 1500 };
  eq('legacy config Premium: extends from its end date, not from today', (await logic.settlePayment({ deps: w.deps, txRef: REF })).premiumExpiry, '2027-01-31');
  eq('and the root fields are set', [w.fs.peek('households/HH1').isPremium, w.fs.peek('households/HH1').premiumExpiry], [true, '2027-01-31']);

  w = logicWorld(); w.fs.seed('households/HH1', { owner: 'u1', memberUids: ['u1'], config: { isPremium: true } }); pend(w.fs, REF); w.pc.results[REF] = { amount: 1500 };
  const unCfg = await logic.settlePayment({ deps: w.deps, txRef: REF });
  eq('legacy config Premium with no end date stays unlimited (flagged for refund)', [unCfg.premiumExpiry, w.fs.peek('households/HH1').isPremium, /no end date/.test(w.fs.peek('payments/' + REF).note)], [null, undefined, true]);

  w = logicWorld(); w.fs.seed('households/HH1', { owner: 'u1', memberUids: ['u1'], isPremium: true, premiumExpiry: '2026-11-25', config: { isPremium: true, premiumExpiry: '2027-02-10' } }); pend(w.fs, REF); w.pc.results[REF] = { amount: 1500 };
  eq('root and config both dated: the later one counts', (await logic.settlePayment({ deps: w.deps, txRef: REF })).premiumExpiry, '2027-03-10');

  w = logicWorld(); w.fs.seed('households/HH1', { owner: 'u1', memberUids: ['u1'], config: { isPremium: true, premiumExpiry: '2026-10-01' } }); pend(w.fs, REF); w.pc.results[REF] = { amount: 1500 };
  eq('legacy config Premium already ended: starts again from today', (await logic.settlePayment({ deps: w.deps, txRef: REF })).premiumExpiry, '2026-11-18');

  w = logicWorld(); pend(w.fs, REF); w.pc.results[REF] = { amount: 1000 };
  eq('too little paid: refused', await logic.settlePayment({ deps: w.deps, txRef: REF }), { status: 'failed' });
  eq('marked as a mismatch and Premium stays off', [w.fs.peek('payments/' + REF).status, w.fs.peek('payments/' + REF).paidAmount, w.fs.peek('households/HH1').isPremium], ['mismatch', 1000, undefined]);

  w = logicWorld(); pend(w.fs, REF); w.pc.results[REF] = { amount: 1500, currency: 'USD' };
  eq('wrong currency: refused', (await logic.settlePayment({ deps: w.deps, txRef: REF })).status, 'failed');

  w = logicWorld(); pend(w.fs, REF); w.pc.results[REF] = { amount: 1500, status: 'failed' };
  eq('PayChangu says failed: marked failed', [(await logic.settlePayment({ deps: w.deps, txRef: REF })).status, w.fs.peek('payments/' + REF).status], ['failed', 'failed']);

  w = logicWorld(); pend(w.fs, REF, { createdAtMs: T0 - 4 * DAY });
  eq('still pending after 3 days: expired', [(await logic.settlePayment({ deps: w.deps, txRef: REF })).status, w.fs.peek('payments/' + REF).status], ['failed', 'expired']);

  w = logicWorld(); pend(w.fs, REF, { householdId: 'GONE9' }); w.pc.results[REF] = { amount: 1500 };
  eq('household deleted meanwhile: kept for manual refund', [(await logic.settlePayment({ deps: w.deps, txRef: REF })).status, w.fs.peek('payments/' + REF).status], ['failed', 'paid_no_household']);

  w = logicWorld(); w.fs.seed('households/HH1', { owner: 'u1', memberUids: ['u1'], isPremium: true }); pend(w.fs, REF); w.pc.results[REF] = { amount: 1500 };
  const un = await logic.settlePayment({ deps: w.deps, txRef: REF });
  eq('Premium with no end date: nothing extended, note left for a refund', [un.premiumExpiry, w.fs.peek('payments/' + REF).note !== undefined, w.fs.peek('households/HH1').premiumExpiry], [null, true, undefined]);

  w = logicWorld(); pend(w.fs, REF); w.pc.verifyHttp = 500;
  await throwsAsync('PayChangu error is not treated as paid or failed', () => logic.settlePayment({ deps: w.deps, txRef: REF }), 'PayChangu verify failed');
  eq('payment is still pending, so it will be retried', w.fs.peek('payments/' + REF).status, 'pending');

  eq('unknown or invalid references are ignored', [await logic.settlePayment({ deps: w.deps, txRef: 'nope' }), await logic.settlePayment({ deps: w.deps, txRef: REF2 })], [{ status: 'unknown' }, { status: 'unknown' }]);

  w = logicWorld(); pend(w.fs, REF); pend(w.fs, REF2); w.pc.results[REF] = { amount: 1500 };
  const rec = await logic.reconcilePending({ deps: w.deps });
  eq('15-minute sweep: settles the paid one, leaves the other pending', rec.sort(), [[REF, 'paid'], [REF2, 'pending']]);
}

// ═════════════════════════════════════════════════════════════════════════════
// The whole Worker, as Cloudflare would run it, with the pretend Google / Firestore / PayChangu behind global fetch.
const world = { fs: miniFirestore(), pc: scriptedPayChangu(), idt: fakeIdentity() };
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.startsWith('https://firestore.googleapis.com/')) return world.fs.fetch(url, init);
  if (url.startsWith('https://api.paychangu.com/')) return world.pc.fetch(url, init);
  if (url.startsWith('https://identitytoolkit.googleapis.com/')) return world.idt.fetch(url, init);
  if (url === 'https://oauth2.googleapis.com/token') return json(200, { access_token: 'tok', expires_in: 3600 });
  if (url.startsWith('https://www.googleapis.com/service_accounts/v1/jwk/')) return jwkFetch();
  throw new Error('unexpected network call ' + url);
};
const ENV = { ADMIN_OWNERS: 'boss@x.com', ADMIN_SUPPORT: 'help@x.com', ADMIN_ANALYSTS: 'look@x.com', ADMIN_CACHE_SECONDS: '0', PUBLIC_CACHE_SECONDS: '0', PAYCHANGU_SECRET_KEY: 'sk-test', PAYCHANGU_WEBHOOK_SECRET: 'whsec', GOOGLE_SERVICE_ACCOUNT: JSON.stringify(SA), FIREBASE_PROJECT_ID: 'bajeti-yanga', APP_URL: 'https://rodart265.github.io/bajeti-yanga/', ALLOWED_ORIGINS: 'https://rodart265.github.io' };
const ctx = { waitUntil() {} };
const call = (path, init = {}, env = ENV) => worker.fetch(new Request('https://bajeti-pay.test.workers.dev' + path, init), env, ctx);
const hmacHex = async (secret, text) => [...new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
const webhook = async (ref, secret = 'whsec') => { const body = JSON.stringify({ event_type: 'api.charge.payment', status: 'success', reference: ref }); return call('/', { method: 'POST', headers: { signature: await hmacHex(secret, body), 'Content-Type': 'application/json' }, body }); };
const app = async (body, token) => call('/', { method: 'POST', headers: { Authorization: 'Bearer ' + (token || await idToken()), 'Content-Type': 'application/json', Origin: 'https://rodart265.github.io' }, body: JSON.stringify(body) });
const seedWorld = () => { world.fs = miniFirestore(); world.pc = scriptedPayChangu(); world.fs.seed('households/HH1', { owner: 'u1', memberUids: ['u1', 'u2'], config: {} }); world.fs.seed('users/u1', { displayName: 'Ann' }); };

section('the Worker: setup checks');
{
  seedWorld();
  const h = await (await call('/health')).json();
  eq('health says everything is set', h, { ok: true, missing: [] });
  const h2 = await (await call('/health', {}, { ...ENV, GOOGLE_SERVICE_ACCOUNT: '', PAYCHANGU_WEBHOOK_SECRET: '' })).json();
  eq('health lists what is missing, by name only', h2, { ok: false, missing: ['PAYCHANGU_WEBHOOK_SECRET', 'GOOGLE_SERVICE_ACCOUNT'] });
  ok('health never shows a secret', !JSON.stringify(h) .includes('sk-test') && !JSON.stringify(h2).includes('whsec'));
  eq('not set up: payments answer 503, not a crash', (await call('/', { method: 'POST', body: '{}' }, { ...ENV, GOOGLE_SERVICE_ACCOUNT: '' })).status, 503);
  eq('a broken key file also answers 503', (await call('/', { method: 'POST', body: '{}' }, { ...ENV, GOOGLE_SERVICE_ACCOUNT: '{nope' })).status, 503);
  const pre = await call('/', { method: 'OPTIONS', headers: { Origin: 'https://rodart265.github.io' } });
  eq('the app origin is allowed', [pre.status, pre.headers.get('Access-Control-Allow-Origin')], [204, 'https://rodart265.github.io']);
  eq('other websites are not allowed', (await call('/', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })).headers.get('Access-Control-Allow-Origin'), null);
}

section('the Worker: the app starts and checks a payment');
{
  seedWorld();
  eq('no sign-in: refused', (await call('/', { method: 'POST', body: JSON.stringify({ action: 'checkout' }) })).status, 401);
  eq('bad sign-in token: refused', (await app({ action: 'checkout', householdId: 'HH1', months: 1 }, 'a.b.c')).status, 401);
  const r = await app({ action: 'checkout', householdId: 'HH1', months: 1 });
  const b = await r.json();
  ok('checkout works for a household member', r.status === 200 && logic.isTxRef(b.tx_ref) && b.checkout_url.includes('paychangu.com'), b);
  eq('PayChangu was told to come back to the Worker', world.pc.creates[0].body.callback_url, 'https://bajeti-pay.test.workers.dev/');
  eq('someone outside the household is refused', (await app({ action: 'checkout', householdId: 'HH1', months: 1 }, await idToken({ sub: 'stranger' }))).status, 403);
  eq('unknown action is refused', (await app({ action: 'dance' })).status, 400);
  eq('checking a malformed reference is refused', (await app({ action: 'check', txRef: 'x' })).status, 400);
  eq('checking someone else\'s payment looks like "not found"', (await app({ action: 'check', txRef: b.tx_ref }, await idToken({ sub: 'u2' }))).status, 404);
  eq('own payment, not paid yet', await (await app({ action: 'check', txRef: b.tx_ref })).json(), { status: 'pending' });
  world.pc.results[b.tx_ref] = { amount: 1500 };
  const done = await (await app({ action: 'check', txRef: b.tx_ref })).json();
  ok('after paying, "I\'ve paid" switches Premium on', done.status === 'paid' && world.fs.peek('households/HH1').isPremium === true, done);
  eq('the app origin is echoed back so the browser accepts the answer', (await app({ action: 'check', txRef: b.tx_ref })).headers.get('Access-Control-Allow-Origin'), 'https://rodart265.github.io');
}

section('the Worker: PayChangu webhook');
{
  seedWorld();
  const { tx_ref } = await (await app({ action: 'checkout', householdId: 'HH1', months: 3 })).json();
  world.pc.results[tx_ref] = { amount: 4000 };
  eq('forged webhook (wrong signature): refused', (await webhook(tx_ref, 'attacker-guess')).status, 401);
  eq('and nothing happened', world.fs.peek('households/HH1').isPremium, undefined);
  eq('webhook with no signature and no sign-in: refused', (await call('/', { method: 'POST', body: JSON.stringify({ reference: tx_ref }) })).status, 401);
  eq('genuine webhook: accepted', (await webhook(tx_ref)).status, 200);
  const hh = world.fs.peek('households/HH1');
  eq('Premium on for 3 months from today', [hh.isPremium, hh.premiumExpiry], [true, logic.extendExpiry(null, 3, Date.now())]);
  const exp = hh.premiumExpiry;
  eq('PayChangu sending it again: still 200', (await webhook(tx_ref)).status, 200);
  eq('and no double extension', world.fs.peek('households/HH1').premiumExpiry, exp);
  eq('a webhook for a payment we never made: 200, ignored', (await webhook('by_zzzzzz_0123456789')).status, 200);
  world.fs.seed('payments/by_fffff1_0123456789', { uid: 'u1', householdId: 'HH1', months: 1, amount: 1500, currency: 'MWK', status: 'pending', createdAtMs: Date.now() });
  world.pc.verifyHttp = 500;
  eq('PayChangu check failing: still 200 so PayChangu does not hammer us (the 15-minute sweep retries)', (await webhook('by_fffff1_0123456789')).status, 200);
}

section('the Worker: customer coming back from PayChangu');
{
  seedWorld();
  const { tx_ref } = await (await app({ action: 'checkout', householdId: 'HH1', months: 1 })).json();
  world.pc.results[tx_ref] = { amount: 1500 };
  const r = await call('/?tx_ref=' + tx_ref, { redirect: 'manual' });
  eq('goes back to the app with ?paid=1', [r.status, r.headers.get('Location')], [302, 'https://rodart265.github.io/bajeti-yanga/?paid=1']);
  eq('and Premium is already on', world.fs.peek('households/HH1').isPremium, true);
  eq('a plain visit to the address just says ok', await (await call('/')).text(), 'ok');
}

section('the Worker: 15-minute sweep');
{
  seedWorld();
  world.fs.seed('payments/' + REF, { uid: 'u1', householdId: 'HH1', months: 1, amount: 1500, currency: 'MWK', status: 'pending', createdAtMs: Date.now() });
  world.pc.results[REF] = { amount: 1500 };
  const out = await worker.scheduled({}, ENV, ctx);
  eq('settles a payment whose webhook never came', [out, world.fs.peek('households/HH1').isPremium], [[[REF, 'paid']], true]);
  eq('does nothing (and does not crash) when not set up', await worker.scheduled({}, { ...ENV, GOOGLE_SERVICE_ACCOUNT: '' }, ctx), undefined);
}

// ═════════════════════════════════════════════════════════════════════════════
section('Firestore client: removing fields, sorting, choosing fields, deleting');
{
  const { fs, db } = logicWorld();
  await db.collection('t').doc('a').set({ n: 1, cfg: { keep: 1, drop: 2 }, x: 'y' });
  await db.collection('t').doc('a').update({ 'cfg.drop': DELETE, x: DELETE });
  eq('a dotted DELETE removes one field inside a map and nothing else', fs.peek('t/a'), { n: 1, cfg: { keep: 1 } });
  await throwsAsync('a dotted name with a real value is refused', () => db.collection('t').doc('a').update({ 'cfg.keep': 5 }), 'dotted field name');
  await db.collection('t').doc('b').set({ n: 3, big: 'x'.repeat(50), cfg: { a: 1, b: 2 } });
  await db.collection('t').doc('c').set({ n: 2, big: 'y' });
  await db.collection('t').doc('d').set({ big: 'no n here' });
  const q = await db.collection('t').orderBy('n', 'desc').select('n', 'cfg.a').get();
  eq('sorted, and only documents that have the sort field', q.docs.map(d => d.id), ['b', 'c', 'a']);
  eq('only the chosen fields come back (also inside maps)', q.docs.map(d => d.data()), [{ n: 3, cfg: { a: 1 } }, { n: 2 }, { n: 1 }]);
  eq('limit applies after sorting', (await db.collection('t').orderBy('n').limit(1).get()).docs.map(d => d.id), ['a']);
  eq('one document with only some fields', (await db.collection('t').doc('b').get(['n'])).data(), { n: 3 });
  ok('documents carry their creation time', typeof (await db.collection('t').doc('b').get()).createTime === 'number');
  await db.collection('t').doc('c').delete();
  eq('delete removes the document, and deleting a missing one is fine', [fs.peek('t/c'), await db.collection('t').doc('zzz').delete()], [undefined, undefined]);
  await db.runTransaction(async tx => { tx.set(db.collection('t').doc('e'), { k: 1 }); tx.delete(db.collection('t').doc('b')); });
  eq('a transaction can write and delete together', [fs.peek('t/e'), fs.peek('t/b')], [{ k: 1 }, undefined]);
}

// ═════════════════════════════════════════════════════════════════════════════
const adminTok = (email, over = {}) => idToken({ sub: 'adm-' + email.split('@')[0].toLowerCase(), email, email_verified: true, firebase: { sign_in_provider: 'google.com' }, auth_time: Math.floor(Date.now() / 1000) - 60, ...over });
const adm = async (action, params = {}, email = 'boss@x.com', over = {}, env = ENV) => {
  const r = await call('/admin', { method: 'POST', headers: { Authorization: 'Bearer ' + await adminTok(email, over), 'Content-Type': 'application/json', Origin: 'https://rodart265.github.io' }, body: JSON.stringify({ action, ...params }) }, env);
  return { status: r.status, body: await r.json(), headers: r.headers };
};
const plus = n => { const [y, m, d] = logic.catYMD(Date.now() + n * DAY); return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); };
const sorted = o => Object.fromEntries(Object.entries(o).sort());
const HOUR = 3600000;
function adminWorld() {
  world.fs = miniFirestore(); world.pc = scriptedPayChangu(); world.idt = fakeIdentity();
  const now = Date.now(), fs = world.fs;
  const B = () => ({ items: [{ name: 'SECRET_BUDGET_ITEM' }], goals: [{ name: 'SECRET_GOAL' }], overallBudget: 800000 });
  fs.seed('households/HH1', { name: 'Phiri home', owner: 'u1', memberUids: ['u1', 'u2'], isPremium: true, premiumExpiry: plus(5), config: B() }, now - 40 * DAY);
  fs.seed('households/HHL', { owner: 'u3', memberUids: ['u3'], config: { ...B(), isPremium: true, premiumExpiry: plus(20) } }, now - 20 * DAY);
  fs.seed('households/HHT', { owner: 'u4', memberUids: ['u4'], trialStarted: tsFromMillis(now - 5 * DAY), config: B() }, now - 5 * DAY);
  fs.seed('households/HHF', { owner: 'u5', memberUids: ['u5'], config: B() }, now - 1 * DAY);
  fs.seed('households/HHS', { owner: 'u6', memberUids: ['u6'], config: B() }, now - 3 * DAY);
  fs.seed('households/HHD', { owner: 'u5', memberUids: ['u5'], deletedAt: tsFromMillis(now - DAY), config: B() }, now - 50 * DAY);
  const names = { u1: 'Ann', u2: 'Ben', u3: 'Chi', u4: 'Dan', u5: 'Eve' };
  for (const [u, n] of Object.entries(names)) fs.seed('users/' + u, { displayName: n, email: n.toLowerCase() + '@x.com', ...(u === 'u1' ? { premiumUntil: tsFromMillis(logic.endOfDayMs(plus(5))) } : {}) });
  world.idt.users = [
    { localId: 'u1', email: 'ann@x.com', created: now - 40 * DAY, last: now - 1 * DAY }, { localId: 'u2', email: 'ben@x.com', created: now - 35 * DAY, last: now - 3 * DAY },
    { localId: 'u3', email: 'chi@x.com', created: now - 20 * DAY, last: now - 19 * DAY }, { localId: 'u4', email: 'dan@x.com', created: now - 5 * DAY, last: now - 5 * DAY },
    { localId: 'u5', email: 'eve@x.com', created: now - 1 * DAY, last: now - 1 * DAY }, { localId: 'u6', phone: '+265999', created: now - 60 * DAY, last: now - 45 * DAY },
    { localId: 'adm-boss', email: 'boss@x.com', created: now - 100 * DAY, last: now - HOUR }, { localId: 'adm-help', email: 'help@x.com', created: now - 10 * DAY, last: now - HOUR },
  ];
  const pay = (ref, o) => fs.seed('payments/' + ref, { currency: 'MWK', ...o });
  pay('by_aaaaaa_0000000001', { uid: 'u1', householdId: 'HH1', months: 1, amount: 1500, status: 'paid', createdAtMs: now - 30 * DAY, paidAtMs: now - 30 * DAY, premiumExpiry: plus(5) });
  pay('by_aaaaaa_0000000002', { uid: 'u1', householdId: 'HH1', months: 3, amount: 4000, status: 'paid', createdAtMs: now - 60 * DAY, paidAtMs: now - 60 * DAY, premiumExpiry: plus(-25) });
  pay('by_bbbbbb_0000000003', { uid: 'u4', householdId: 'HHT', months: 1, amount: 1500, status: 'pending', createdAtMs: now - 3 * HOUR });
  pay('by_cccccc_0000000004', { uid: 'u5', householdId: 'HHF', months: 1, amount: 1500, status: 'mismatch', createdAtMs: now - 2 * DAY, paidAmount: 1000 });
  pay('by_cccccc_0000000005', { uid: 'u5', householdId: 'HHF', months: 1, amount: 1500, status: 'mismatch', createdAtMs: now - 3 * DAY, adminResolved: true });
  pay('by_dddddd_0000000006', { uid: 'u6', householdId: 'HHS', months: 1, amount: 1500, status: 'paid', createdAtMs: now - 4 * DAY, paidAtMs: now - 4 * DAY, premiumExpiry: plus(30) });
  fs.seed('chipereganyu_groups/GRP1', { name: 'Umodzi', status: 'active', createdBy: 'u1', createdAt: tsFromMillis(now - 30 * DAY), frequency: 'monthly', contributionAmount: 20000, memberUids: ['u1', 'u2', 'u3'],
    currentCycle: { cycleNumber: 2, lap: 1, recipientUid: 'u3', dueDate: plus(-4), amount: 40000, contributions: { u1: { paid: true }, u2: { sent: true, sentAt: tsFromMillis(now - 5 * DAY), paid: false } } } });
  fs.seed('chipereganyu_groups/GRP2', { name: 'Ubwino', status: 'gathering', createdBy: 'u4', memberUids: ['u4'], currentCycle: null });
}

section('admin console: who gets in');
{
  adminWorld();
  eq('no sign-in: refused', (await call('/admin', { method: 'POST', body: '{}' })).status, 401);
  eq('junk token: refused', (await call('/admin', { method: 'POST', headers: { Authorization: 'Bearer a.b.c' }, body: '{}' })).status, 401);
  eq('GET is not allowed', (await call('/admin')).status, 405);
  eq('no admin emails set up: 503, not open to everyone', (await adm('whoami', {}, 'boss@x.com', {}, { ...ENV, ADMIN_OWNERS: '', ADMIN_SUPPORT: '', ADMIN_ANALYSTS: '' })).status, 503);
  const w = await adm('whoami');
  eq('owner is recognised', [w.status, w.body.role, w.body.canWrite], [200, 'owner', true]);
  eq('letter case in the email does not matter', (await adm('whoami', {}, 'Boss@X.com')).body.role, 'owner');
  eq('someone not on the list: refused', (await adm('overview', {}, 'stranger@x.com')).status, 403);
  await adm('overview', {}, 'stranger@x.com');
  eq('the attempt is logged once, not once per try', world.fs.list('adminLog').filter(l => l.action === 'denied').map(l => l.by), ['stranger@x.com']);
  eq('unverified email: refused', (await adm('overview', {}, 'boss@x.com', { email_verified: false })).status, 403);
  eq('password sign-in (not Google): refused', (await adm('overview', {}, 'boss@x.com', { firebase: { sign_in_provider: 'password' } })).status, 403);
  eq('read-only role can look', (await adm('overview', {}, 'look@x.com')).status, 200);
  eq('read-only role cannot change Premium', (await adm('premium_set', { householdId: 'HH1', mode: 'revoke', reason: 'test run' }, 'look@x.com')).status, 403);
  eq('support cannot change Premium', (await adm('premium_set', { householdId: 'HH1', mode: 'revoke', reason: 'test run' }, 'help@x.com')).status, 403);
  eq('support cannot publish a notice', (await adm('announcement_save', { title: 'Hello there' }, 'help@x.com')).status, 403);
  eq('unknown action', (await adm('dance')).status, 400);
  const stale = await adm('premium_set', { householdId: 'HH1', mode: 'revoke', reason: 'test run' }, 'boss@x.com', { auth_time: Math.floor(Date.now() / 1000) - 7200 });
  eq('changes need a sign-in from the last 30 minutes', [stale.status, stale.body.needsFreshSignIn], [401, true]);
  eq('looking does not', (await adm('overview', {}, 'boss@x.com', { auth_time: Math.floor(Date.now() / 1000) - 7200 })).status, 200);
  eq('and the refused change did nothing', world.fs.peek('households/HH1').isPremium, true);
  eq('answers are never cached by the browser', w.headers.get('Cache-Control'), 'no-store');
  eq('another website cannot read the answer', (await call('/admin', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' })).headers.get('Access-Control-Allow-Origin'), null);
}

section('admin console: looking');
{
  adminWorld();
  const o = (await adm('overview')).body;
  eq('households: live and deleted', [o.households.live, o.households.deleted], [5, 1]);
  eq('households: new this week and this month', [o.households.last7, o.households.last30], [3, 4]);
  eq('Premium states', o.premium.states, { premium: 2, premium_expired: 0, trial: 1, trial_ended: 0, free: 2 });
  eq('expiring in 7 and 30 days, and old-field Premium', [o.premium.expiring7, o.premium.expiring30, o.premium.legacy], [1, 2, 1]);
  eq('users come from the Firebase sign-in list', [o.auth.ok, o.users.total], [true, 8]);
  eq('active in 7 and 30 days, inactive', [o.users.active7, o.users.active30, o.users.inactive30], [6, 7, 1]);
  eq('30-day retention', [o.users.retention30, o.users.retentionCohort], [75, 4]);
  eq('signups: 30 days, adding up', [o.signupsByDay.length, o.signupsByDay.reduce((a, x) => a + x.n, 0)], [30, 4]);
  eq('revenue adds up across the months', [o.revenue.total, o.revenue.byMonth.reduce((a, x) => a + x.amount, 0), o.revenue.byMonth.length], [7000, 7000, 12]);
  eq('paying and repeat-paying households', [o.premium.payingHouseholds, o.premium.repeatPayers], [2, 1]);
  eq('trial to paid', [o.premium.trialed, o.premium.converted, o.premium.conversionRate], [1, 0, 0]);
  eq('payments by status', sorted(o.payments.byStatus), { mismatch: 2, paid: 3, pending: 1 });
  eq('needs attention: total and urgent', [o.attention.total, o.attention.high], [4, 3]);
  ok('no household budget text anywhere in the overview', !JSON.stringify(o).includes('SECRET'));

  const at = (await adm('attention')).body.items;
  eq('what needs attention (the resolved one is left out)', at.map(x => x.id).sort(), ['legacy:HHL', 'pay:by_bbbbbb_0000000003', 'pay:by_cccccc_0000000004', 'short:HHS']);
  eq('worst first', at.map(x => x.severity), ['high', 'high', 'high', 'low']);
  eq('a stuck pending payment can be re-checked from the list', at.find(x => x.id === 'pay:by_bbbbbb_0000000003').canRecheck, true);

  const hs = (await adm('households')).body.rows;
  eq('every household, newest first', hs.map(r => r.id), ['HHF', 'HHS', 'HHT', 'HHL', 'HH1', 'HHD']);
  const l = hs.find(r => r.id === 'HHL');
  eq('old-field Premium shows as Premium, with its date, flagged', [l.state, l.expiry, l.legacy, l.ownerName], ['premium', plus(20), true, 'chi@x.com']);
  eq('deleted household is marked', hs.find(r => r.id === 'HHD').deleted, true);
  ok('no budgets in the household list', !JSON.stringify(hs).includes('SECRET'));

  const dl = (await adm('household', { id: 'HHL' })).body;
  eq('detail keeps the new and old Premium fields apart', [dl.premium.rootActive, dl.premium.configActive, dl.premium.configExpiry, dl.premium.legacyOnly], [false, true, plus(20), true]);
  const d1 = (await adm('household', { id: 'HH1' })).body;
  eq('members are named and the owner is marked', d1.members.map(m => [m.name, m.owner]), [['ann@x.com', true], ['ben@x.com', false]]);
  eq('payments of the household, newest first', d1.payments.map(p => p.id), ['by_aaaaaa_0000000001', 'by_aaaaaa_0000000002']);
  ok('no budgets in the household detail', !JSON.stringify(d1).includes('SECRET'));
  eq('invalid and missing household', [(await adm('household', { id: 'x' })).status, (await adm('household', { id: 'NOPE1' })).status], [400, 404]);

  world.idt.pageSize = 3;
  const u = (await adm('users')).body;
  eq('users: the whole sign-in list, even across several pages', [u.auth.ok, u.rows.length], [true, 8]);
  ok('it really asked for more than one page', world.idt.calls.filter(c => c.startsWith('GET')).length >= 3);
  eq('a phone-only account is named by its phone', u.rows.find(r => r.uid === 'u6').name, '+265999');
  eq('households per user (deleted ones do not count)', [u.rows.find(r => r.uid === 'u5').householdCount, u.rows.find(r => r.uid === 'u1').householdCount], [1, 1]);
  world.idt.pageSize = 1000; world.idt.status = 403;
  const u2 = await adm('users');
  eq('without the Authentication role the page still works and says why', [u2.status, u2.body.auth.ok, /Authentication Admin/.test(u2.body.auth.note), u2.body.rows.length], [200, false, true, 5]);
  const o2 = (await adm('overview')).body;
  eq('overview falls back too', [o2.auth.ok, o2.users.total, o2.users.active7, o2.signupsByDay], [false, 5, null, null]);
  world.idt.status = 200;

  const pr = (await adm('payments')).body.rows;
  eq('payments, newest first', pr.map(p => p.id), ['by_bbbbbb_0000000003', 'by_cccccc_0000000004', 'by_cccccc_0000000005', 'by_dddddd_0000000006', 'by_aaaaaa_0000000001', 'by_aaaaaa_0000000002']);
  eq('which ones need a look', pr.filter(p => p.look).map(p => p.id), ['by_bbbbbb_0000000003', 'by_cccccc_0000000004']);
  eq('the customer is named', pr[0].who, 'dan@x.com');
  eq('limit is respected', (await adm('payments', { limit: 2 })).body.rows.length, 2);

  const pp = (await adm('premium', {}, 'look@x.com')).body;
  eq('Premium page: expiring within 14 days', pp.expiring.map(r => r.id), ['HH1']);
  eq('Premium page: trials with days left', pp.trials.map(r => [r.id, r.trialDaysLeft]), [['HHT', 9]]);
  eq('Premium page: old-field Premium', pp.legacy.map(r => r.id), ['HHL']);

  const c = (await adm('chipereganyu')).body;
  eq('Chipereganyu: overdue first', c.rows.map(r => r.id), ['GRP1', 'GRP2']);
  eq('counts only: overdue days, contributors, paid, sent-not-confirmed, stuck, members', [c.rows[0].overdueDays, c.rows[0].contributors, c.rows[0].paid, c.rows[0].sentNotConfirmed, c.rows[0].stuck, c.rows[0].members], [4, 2, 1, 1, 1, 3]);
  eq('Chipereganyu summary', c.summary, { total: 2, byStatus: { active: 1, gathering: 1 }, overdue: 1, stuck: 1 });
  ok('no member names or amounts-per-person', !JSON.stringify(c).includes('ben@x.com') && !JSON.stringify(c).includes('"u2"'));
}

section('admin console: Premium changes');
{
  adminWorld();
  const base = { householdId: 'HHL', mode: 'extend', months: 1 };
  eq('a reason is required', (await adm('premium_set', base)).status, 400);
  eq('months must be sensible', (await adm('premium_set', { ...base, months: 0, reason: 'test run' })).status, 400);
  eq('unknown household', (await adm('premium_set', { ...base, householdId: 'NOPE1', reason: 'test run' })).status, 404);
  eq('unknown action', (await adm('premium_set', { ...base, mode: 'gift', reason: 'test run' })).status, 400);
  eq('deleted household is refused', (await adm('premium_set', { ...base, householdId: 'HHD', reason: 'test run' })).status, 400);
  eq('nothing was written by the refused ones', world.fs.list('adminLog').length, 0);

  const before = world.fs.peek('households/HHL');
  const r = await adm('premium_set', { ...base, reason: 'Paid by WhatsApp 8 Nov' });
  const want = logic.extendExpiry(plus(20), 1, Date.now());
  eq('extending old-field Premium keeps its days and moves it to the new fields', [r.status, r.body.after.expiry, r.body.after.rootExpiry, r.body.after.configActive], [200, want, want, false]);
  const hl = world.fs.peek('households/HHL');
  eq('new fields set, old copies removed', [hl.isPremium, hl.premiumExpiry, 'isPremium' in hl.config, 'premiumExpiry' in hl.config], [true, want, false, false]);
  ok('the household budget inside config is untouched', JSON.stringify(hl.config.items) === JSON.stringify(before.config.items) && hl.config.overallBudget === 800000);
  eq('stamped as an admin change', [hl.premiumAdminBy, typeof hl.premiumAdminAt], ['boss@x.com', 'number']);
  eq('owner profile premiumUntil follows', world.fs.peek('users/u3').premiumUntil.toMillis(), logic.endOfDayMs(want));
  eq('owner profile keeps its other fields', world.fs.peek('users/u3').displayName, 'Chi');
  const lg = world.fs.list('adminLog');
  eq('one log entry: who, role, what, why, before and after', [lg.length, lg[0].by, lg[0].role, lg[0].action, lg[0].target, lg[0].reason, lg[0].before.configExpiry, lg[0].after.rootExpiry],
    [1, 'boss@x.com', 'owner', 'premium_extend', 'HHL', 'Paid by WhatsApp 8 Nov', plus(20), want]);

  world.fs.seed('households/HHU', { owner: 'u5', memberUids: ['u5'], isPremium: true, config: {} });
  eq('extending Premium that has no end date is refused (set a date instead)', (await adm('premium_set', { householdId: 'HHU', mode: 'extend', months: 1, reason: 'test run' })).status, 400);

  const un = await adm('premium_set', { householdId: 'HHF', mode: 'unlimited', reason: 'Friend of the project' });
  const hf = world.fs.peek('households/HHF');
  eq('unlimited: on, no end date', [un.status, hf.isPremium, 'premiumExpiry' in hf, un.body.after.unlimited], [200, true, false, true]);
  eq('owner premiumUntil is far ahead', world.fs.peek('users/u5').premiumUntil.toMillis(), logic.endOfDayMs('2100-01-01'));
  eq('bad end dates are refused', [(await adm('premium_set', { householdId: 'HHF', mode: 'set_expiry', expiry: '31/12/2026', reason: 'test run' })).status,
    (await adm('premium_set', { householdId: 'HHF', mode: 'set_expiry', expiry: '2026-02-30', reason: 'test run' })).status,
    (await adm('premium_set', { householdId: 'HHF', mode: 'set_expiry', expiry: '2099-01-01', reason: 'test run' })).status], [400, 400, 400]);
  await adm('premium_set', { householdId: 'HHF', mode: 'set_expiry', expiry: plus(40), reason: 'Promo for the school' });
  eq('unlimited becomes dated, and the owner date comes back down', [world.fs.peek('households/HHF').premiumExpiry, world.fs.peek('users/u5').premiumUntil.toMillis()], [plus(40), logic.endOfDayMs(plus(40))]);

  const rv = await adm('premium_set', { householdId: 'HH1', mode: 'revoke', reason: 'Refunded' });
  const h1 = world.fs.peek('households/HH1');
  eq('revoked: off, no end date, state is free', [h1.isPremium, 'premiumExpiry' in h1, rv.body.after.state], [false, false, 'free']);
  eq('the owner premiumUntil that belonged to it is removed', 'premiumUntil' in world.fs.peek('users/u1'), false);
  ok('and the budget is still there', h1.config.overallBudget === 800000);

  world.fs.seed('households/HHA', { owner: 'u7', memberUids: ['u7'], isPremium: true, premiumExpiry: plus(10), config: {} });
  world.fs.seed('households/HHB', { owner: 'u7', memberUids: ['u7'], isPremium: true, premiumExpiry: plus(60), config: {} });
  world.fs.seed('users/u7', { displayName: 'Gee', premiumUntil: tsFromMillis(logic.endOfDayMs(plus(60))) });
  await adm('premium_set', { householdId: 'HHA', mode: 'revoke', reason: 'Duplicate account' });
  eq('revoking one household does not take Premium away from the owner\'s other household', world.fs.peek('users/u7').premiumUntil.toMillis(), logic.endOfDayMs(plus(60)));

  world.fs.seed('households/HHM', { owner: 'u2', memberUids: ['u2'], config: { isPremium: true, premiumExpiry: plus(9), premiumActivatedAt: '2026-10-01T00:00:00.000Z', overallBudget: 5 } });
  const td = await adm('premium_set', { householdId: 'HHM', mode: 'tidy', reason: 'Move to the new fields' });
  const hm = world.fs.peek('households/HHM');
  eq('tidy: same date, now in the new fields, old copies gone, budget kept', [td.status, hm.isPremium, hm.premiumExpiry, Object.keys(hm.config)], [200, true, plus(9), ['overallBudget']]);
  eq('tidy on a household with no Premium is refused', (await adm('premium_set', { householdId: 'HHT', mode: 'tidy', reason: 'test run' })).status, 400);

  const rp = await adm('premium_set', { householdId: 'HHS', mode: 'extend', months: 1, reason: 'Paid cash at the office', recordPayment: { amount: 1500 } });
  const pd = world.fs.peek('payments/' + rp.body.paymentId);
  eq('a manual payment is recorded for the books', [pd.status, pd.source, pd.amount, pd.householdId, pd.uid, pd.by, pd.premiumExpiry], ['paid', 'manual', 1500, 'HHS', 'u6', 'boss@x.com', logic.extendExpiry(null, 1, Date.now())]);
  eq('and it counts as revenue', (await adm('overview')).body.revenue.total, 8500);
  eq('bad payment amounts are refused', (await adm('premium_set', { householdId: 'HHS', mode: 'extend', months: 1, reason: 'test run', recordPayment: { amount: 'lots' } })).status, 400);
  eq('a payment cannot be recorded when revoking', (await adm('premium_set', { householdId: 'HHS', mode: 'revoke', reason: 'test run', recordPayment: { amount: 1500 } })).status, 400);

  const keep = JSON.stringify(world.fs.peek('households/HHT')), logs = world.fs.list('adminLog').length;
  world.fs.failCommits = 5;
  const bad = await adm('premium_set', { householdId: 'HHT', mode: 'extend', months: 1, reason: 'test run' });
  world.fs.failCommits = 0;
  eq('if the database refuses halfway, nothing changes and nothing is logged', [bad.status, JSON.stringify(world.fs.peek('households/HHT')) === keep, world.fs.list('adminLog').length], [500, true, logs]);
}

section('admin console: payments');
{
  adminWorld();
  const PEND = 'by_bbbbbb_0000000003';
  world.pc.results[PEND] = { amount: 1500 };
  const rc = await adm('recheck_payment', { txRef: PEND }, 'help@x.com');
  eq('support can re-check: PayChangu says paid, so Premium switches on', [rc.status, rc.body.status, world.fs.peek('households/HHT').isPremium], [200, 'paid', true]);
  const lg = world.fs.list('adminLog')[0];
  eq('and it is logged', [lg.action, lg.by, lg.role, lg.target, lg.after.status], ['payment_recheck', 'help@x.com', 'support', PEND, 'paid']);
  eq('bad and unknown references', [(await adm('recheck_payment', { txRef: 'nope' })).status, (await adm('recheck_payment', { txRef: 'by_zzzzzz_0123456789' })).status], [400, 404]);

  const OLD = 'by_eeeeee_0000000007';
  world.fs.seed('payments/' + OLD, { uid: 'u5', householdId: 'HHF', months: 1, amount: 1500, currency: 'MWK', status: 'expired', createdAtMs: Date.now() - 5 * DAY });
  world.pc.results[OLD] = { amount: 1500 };
  eq('a closed payment stays closed without "reopen"', (await adm('recheck_payment', { txRef: OLD }, 'help@x.com')).body.status, 'expired');
  eq('support cannot reopen', (await adm('recheck_payment', { txRef: OLD, force: true }, 'help@x.com')).status, 403);
  const fo = await adm('recheck_payment', { txRef: OLD, force: true });
  eq('the owner can reopen a payment the customer made late', [fo.body.reopened, fo.body.status, world.fs.peek('households/HHF').isPremium], [true, 'paid', true]);

  const MIS = 'by_cccccc_0000000004';
  eq('support can add a note and mark it reviewed', (await adm('payment_note', { txRef: MIS, note: 'Refunded MK500 by hand', resolved: true }, 'help@x.com')).status, 200);
  eq('it leaves the attention list', (await adm('attention')).body.items.some(x => x.id === 'pay:' + MIS), false);
  const row = (await adm('payments')).body.rows.find(p => p.id === MIS);
  eq('and the note shows in the payments list', [row.resolved, row.adminNote, row.look], [true, 'Refunded MK500 by hand', null]);
  eq('an empty note is refused', (await adm('payment_note', { txRef: MIS, note: '' }, 'help@x.com')).status, 400);
  eq('the read-only role cannot add notes', (await adm('payment_note', { txRef: MIS, note: 'hello' }, 'look@x.com')).status, 403);
}

section('admin console: accounts');
{
  adminWorld();
  const dis = await adm('user_disable', { uid: 'u5', reason: 'Reported for abuse' });
  eq('owner disables an account', [dis.status, world.idt.users.find(u => u.localId === 'u5').disabled], [200, true]);
  const lg = world.fs.list('adminLog')[0];
  eq('logged with before and after', [lg.action, lg.target, lg.before.disabled, lg.after.disabled, lg.reason], ['user_disable', 'u5', false, true, 'Reported for abuse']);
  eq('a reason is required', (await adm('user_disable', { uid: 'u4' })).status, 400);
  eq('your own account cannot be disabled', (await adm('user_disable', { uid: 'adm-boss', reason: 'test run' })).status, 400);
  eq('nor any other admin', (await adm('user_disable', { uid: 'adm-help', reason: 'test run' })).status, 400);
  eq('support cannot disable accounts', (await adm('user_disable', { uid: 'u4', reason: 'test run' }, 'help@x.com')).status, 403);
  eq('unknown account', (await adm('user_disable', { uid: 'nobody1', reason: 'test run' })).status, 404);
  eq('enabling again', [(await adm('user_disable', { uid: 'u5', disabled: false, reason: 'My mistake' })).body.disabled, world.idt.users.find(u => u.localId === 'u5').disabled], [false, false]);
  world.idt.status = 403;
  const no = await adm('user_disable', { uid: 'u4', reason: 'test run' });
  eq('without the Authentication role it says what to fix', [no.status, /Authentication Admin/.test(no.body.error)], [403, true]);
}

section('admin console: notices and maintenance');
{
  adminWorld();
  const pub = async q => { const r = await call('/public' + q, { headers: { Origin: 'https://rodart265.github.io' } }); return { status: r.status, body: await r.json(), headers: r.headers }; };
  let f = await pub('?plan=free&lang=en');
  eq('nothing published yet', [f.status, f.body], [200, { notices: [], maintenance: { on: false } }]);
  ok('anyone can read it, and browsers may keep it for a minute', f.headers.get('Cache-Control') === 'public, max-age=60' && f.headers.get('Access-Control-Allow-Origin') === 'https://rodart265.github.io');
  eq('a notice needs a title', (await adm('announcement_save', { title: 'a' })).status, 400);
  const a1 = await adm('announcement_save', { title: 'Planned update', body: 'Bajeti Yanga updates on Friday.', audience: 'all', lang: 'all', kind: 'info' });
  await adm('announcement_save', { title: 'Premium offer', body: 'Half price this week', audience: 'free', lang: 'en', kind: 'warning' });
  await adm('announcement_save', { title: 'Kuwonjezeredwa', body: 'x', audience: 'premium', lang: 'cw' });
  await adm('announcement_save', { title: 'Old news', body: 'x', endsAtMs: Date.now() - 1000 });
  await adm('announcement_save', { title: 'Coming later', body: 'x', startsAtMs: Date.now() + DAY });
  await adm('announcement_save', { title: 'Switched off', body: 'x', active: false });
  const titles = x => x.body.notices.map(n => n.title).sort();
  eq('free + English', titles(await pub('?plan=free&lang=en')), ['Planned update', 'Premium offer']);
  eq('Premium + English', titles(await pub('?plan=premium&lang=en')), ['Planned update']);
  eq('Premium + Chichewa', titles(await pub('?plan=premium&lang=cw')), ['Kuwonjezeredwa', 'Planned update']);
  f = await pub('?plan=free&lang=en');
  eq('ended, not-yet-started and switched-off notices are not sent, and only public fields are', [f.body.notices.length, Object.keys(f.body.notices[0]).sort()], [2, ['body', 'id', 'kind', 'title']]);
  eq('end before start is refused', (await adm('announcement_save', { title: 'Backwards', startsAtMs: Date.now() + 2 * DAY, endsAtMs: Date.now() + DAY })).status, 400);
  const id = a1.body.id, was = world.fs.peek('announcements/' + id);
  await adm('announcement_save', { id, title: 'Planned update (moved)', body: 'Saturday', audience: 'all', lang: 'all' });
  const now1 = world.fs.peek('announcements/' + id);
  eq('editing keeps who made it and when', [now1.createdBy, now1.createdAtMs, now1.title], [was.createdBy, was.createdAtMs, 'Planned update (moved)']);
  eq('deleting', [(await adm('announcement_delete', { id })).status, world.fs.peek('announcements/' + id)], [200, undefined]);
  eq('deleting what is gone', (await adm('announcement_delete', { id })).status, 404);
  eq('the list for admins includes the switched-off ones', (await adm('announcements', {}, 'look@x.com')).body.rows.some(r => r.title === 'Switched off'), true);

  eq('maintenance needs a message', (await adm('settings_save', { maintenanceOn: true, maintenanceMessage: '' })).status, 400);
  await adm('settings_save', { maintenanceOn: true, maintenanceMessage: 'Back at 14:00' });
  eq('maintenance shows in the public feed', (await pub('?plan=free&lang=en')).body.maintenance, { on: true, message: 'Back at 14:00' });
  eq('only the owner sees who the admins are', [(await adm('settings')).body.admins.owner, (await adm('settings', {}, 'help@x.com')).body.admins], [['boss@x.com'], null]);
  await adm('settings_save', { maintenanceOn: false, maintenanceMessage: '' });
  eq('and switching it off', (await pub('?plan=free&lang=en')).body.maintenance, { on: false });
  const rows = (await adm('log')).body.rows;
  eq('the activity log lists changes newest first', [rows.length > 5, rows.every((r, i) => i === 0 || rows[i - 1].atMs >= r.atMs), rows.some(r => r.action === 'settings_save' && r.by === 'boss@x.com')], [true, true, true]);
}

// Only when asked for: save real Worker answers, so the console page can be checked in a browser without a live server.
if (process.env.DUMP_FIXTURES) {
  const fsMod = await import('node:fs');
  adminWorld();
  await adm('announcement_save', { title: 'Planned update', body: 'The app will be updated on Sunday night.', audience: 'all', lang: 'all', kind: 'info', active: true });
  await adm('premium_set', { householdId: 'HHF', mode: 'extend', months: 1, reason: 'Paid by WhatsApp', recordPayment: { amount: 1500 } });
  const out = {};
  const hh = (await adm('households')).body;
  for (const [k, a, p] of [['whoami', 'whoami', {}], ['overview', 'overview', {}], ['attention', 'attention', {}], ['premium', 'premium', {}], ['households', 'households', {}], ['users', 'users', {}], ['payments', 'payments', { limit: 1000 }], ['chipereganyu', 'chipereganyu', {}], ['announcements', 'announcements', {}], ['log', 'log', { limit: 300 }], ['settings', 'settings', {}], ['household_HH1', 'household', { id: 'HH1' }], ['household_HHL', 'household', { id: 'HHL' }]])
    out[k] = (await adm(a, p)).body;
  out.ids = hh.rows.map(r => r.id);
  fsMod.writeFileSync(process.env.DUMP_FIXTURES, JSON.stringify(out, null, 1));
}

section('regression: fetch must not be called as a method (Cloudflare "Illegal invocation")');
{
  // Behaves like Cloudflare's real fetch: refuses to run if `this` is anything but undefined or the global object.
  const strictFetch = function (url, init) {
    if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation: function called with incorrect `this` reference.");
    return Promise.resolve(new Response(JSON.stringify({ fields: { a: { stringValue: 'x' } } }), { status: 200 }));
  };
  const db = new FirestoreRest({ projectId: 'bajeti-yanga', getToken: async () => 'tok', fetchImpl: strictFetch });
  const snap = await db.collection('things').doc('a').get().catch(e => ({ error: e.message }));
  eq('Firestore client calls fetch without a `this`', snap.exists, true);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
