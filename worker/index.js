// Bajeti Yanga AI proxy — Cloudflare Worker (replaces the current `nyumba-ai` Worker).
//
// What it does, in order, for POST /chat:
//   1. Works out WHO is asking: a Firebase sign-in token (checked here with Google's public keys, no
//      network call per request) or, during the transition only, the old shared secret.
//   2. Refuses anything that is not a plain Gemini "contents" request (no tools, no other models).
//   3. Applies daily limits on the SERVER, where they cannot be reset from the browser:
//        - free households: per-feature limits (chat 10, magic 5, scan 5, summary 5 a day)
//        - everyone: a hard daily cap per person, so "unlimited" Premium still has a ceiling on cost
//   4. Forwards the request to Gemini with the API key that only this Worker knows.
//
// Setup (Cloudflare dashboard -> Workers -> your worker -> Settings -> Variables and Secrets):
//   Secret   GEMINI_API_KEY      the Gemini key (use whatever your current Worker already has)
//   Variable GEMINI_MODEL        REQUIRED. Copy the model name your CURRENT Worker uses (the part after
//                                /models/ in its Gemini URL). Not guessed here on purpose.
//   Variable ALLOW_LEGACY_SECRET "true" while old installed copies of the app still send the old header,
//                                then "false" (see docs/ROLLOUT-2026-10.md).
//   Secret   BAJETI_SECRET       the OLD shared secret, only needed while ALLOW_LEGACY_SECRET is "true".
//   Variable TRUST_CONFIG_PREMIUM "true" (default) until migrate-premium.js has been run, then "false".
//   KV       QUOTA               optional KV namespace binding for the daily counters. Without it the Worker
//                                still works but cannot count, so no daily limits are enforced.
//   Optional variables: FIREBASE_PROJECT_ID (bajeti-yanga), ALLOWED_ORIGINS (https://rodart265.github.io),
//   FREE_DAILY_MSGS (10), FREE_DAILY_MAGIC (5), FREE_DAILY_SCAN (5), FREE_DAILY_SUMM (5),
//   HARD_DAILY_CAP (300), LEGACY_DAILY_CAP (1000), TRIAL_DAYS (14).

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MAX_BODY_BYTES = 12 * 1024 * 1024;       // a phone photo as base64 is ~6-8 MB
const MAX_TEXT_CHARS = 80000;
const MAX_CONTENTS = 80;
const FEATURES = ['msg', 'magic', 'scan', 'summ'];
const ALLOWED_GEN_KEYS = ['temperature', 'topP', 'topK', 'maxOutputTokens', 'responseMimeType'];
const ALLOWED_MIME = /^image\/(jpeg|png|webp|heic|heif)$/;
const CAT_OFFSET_MS = 2 * 3600 * 1000;           // Malawi is UTC+2, no daylight saving

// ── tiny helpers ─────────────────────────────────────────────────────────────
const enc = new TextEncoder();
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64urlToJson = s => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

function safeEqual(a, b) {                       // constant-time string compare
  a = enc.encode(String(a)); b = enc.encode(String(b));
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

function catDate(now = Date.now()) {            // YYYY-MM-DD in Malawi time, matches the app's own "today"
  return new Date(now + CAT_OFFSET_MS).toISOString().slice(0, 10);
}

function corsHeaders(req, env) {
  const allowed = String(env.ALLOWED_ORIGINS || 'https://rodart265.github.io').split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.get('Origin');
  const h = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Household, X-AI-Feature, X-Bajeti-Secret',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(obj, status, req, env, extra) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(req, env), ...(extra || {}) },
  });
}
const fail = (status, code, message, req, env) => json({ error: { code, message } }, status, req, env);

// ── Firebase ID token verification (RS256, Google's public keys) ─────────────
let jwksCache = { keys: null, at: 0, tried: 0 };

