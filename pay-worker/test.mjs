// Run:  node pay-worker/test.mjs      (no install needed; Node 18+)
// Everything runs against pretend services: a fake Firestore that speaks Google's REST format (including "someone else
// changed it first" conflicts), a scripted PayChangu, and fake Google sign-in / key endpoints. Nothing leaves this computer.
import * as logic from './src/logic.js';
import { FirestoreRest, makeTokenProvider, tsFromMillis, Ts, encodeFields, decodeFields, decodeValue } from './src/firestore.js';
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
  const docs = new Map(), ver = new Map(), txs = new Map();
  let n = 0;
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
  api.seed = (path, obj) => { docs.set(path, encodeFields(obj)); bump(path); };
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
      for (const w of body.writes) if (w.currentDocument && w.currentDocument.exists && !docs.has(pathOf(w.update.name))) return err(404, 'no such document');
      for (const w of body.writes) {
        const p = pathOf(w.update.name);
        if (w.updateMask) { const next = { ...(docs.get(p) || {}) }; for (const fp of w.updateMask.fieldPaths) { const k = unq(fp); if (k in (w.update.fields || {})) next[k] = w.update.fields[k]; else delete next[k]; } docs.set(p, next); }
        else docs.set(p, w.update.fields || {});
        bump(p);
      }
      return json(200, { writeResults: [] });
    }
    if (method === 'POST' && rest === ':runQuery') {
      const sq = body.structuredQuery, col = sq.from[0].collectionId;
      let out = [];
      for (const [p, f] of docs) { const parts = p.split('/'); if (parts.length === 2 && parts[0] === col && matches(f, sq.where)) out.push({ document: { name: ROOT + '/' + p, fields: f }, readTime: 'x' }); }
      if (sq.limit) out = out.slice(0, sq.limit);
      return json(200, out.length ? out : [{ readTime: 'x' }]);
    }
    if (rest.startsWith('/')) {
      const p = rest.slice(1).split('/').map(decodeURIComponent).join('/');
      if (method === 'GET') {
        const t = query.get('transaction');
        if (t) { const tx = txs.get(t); if (!tx) return err(400, 'unknown transaction'); if (!tx.reads.has(p)) tx.reads.set(p, ver.get(p) || 0); }
        return docs.has(p) ? json(200, { name: ROOT + '/' + p, fields: docs.get(p) }) : err(404, 'not found');
      }
      if (method === 'PATCH') {
        if (query.get('currentDocument.exists') === 'true' && !docs.has(p)) return err(404, 'no such document');
        const masks = query.getAll('updateMask.fieldPaths');
        if (masks.length) { const next = { ...(docs.get(p) || {}) }; for (const fp of masks) { const k = unq(fp); if (k in (body.fields || {})) next[k] = body.fields[k]; else delete next[k]; } docs.set(p, next); }
        else docs.set(p, body.fields || {});
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
const world = { fs: miniFirestore(), pc: scriptedPayChangu() };
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.startsWith('https://firestore.googleapis.com/')) return world.fs.fetch(url, init);
  if (url.startsWith('https://api.paychangu.com/')) return world.pc.fetch(url, init);
  if (url === 'https://oauth2.googleapis.com/token') return json(200, { access_token: 'tok', expires_in: 3600 });
  if (url.startsWith('https://www.googleapis.com/service_accounts/v1/jwk/')) return jwkFetch();
  throw new Error('unexpected network call ' + url);
};
const ENV = { PAYCHANGU_SECRET_KEY: 'sk-test', PAYCHANGU_WEBHOOK_SECRET: 'whsec', GOOGLE_SERVICE_ACCOUNT: JSON.stringify(SA), FIREBASE_PROJECT_ID: 'bajeti-yanga', APP_URL: 'https://rodart265.github.io/bajeti-yanga/', ALLOWED_ORIGINS: 'https://rodart265.github.io' };
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
