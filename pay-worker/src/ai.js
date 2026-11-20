// Bajeti AI, Premium only. The browser never sees the Gemini key; it asks this Worker, which:
//   1. works out WHO is asking from the Firebase sign-in token (checked here, with Google's public keys);
//   2. refuses anything that is not a plain Gemini "contents" request (no tools, no other models);
//   3. checks on the SERVER that the person belongs to a Premium (or trial) household. Free households get a 403 and
//      the app shows its upgrade screen;
//   4. counts the call in Firestore, in one all-or-nothing step: at most HARD_DAILY_CAP a day per person (300 unless
//      changed) and GLOBAL_DAILY_CAP a day across everyone, which is the safety net for the Gemini bill;
//   5. forwards the request to Gemini. If Gemini fails, the person's use is given back.
// If the counters cannot be read or written, the answer is "busy, try again", never "go ahead": a broken counter must
// not turn into unlimited use.
//
// Settings: secrets GEMINI_API_KEY, plain GEMINI_MODEL (required). Optional: HARD_DAILY_CAP (300), GLOBAL_DAILY_CAP
// (3000), TRIAL_DAYS (14), TRUST_CONFIG_PREMIUM (true until migrate-premium.js has been run).

import { verifyFirebaseTokenFull } from './auth.js';

const MAX_BODY_BYTES = 12 * 1024 * 1024;       // a phone photo as base64 is ~6-8 MB
const MAX_TEXT_CHARS = 80000;
const MAX_IMAGES = 2;                         // the app sends ONE picture per request; two leaves room, 1,600 did not
const MAX_IMAGE_CHARS = 8000000;              // one picture as base64 text (~6 MB), the fallback of an undecodable original
const MAX_IMAGES_TOTAL_CHARS = 10000000;
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;       // Gemini decides the length when nothing is said; 4096 is also the top allowed
const MAX_CONTENTS = 80;
export const FEATURES = ['msg', 'magic', 'scan', 'summ'];
const ALLOWED_GEN_KEYS = ['temperature', 'topP', 'topK', 'maxOutputTokens', 'responseMimeType'];
const ALLOWED_MIME = /^image\/(jpeg|png|webp|heic|heif)$/;
const CAT_OFFSET_MS = 2 * 3600 * 1000;          // Malawi is UTC+2, no daylight saving

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
export function catDate(now = Date.now()) { return new Date(now + CAT_OFFSET_MS).toISOString().slice(0, 10); }

function expiryEndMs(e) {
  const s = String(e || '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], 23, 59, 59) - CAT_OFFSET_MS;   // end of that day, Malawi time
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? NaN : t;
}
const msOf = v => (v && typeof v.toMillis === 'function' ? v.toMillis() : (v ? new Date(v).getTime() : NaN));

// Mirrors getPremiumStatus() in the app. `root` is the decoded household document. Returns true, false, or null when
// the caller is not a member (no say).
export function computePremium(root, uid, env, now = Date.now()) {
  if (!root || !Array.isArray(root.memberUids) || !root.memberUids.includes(uid)) return null;
  const trustCfg = String((env && env.TRUST_CONFIG_PREMIUM) || 'true') !== 'false';
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
  const startMs = msOf(started);
  if (Number.isNaN(startMs)) return false;
  return Math.floor((now - startMs) / 86400000) < num(env && env.TRIAL_DAYS, 14);
}

// Only a plain Gemini generateContent body gets through.
export function sanitizeBody(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.contents)) return null;
  if (raw.contents.length < 1 || raw.contents.length > MAX_CONTENTS) return null;
  let chars = 0, images = 0, imageChars = 0;
  const cleanParts = (parts, allowImages = true) => {
    if (!Array.isArray(parts) || parts.length < 1 || parts.length > 20) return null;
    const out = [];
    for (const p of parts) {
      if (p && typeof p.text === 'string') { chars += p.text.length; out.push({ text: p.text }); }
      else if (p && (p.inline_data || p.inlineData)) {
        const d = p.inline_data || p.inlineData;
        const mime = d.mime_type || d.mimeType;
        if (!allowImages || typeof mime !== 'string' || !ALLOWED_MIME.test(mime) || typeof d.data !== 'string') return null;
        images++; imageChars += d.data.length;
        if (images > MAX_IMAGES || d.data.length > MAX_IMAGE_CHARS || imageChars > MAX_IMAGES_TOTAL_CHARS) return null;
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
    const parts = cleanParts(raw.systemInstruction && raw.systemInstruction.parts, false);
    if (!parts) return null;
    body.systemInstruction = { parts };
  }
  const g = {};
  if (raw.generationConfig && typeof raw.generationConfig === 'object') {
    for (const k of ALLOWED_GEN_KEYS) if (raw.generationConfig[k] !== undefined) g[k] = raw.generationConfig[k];
  }
  g.maxOutputTokens = g.maxOutputTokens === undefined ? DEFAULT_MAX_OUTPUT_TOKENS : Math.min(num(g.maxOutputTokens, 1024), DEFAULT_MAX_OUTPUT_TOKENS);
  body.generationConfig = g;
  return chars > MAX_TEXT_CHARS ? null : body;
}

// Premium status of a household, read with the Worker's own access (not the caller's), then checked against the caller's uid.
// true / false, or throws when Firestore could not be reached (the caller then answers "busy": fail closed).
const premiumCache = new Map();                  // `${uid}|${hh}` -> { at, value }
export function clearPremiumCache() { premiumCache.clear(); }
async function isHouseholdPremium(deps, uid, hh, env) {
  if (!hh || !/^[A-Za-z0-9_-]{3,40}$/.test(hh)) return false;
  const ck = uid + '|' + hh;
  const hit = premiumCache.get(ck);
  if (hit && deps.now() - hit.at < 60 * 1000) return hit.value;
  const snap = await deps.db.collection('households').doc(hh).get(['memberUids', 'isPremium', 'premiumExpiry', 'trialStarted', 'config.isPremium', 'config.premiumExpiry', 'config.trialStarted', 'deletedAt']);
  let value = false;
  if (snap.exists) {
    const d = snap.data();
    const c = d.deletedAt ? false : computePremium(d, uid, env, deps.now());
    value = c === null ? false : c;
  }
  if (premiumCache.size > 500) premiumCache.clear();
  premiumCache.set(ck, { at: deps.now(), value });
  return value;
}

// Adds (or, with delta -1, gives back) one use. Returns null when allowed, or a { status, code } refusal.
async function bump(deps, uid, day, feature, delta, limits) {
  const col = deps.db.collection('aiUsage');
  const mine = col.doc(uid + '_' + day), all = col.doc('_all_' + day);
  return deps.db.runTransaction(async tx => {
    const a = await tx.get(mine), b = await tx.get(all);
    const u = a.exists ? a.data() : { day, uid, total: 0 };
    const g = b.exists ? b.data() : { day, total: 0 };
    if (delta > 0) {
      if ((u.total || 0) >= limits.perUser) return { status: 429, code: 'quota_exceeded', message: 'Daily limit reached.' };
      if ((g.total || 0) >= limits.global) return { status: 429, code: 'quota_exceeded', message: 'Bajeti AI is very busy today. Please try again tomorrow.' };
    }
    u.total = Math.max(0, (u.total || 0) + delta);
    u[feature] = Math.max(0, (u[feature] || 0) + delta);
    g.total = Math.max(0, (g.total || 0) + delta);
    tx.set(mine, u); tx.set(all, g);
    return null;
  });
}

// Reads the request body as JSON but stops as soon as more than `max` bytes have arrived, whatever the Content-Length header
// says (a sender can leave it out or lie). Returns { json } or { tooLarge: true } or { bad: true }.
export async function readJsonLimited(req, max) {
  const declared = req.headers.get('Content-Length');
  if (declared !== null && Number(declared) > max) return { tooLarge: true };
  if (!req.body) return { bad: true };
  const reader = req.body.getReader(), chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { try { await reader.cancel(); } catch (_) { /* already closed */ } return { tooLarge: true }; }
    chunks.push(value);
  }
  const buf = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { buf.set(c, at); at += c.byteLength; }
  try { return { json: JSON.parse(new TextDecoder().decode(buf)) }; } catch (_) { return { bad: true }; }
}

