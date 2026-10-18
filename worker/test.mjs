// Run with:  node worker/test.mjs      (Node 20+; no dependencies)
// Mints real RS256 tokens and mocks Google's key endpoint, Firestore and Gemini.
globalThis.__BAJETI_TEST__ = true;
const { default: worker } = await import('./index.js');
const { computePremium, catDate } = globalThis.__bajetiHelpers;

let passed = 0, failed = 0;
const ok = (name, cond, extra) => { if (cond) { passed++; console.log('  ok  ', name); } else { failed++; console.log('  FAIL', name, extra ?? ''); } };

const PID = 'bajeti-yanga';
const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const otherKp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);

const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function mint(over = {}, key = kp.privateKey, header = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = { alg: 'RS256', kid: 'k1', typ: 'JWT', ...header };
  const p = { aud: PID, iss: 'https://securetoken.google.com/' + PID, sub: 'user1', iat: now - 5, exp: now + 3600, ...over };
  const data = b64u(JSON.stringify(h)) + '.' + b64u(JSON.stringify(p));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data));
  return data + '.' + b64u(new Uint8Array(sig));
}

// ── mocks ────────────────────────────────────────────────────────────────────
let hhDoc = null, geminiStatus = 200, geminiCalls = 0, lastGeminiReq = null, jwksCalls = 0;
const mockFetch = async (url, init) => {
  url = String(url);
  if (url.includes('/jwk/securetoken')) { jwksCalls++; return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }); }
  if (url.includes('firestore.googleapis.com')) return hhDoc ? new Response(JSON.stringify(hhDoc), { status: 200 }) : new Response('{}', { status: 403 });
  if (url.includes('generativelanguage.googleapis.com')) {
    geminiCalls++; lastGeminiReq = { url, init };
    return new Response(JSON.stringify(geminiStatus === 200 ? { candidates: [{ content: { parts: [{ text: 'hi' }] } }] } : { error: { message: 'boom' } }), { status: geminiStatus, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error('unexpected fetch ' + url);
};
const kvStore = new Map();
const KV = { async get(k) { return kvStore.has(k) ? JSON.parse(kvStore.get(k)) : null; }, async put(k, v) { kvStore.set(k, v); } };
const baseEnv = () => ({ GEMINI_API_KEY: 'gk', GEMINI_MODEL: 'test-model', QUOTA: KV, ALLOW_LEGACY_SECRET: 'false' });

const goodBody = { contents: [{ role: 'user', parts: [{ text: 'hello' }] }] };
async function call({ token, headers = {}, body = goodBody, env = baseEnv(), method = 'POST', path = '/chat' }) {
  const h = { 'Content-Type': 'application/json', Origin: 'https://rodart265.github.io', ...headers };
  if (token) h.Authorization = 'Bearer ' + token;
  const req = new Request('https://w.example' + path, { method, headers: h, body: method === 'POST' ? JSON.stringify(body) : undefined });
  const res = await worker.fetch(req, env, {}, { fetch: mockFetch });
  let data = null; try { data = await res.clone().json(); } catch (_) {}
  return { res, data };
}
const fsDoc = fields => ({ fields });
const member = { memberUids: { arrayValue: { values: [{ stringValue: 'user1' }] } } };

console.log('\nAuthentication');
{
  let r = await call({});
  ok('no credentials -> 401', r.res.status === 401 && r.data.error.code === 'unauthenticated');
  r = await call({ token: await mint() });
  ok('valid token -> 200 and reaches Gemini', r.res.status === 200 && geminiCalls === 1);
  ok('Gemini gets the server key + model, not anything from the client', lastGeminiReq.init.headers['x-goog-api-key'] === 'gk' && lastGeminiReq.url.includes('/models/test-model:'));
  r = await call({ token: await mint({}, otherKp.privateKey) });
  ok('token signed by a different key -> 401', r.res.status === 401);
  r = await call({ token: await mint({ exp: Math.floor(Date.now() / 1000) - 10 }) });
  ok('expired token -> 401', r.res.status === 401);
  r = await call({ token: await mint({ aud: 'some-other-project' }) });
  ok('token for another Firebase project -> 401', r.res.status === 401);
  r = await call({ token: await mint({ iss: 'https://evil.example/' + PID }) });
  ok('wrong issuer -> 401', r.res.status === 401);
  r = await call({ token: await mint({}, kp.privateKey, { alg: 'none' }) });
  ok('alg none -> 401', r.res.status === 401);
  r = await call({ token: await mint({ sub: '' }) });
  ok('empty subject -> 401', r.res.status === 401);
  r = await call({ token: await mint({}, kp.privateKey, { kid: 'nope' }) });
  ok('unknown key id -> 401', r.res.status === 401);
  const before = jwksCalls; await call({ token: await mint() }); await call({ token: await mint() });
  ok('public keys are cached, not fetched on every request', jwksCalls === before);
}

console.log('\nLegacy secret (transition)');
{
  let env = { ...baseEnv(), ALLOW_LEGACY_SECRET: 'true', BAJETI_SECRET: 's3cret' };
  let r = await call({ headers: { 'X-Bajeti-Secret': 's3cret' }, env });
  ok('old secret accepted while ALLOW_LEGACY_SECRET=true', r.res.status === 200);
  r = await call({ headers: { 'X-Bajeti-Secret': 'wrong' }, env });
  ok('wrong secret rejected', r.res.status === 401);
  env = { ...baseEnv(), ALLOW_LEGACY_SECRET: 'false', BAJETI_SECRET: 's3cret' };
  r = await call({ headers: { 'X-Bajeti-Secret': 's3cret' }, env });
  ok('old secret rejected once ALLOW_LEGACY_SECRET=false', r.res.status === 401);
}

console.log('\nRequest validation');
{
  const t = await mint();
  let r = await call({ token: t, body: { contents: [{ parts: [{ text: 'x' }] }], tools: [{ googleSearch: {} }] } });
  ok('extra fields such as tools are stripped, not forwarded', r.res.status === 200 && !('tools' in JSON.parse(lastGeminiReq.init.body)));
  r = await call({ token: t, body: { nope: 1 } });
  ok('body without contents -> 400', r.res.status === 400);
  r = await call({ token: t, body: { contents: [{ parts: [{ inline_data: { mime_type: 'application/pdf', data: 'AAAA' } }] }] } });
  ok('non-image attachment -> 400', r.res.status === 400);
  r = await call({ token: t, body: { contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: 'AAAA' } }, { text: 'read' }] }] } });
  ok('image + text accepted', r.res.status === 200);
  r = await call({ token: t, body: { contents: [{ role: 'system', parts: [{ text: 'x' }] }] } });
  ok('bad role -> 400', r.res.status === 400);
  r = await call({ token: t, body: { contents: [{ parts: [{ text: 'x'.repeat(90000) }] }] } });
  ok('oversized text -> 400', r.res.status === 400);
  r = await call({ token: t, body: { contents: goodBody.contents, generationConfig: { maxOutputTokens: 999999, temperature: 0.2, stopSequences: ['x'] } } });
  const fwd = JSON.parse(lastGeminiReq.init.body).generationConfig;
  ok('generationConfig limited to safe keys and capped', fwd.maxOutputTokens === 4096 && fwd.temperature === 0.2 && !('stopSequences' in fwd));
  r = await call({ token: t, method: 'GET' });
  ok('GET /chat -> 405', r.res.status === 405);
  r = await call({ token: t, path: '/other' });
  ok('unknown path -> 404', r.res.status === 404);
  r = await call({ token: t, env: { ...baseEnv(), GEMINI_MODEL: '' } });
  ok('missing GEMINI_MODEL -> clear 500, not a silent guess', r.res.status === 500 && r.data.error.code === 'not_configured');
}

