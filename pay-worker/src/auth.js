// Checks a Firebase sign-in token ("ID token") sent by the app, so the Worker knows WHICH person is asking.
// Same checks as worker/index.js (the AI Worker): Google's public keys, the right project, not expired.

const enc = new TextEncoder();
const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const KEY_TTL_MS = 60 * 60 * 1000;
let keyCache = { at: 0, keys: new Map() };

function b64urlBytes(s) {
  const t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), c => c.charCodeAt(0));
}
const b64urlJson = s => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

async function getKey(kid, fetchImpl) {
  const fresh = Date.now() - keyCache.at < KEY_TTL_MS;
  if (!fresh || !keyCache.keys.has(kid)) {
    const r = await fetchImpl(JWK_URL);
    if (!r.ok) throw new Error('could not load Google keys');
    const j = await r.json();
    const keys = new Map();
    for (const k of j.keys || []) keys.set(k.kid, k);
    keyCache = { at: Date.now(), keys };
  }
  const jwk = keyCache.keys.get(kid);
  if (!jwk) throw new Error('unknown key id');
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

export function resetKeyCache() { keyCache = { at: 0, keys: new Map() }; }

// Returns { uid, email } or throws.
export async function verifyFirebaseToken(token, env, fetchImpl = fetch, nowMs = Date.now()) {
  const projectId = (env && env.FIREBASE_PROJECT_ID) || 'bajeti-yanga';
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('malformed');
  const header = b64urlJson(parts[0]);
  const payload = b64urlJson(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('bad header');
  const now = Math.floor(nowMs / 1000);
  if (payload.aud !== projectId) throw new Error('wrong audience');
  if (payload.iss !== 'https://securetoken.google.com/' + projectId) throw new Error('wrong issuer');
  if (!(payload.exp > now)) throw new Error('expired');
  if (!(payload.iat <= now + 60)) throw new Error('issued in the future');
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) throw new Error('bad subject');
  const key = await getKey(header.kid, fetchImpl);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('bad signature');
  return { uid: payload.sub, email: typeof payload.email === 'string' ? payload.email : null };
}