export async function handleChat({ req, env, deps, fetchImpl, cors }) {
  const out = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });
  const fail = (status, code, message) => out(status, { error: { code, message } });

  if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL) return fail(500, 'not_configured', 'AI is not set up yet (GEMINI_API_KEY / GEMINI_MODEL).');

  // 1. who is asking
  const m = /^Bearer (.+)$/.exec(req.headers.get('authorization') || '');
  if (!m) return fail(401, 'unauthenticated', 'Please sign in again.');
  let who;
  try { who = await verifyFirebaseTokenFull(m[1], env, fetchImpl, deps.now()); } catch (_) { return fail(401, 'unauthenticated', 'Please sign in again.'); }
  if (who.provider !== 'google.com' && !who.emailVerified) return fail(401, 'unauthenticated', 'Please verify your email first.');
  const uid = who.uid;

  // 2. what they are asking for
  const read = await readJsonLimited(req, MAX_BODY_BYTES);
  if (read.tooLarge) return fail(413, 'too_large', 'Request too large.');
  if (read.bad) return fail(400, 'bad_request', 'Invalid JSON.');
  const body = sanitizeBody(read.json);
  if (!body) return fail(400, 'bad_request', 'Unsupported request.');

  // 3. Premium only
  let premium;
  try { premium = await isHouseholdPremium(deps, uid, req.headers.get('x-household'), env); }
  catch (e) { console.error('premium check failed', e && e.message); return fail(503, 'busy', 'Bajeti AI is busy. Please try again in a moment.'); }
  if (!premium) return fail(403, 'premium_required', 'Bajeti AI is a Premium feature.');

  // 4. daily limits, counted before the call and given back if it fails
  const featureHeader = req.headers.get('x-ai-feature');
  const feature = FEATURES.includes(featureHeader) ? featureHeader : 'msg';   // naming no feature still counts as a message
  const day = catDate(deps.now());
  const limits = { perUser: num(env.HARD_DAILY_CAP, 300), global: num(env.GLOBAL_DAILY_CAP, 3000) };
  let refusal;
  try { refusal = await bump(deps, uid, day, feature, +1, limits); }
  catch (e) { console.error('ai counter failed', e && e.message); return fail(503, 'busy', 'Bajeti AI is busy. Please try again in a moment.'); }
  if (refusal) return fail(refusal.status, refusal.code, refusal.message);

  // 5. Gemini
  let up = null;
  try {
    up = await (0, fetchImpl)(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(body),
    });
  } catch (_) { up = null; }
  if (!up || !up.ok) await bump(deps, uid, day, feature, -1, limits).catch(() => {});   // it did not work: give the use back
  if (!up) return fail(502, 'upstream_unreachable', 'AI service is unreachable.');
  const text = await up.text();
  return new Response(text, { status: up.status, headers: { 'Content-Type': up.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store', ...cors } });
}