console.log('\nCORS');
{
  const req = new Request('https://w.example/chat', { method: 'OPTIONS', headers: { Origin: 'https://rodart265.github.io' } });
  const res = await worker.fetch(req, baseEnv(), {}, { fetch: mockFetch });
  ok('preflight allowed for the app origin', res.status === 204 && res.headers.get('Access-Control-Allow-Origin') === 'https://rodart265.github.io');
  const r2 = await worker.fetch(new Request('https://w.example/chat', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), baseEnv(), {}, { fetch: mockFetch });
  ok('no CORS grant for other origins', !r2.headers.get('Access-Control-Allow-Origin'));
  const r3 = await call({ token: await mint() });
  ok('response carries CORS header for the app origin', r3.res.headers.get('Access-Control-Allow-Origin') === 'https://rodart265.github.io');
}

console.log('\nDaily limits');
{
  kvStore.clear(); hhDoc = fsDoc({ ...member });           // member, no premium, no trial => free
  const t = await mint(); const H = { 'X-Household': 'abc12345', 'X-AI-Feature': 'scan' };
  let last;
  for (let i = 0; i < 5; i++) last = await call({ token: t, headers: H });
  ok('free household: 5 scans allowed', last.res.status === 200);
  last = await call({ token: t, headers: H });
  ok('free household: 6th scan -> 429 quota_exceeded', last.res.status === 429 && last.data.error.code === 'quota_exceeded');
  last = await call({ token: t, headers: { ...H, 'X-AI-Feature': 'summ' } });
  ok('limits are per feature (summary still allowed)', last.res.status === 200);

  kvStore.clear(); hhDoc = fsDoc({ ...member, isPremium: { booleanValue: true }, premiumExpiry: { stringValue: '2099-01-01' } });
  premiumCacheBust();
  for (let i = 0; i < 12; i++) last = await call({ token: await mint({ sub: 'user1' }), headers: { ...H, 'X-Household': 'prem0001' } });
  ok('premium household: not limited per feature', last.res.status === 200);

  kvStore.clear(); hhDoc = fsDoc({ ...member });
  const env = { ...baseEnv(), HARD_DAILY_CAP: '3' };
  for (let i = 0; i < 3; i++) last = await call({ token: await mint({ sub: 'capped' }), env });
  last = await call({ token: await mint({ sub: 'capped' }), env });
  ok('hard daily cap applies to everyone, even with no feature header', last.res.status === 429);

  kvStore.clear(); hhDoc = fsDoc({ ...member });
  geminiStatus = 500;
  for (let i = 0; i < 8; i++) last = await call({ token: await mint({ sub: 'refund' }), headers: { ...H, 'X-Household': 'refund01' } });
  geminiStatus = 200;
  last = await call({ token: await mint({ sub: 'refund' }), headers: { ...H, 'X-Household': 'refund01' } });
  ok('failed Gemini calls do not use up the daily allowance', last.res.status === 200);

  kvStore.clear(); hhDoc = null;                            // Firestore read denied -> cannot tell -> do not block
  for (let i = 0; i < 8; i++) last = await call({ token: await mint({ sub: 'unknown' }), headers: { ...H, 'X-Household': 'nothere1' } });
  ok('cannot verify household -> fails open (no per-feature block)', last.res.status === 200);

  const noKv = { ...baseEnv(), QUOTA: undefined };
  last = await call({ token: await mint({ sub: 'nokv' }), headers: H, env: noKv });
  ok('works without a KV binding (no counting)', last.res.status === 200);
}
function premiumCacheBust() { /* cache keys include uid|household; distinct household ids above avoid collisions */ }