async function getKey(kid, fetchImpl) {
  const now = Date.now();
  const fresh = jwksCache.keys && now - jwksCache.at < 6 * 3600 * 1000;
  let jwk = fresh ? jwksCache.keys.find(k => k.kid === kid) : null;
  if (!jwk && now - jwksCache.tried > 60 * 1000) {          // refetch, but at most once a minute
    jwksCache.tried = now;
    const r = await fetchImpl(JWKS_URL);
    if (!r.ok) throw new Error('jwks fetch failed');
    const body = await r.json();
    jwksCache = { keys: body.keys || [], at: now, tried: now };
    jwk = jwksCache.keys.find(k => k.kid === kid);
  }
  if (!jwk) throw new Error('unknown key id');
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

async function verifyFirebaseToken(token, env, fetchImpl = fetch) {
  const projectId = env.FIREBASE_PROJECT_ID || 'bajeti-yanga';
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('malformed');
  const header = b64urlToJson(parts[0]);
  const payload = b64urlToJson(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('bad header');
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new Error('wrong audience');
  if (payload.iss !== 'https://securetoken.google.com/' + projectId) throw new Error('wrong issuer');
  if (!(payload.exp > now)) throw new Error('expired');
  if (!(payload.iat <= now + 60)) throw new Error('issued in the future');
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) throw new Error('bad subject');
  const key = await getKey(header.kid, fetchImpl);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('bad signature');
  return payload.sub;
}

// ── Premium / trial status of a household, read with the caller's own token ──
// Rules decide who may read: a non-member simply gets "unknown" and is treated as free-tier-unverified.
const premiumCache = new Map();                  // `${uid}|${hh}` -> { at, value }

function fv(f) {                                 // Firestore REST value -> JS
  if (!f) return undefined;
  if ('booleanValue' in f) return f.booleanValue;
  if ('stringValue' in f) return f.stringValue;
  if ('timestampValue' in f) return f.timestampValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(fv);
  if ('mapValue' in f) { const o = {}; const m = f.mapValue.fields || {}; for (const k in m) o[k] = fv(m[k]); return o; }
  return undefined;
}

function expiryEndMs(e) {
  const s = String(e || '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], 23, 59, 59) - CAT_OFFSET_MS;   // end of that day, Malawi time
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? NaN : t;
}

// Mirrors getPremiumStatus() in index.html. Returns true / false, or null when it cannot be told.
function computePremium(doc, uid, env, now = Date.now()) {
  const root = {}; const f = doc.fields || {};
  for (const k in f) root[k] = fv(f[k]);
  if (!Array.isArray(root.memberUids) || !root.memberUids.includes(uid)) return null;     // not a member: no say
  const trustCfg = String(env.TRUST_CONFIG_PREMIUM || 'true') !== 'false';
  const cfg = trustCfg && root.config && typeof root.config === 'object' ? root.config : {};
  const isPrem = root.isPremium === true || cfg.isPremium === true;
  const expiry = root.premiumExpiry || cfg.premiumExpiry || null;
  if (isPrem) {
    if (!expiry) return true;
    const end = expiryEndMs(expiry);
    return Number.isNaN(end) ? false : end >= now;
  }
  const started = root.trialStarted || cfg.trialStarted || null;
  if (!started) return false;
  const startMs = new Date(started).getTime();
  if (Number.isNaN(startMs)) return false;
  const days = num(env.TRIAL_DAYS, 14);
  return Math.floor((now - startMs) / 86400000) < days;
}

async function isHouseholdPremium(idToken, uid, hh, env, fetchImpl = fetch) {
  if (!hh || !/^[A-Za-z0-9_-]{3,40}$/.test(hh)) return null;
  const ck = uid + '|' + hh;
  const hit = premiumCache.get(ck);
  if (hit && Date.now() - hit.at < 60 * 1000) return hit.value;
  let value = null;
  try {
    const pid = env.FIREBASE_PROJECT_ID || 'bajeti-yanga';
    const r = await fetchImpl(`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/households/${encodeURIComponent(hh)}`,
      { headers: { Authorization: 'Bearer ' + idToken } });
    if (r.ok) value = computePremium(await r.json(), uid, env);
  } catch (_) { value = null; }
  if (premiumCache.size > 500) premiumCache.clear();
  premiumCache.set(ck, { at: Date.now(), value });
  return value;
}

// ── Daily counters (KV). Never blocks a request because of a storage problem. ─
async function readCounts(env, key) {
  if (!env.QUOTA) return null;
  try { return (await env.QUOTA.get(key, 'json')) || { msg: 0, magic: 0, scan: 0, summ: 0, total: 0 }; }
  catch (_) { return null; }
}
async function writeCounts(env, key, counts) {
  if (!env.QUOTA) return;
  try { await env.QUOTA.put(key, JSON.stringify(counts), { expirationTtl: 3 * 86400 }); } catch (_) { /* fail open */ }
}

// ── Request validation: only a plain Gemini generateContent body gets through ─
function sanitizeBody(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.contents)) return null;
  if (raw.contents.length < 1 || raw.contents.length > MAX_CONTENTS) return null;
  let chars = 0;
  const cleanParts = parts => {
    if (!Array.isArray(parts) || parts.length < 1 || parts.length > 20) return null;
    const out = [];
    for (const p of parts) {
      if (p && typeof p.text === 'string') { chars += p.text.length; out.push({ text: p.text }); }
      else if (p && (p.inline_data || p.inlineData)) {
        const d = p.inline_data || p.inlineData;
        const mime = d.mime_type || d.mimeType;
        if (typeof mime !== 'string' || !ALLOWED_MIME.test(mime) || typeof d.data !== 'string') return null;
        out.push({ inline_data: { mime_type: mime, data: d.data } });
      } else return null;
    }
    return out;
  };
  const contents = [];
  for (const c of raw.contents) {
    if (!c || (c.role !== undefined && c.role !== 'user' && c.role !== 'model')) return null;
    const parts = cleanParts(c.parts);
    if (!parts) return null;
    contents.push(c.role ? { role: c.role, parts } : { parts });
  }
  const body = { contents };
  if (raw.systemInstruction !== undefined) {
    const parts = cleanParts(raw.systemInstruction && raw.systemInstruction.parts);
    if (!parts) return null;
    body.systemInstruction = { parts };
  }
  if (raw.generationConfig && typeof raw.generationConfig === 'object') {
    const g = {};
    for (const k of ALLOWED_GEN_KEYS) if (raw.generationConfig[k] !== undefined) g[k] = raw.generationConfig[k];
    if (g.maxOutputTokens !== undefined) g.maxOutputTokens = Math.min(num(g.maxOutputTokens, 1024), 4096);
    if (Object.keys(g).length) body.generationConfig = g;
  }
  return chars > MAX_TEXT_CHARS ? null : body;
}