console.log('\nPremium rules mirror the app');
{
  const NOW = Date.UTC(2026, 9, 18, 10, 0, 0);
  const mk = f => ({ fields: { ...member, ...f } });
  const env = {};
  ok('not a member -> unknown (null)', computePremium({ fields: { memberUids: { arrayValue: { values: [{ stringValue: 'someone' }] } } } }, 'user1', env, NOW) === null);
  ok('premium, no expiry -> true', computePremium(mk({ isPremium: { booleanValue: true } }), 'user1', env, NOW) === true);
  ok('premium, expiry in future -> true', computePremium(mk({ isPremium: { booleanValue: true }, premiumExpiry: { stringValue: '2026-12-31' } }), 'user1', env, NOW) === true);
  ok('premium, expired yesterday -> false', computePremium(mk({ isPremium: { booleanValue: true }, premiumExpiry: { stringValue: '2026-10-17' } }), 'user1', env, NOW) === false);
  ok('expiry day itself counts until 23:59 Malawi time', computePremium(mk({ isPremium: { booleanValue: true }, premiumExpiry: { stringValue: '2026-10-18' } }), 'user1', env, NOW) === true);
  const day = Date.UTC(2026, 9, 18, 22, 30, 0);   // 00:30 on the 19th in Malawi
  ok('...and ends once Malawi midnight has passed', computePremium(mk({ isPremium: { booleanValue: true }, premiumExpiry: { stringValue: '2026-10-18' } }), 'user1', env, day) === false);
  ok('trial started 3 days ago (root timestamp) -> true', computePremium(mk({ trialStarted: { timestampValue: new Date(NOW - 3 * 86400000).toISOString() } }), 'user1', env, NOW) === true);
  ok('trial started 20 days ago -> false', computePremium(mk({ trialStarted: { timestampValue: new Date(NOW - 20 * 86400000).toISOString() } }), 'user1', env, NOW) === false);
  ok('no trial, no premium -> false', computePremium(mk({}), 'user1', env, NOW) === false);
  const legacy = mk({ config: { mapValue: { fields: { isPremium: { booleanValue: true } } } } });
  ok('legacy config.isPremium trusted while TRUST_CONFIG_PREMIUM unset', computePremium(legacy, 'user1', {}, NOW) === true);
  ok('legacy config.isPremium ignored once TRUST_CONFIG_PREMIUM=false', computePremium(legacy, 'user1', { TRUST_CONFIG_PREMIUM: 'false' }, NOW) === false);
  ok('date helper: Malawi date rolls at 22:00 UTC', catDate(Date.UTC(2026, 9, 18, 22, 0, 0)) === '2026-10-19' && catDate(Date.UTC(2026, 9, 18, 21, 59, 0)) === '2026-10-18');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