// ── main handler ─────────────────────────────────────────────────────────────
export default {
  async fetch(req, env, ctx, deps = {}) {
    const fetchImpl = deps.fetch || fetch;
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req, env) });
    if (url.pathname === '/' && req.method === 'GET') return new Response('ok', { status: 200 });
    if (url.pathname !== '/chat') return fail(404, 'not_found', 'Not found', req, env);
    if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'POST only', req, env);

    if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL)
      return fail(500, 'not_configured', 'Worker is not configured (GEMINI_API_KEY / GEMINI_MODEL).', req, env);

    // 1. who is asking
    let uid = null, idToken = null, legacy = false;
    const auth = req.headers.get('Authorization') || '';
    if (auth.startsWith('Bearer ')) {
      idToken = auth.slice(7);
      try { uid = await verifyFirebaseToken(idToken, env, fetchImpl); } catch (_) { uid = null; }
    }
    if (!uid && String(env.ALLOW_LEGACY_SECRET) === 'true' && env.BAJETI_SECRET) {
      const sent = req.headers.get('X-Bajeti-Secret');
      if (sent && safeEqual(sent, env.BAJETI_SECRET)) { legacy = true; uid = 'legacy:' + (req.headers.get('CF-Connecting-IP') || 'unknown'); }
    }
    if (!uid) return fail(401, 'unauthenticated', 'Please sign in again.', req, env);

    // 2. what they are asking for
    const len = Number(req.headers.get('Content-Length') || 0);
    if (len > MAX_BODY_BYTES) return fail(413, 'too_large', 'Request too large.', req, env);
    let raw;
    try { raw = await req.json(); } catch (_) { return fail(400, 'bad_request', 'Invalid JSON.', req, env); }
    const body = sanitizeBody(raw);
    if (!body) return fail(400, 'bad_request', 'Unsupported request.', req, env);

    // 3. daily limits
    const featureHeader = req.headers.get('X-AI-Feature');
    const feature = FEATURES.includes(featureHeader) ? featureHeader : null;
    const key = `u:${uid}:${catDate()}`;
    const counts = await readCounts(env, key);
    if (counts) {
      const hardCap = legacy ? num(env.LEGACY_DAILY_CAP, 1000) : num(env.HARD_DAILY_CAP, 300);
      if (counts.total >= hardCap) return fail(429, 'quota_exceeded', 'Daily limit reached.', req, env);
      if (feature && !legacy) {
        const premium = await isHouseholdPremium(idToken, uid, req.headers.get('X-Household'), env, fetchImpl);
        if (premium === false) {                         // only enforce when we KNOW it is a free household
          const limit = num(env['FREE_DAILY_' + { msg: 'MSGS', magic: 'MAGIC', scan: 'SCAN', summ: 'SUMM' }[feature]],
            { msg: 10, magic: 5, scan: 5, summ: 5 }[feature]);
          if ((counts[feature] || 0) >= limit) return fail(429, 'quota_exceeded', 'Daily limit reached.', req, env);
        }
      }
      counts.total = (counts.total || 0) + 1;
      if (feature) counts[feature] = (counts[feature] || 0) + 1;
      await writeCounts(env, key, counts);
    }

    // 4. Gemini
    let up;
    try {
      up = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify(body),
      });
    } catch (_) {
      up = null;
    }
    if (!up || !up.ok) {                                // give the person their use back; it did not work
      if (counts) {
        counts.total = Math.max(0, (counts.total || 1) - 1);
        if (feature) counts[feature] = Math.max(0, (counts[feature] || 1) - 1);
        await writeCounts(env, key, counts);
      }
    }
    if (!up) return fail(502, 'upstream_unreachable', 'AI service is unreachable.', req, env);
    const text = await up.text();
    return new Response(text, {
      status: up.status,
      headers: { 'Content-Type': up.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(req, env) },
    });
  },
};

// Test hook: only does anything when worker/test.mjs sets the flag first. Cloudflare never sets it, and the file
// has no named exports (the dashboard editor only needs the default export).
if (globalThis.__BAJETI_TEST__) globalThis.__bajetiHelpers = { verifyFirebaseToken, computePremium, sanitizeBody, expiryEndMs, catDate };
