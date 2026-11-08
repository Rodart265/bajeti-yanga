// Payment business logic for the Cloudflare Worker. This is functions/lib.js (the Cloud Function version) moved
// over almost line for line, with two changes that were needed:
//   1. Node's `crypto` is replaced by Web Crypto, which is what Workers have.
//   2. The "too many attempts" check asks Firestore for the person's payments only (no composite index needed)
//      and does the "last 10 minutes" filtering here, so there is no extra Firebase setup step.
// Everything that touches the database or the network arrives as `deps`, so test.mjs can run all of it against fakes.

export const PRICES = { 1: 1500, 3: 4000 };        // MWK. Keep equal to PLANS in js/01-constants.js (tests/prices.test.js checks it).
export const CURRENCY = 'MWK';
const CAT_OFFSET_MS = 2 * 3600 * 1000;             // Malawi is UTC+2, no daylight saving
const PENDING_MAX_AGE_MS = 3 * 86400 * 1000;
const enc = new TextEncoder();

const pad = n => String(n).padStart(2, '0');
export const isCode = s => typeof s === 'string' && /^[A-Za-z0-9_-]{3,40}$/.test(s);
export const isTxRef = s => typeof s === 'string' && /^by_[a-z0-9]{6,12}_[a-f0-9]{10}$/.test(s);

// ── dates (Malawi time) ──────────────────────────────────────────────────────
export function catYMD(ms) { const d = new Date(ms + CAT_OFFSET_MS); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; }
const ymdStr = ([y, m, d]) => `${y}-${pad(m)}-${pad(d)}`;
export function addMonthsYMD([y, m, d], months) {
  const idx = m - 1 + months;
  const yy = y + Math.floor(idx / 12), mm = ((idx % 12) + 12) % 12;
  const dim = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();     // clamp 31 Jan + 1 month -> 28/29 Feb
  return [yy, mm + 1, Math.min(d, dim)];
}
export function endOfDayMs(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return Date.UTC(y, m - 1, d, 23, 59, 59) - CAT_OFFSET_MS; }

// New premiumExpiry (a YYYY-MM-DD string, valid through the end of that day in Malawi) after buying `months`.
// Extends from the current expiry if it is still in the future, otherwise from today.
export function extendExpiry(existing, months, nowMs) {
  let base = catYMD(nowMs);
  if (typeof existing === 'string' && existing) {
    let endMs = NaN, ymd = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(existing)) { endMs = endOfDayMs(existing); ymd = existing.split('-').map(Number); }
    else { const t = new Date(existing).getTime(); if (!Number.isNaN(t)) { endMs = t; ymd = catYMD(t); } }
    if (!Number.isNaN(endMs) && endMs >= nowMs) base = ymd;
  }
  return ymdStr(addMonthsYMD(base, months));
}

// Premium can live in two places: the root fields (set by this Worker) and inside `config` (old manual activations,
// until migrate-premium.js is run). The app reads both, so settling a payment has to read both too. Otherwise a household
// whose Premium sits in `config` looks like it has none, and a payment restarts the clock from today.
function expiryToMs(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(v) ? endOfDayMs(v) : new Date(v).getTime();
  if (typeof v.toMillis === 'function') return v.toMillis();
  return NaN;
}
// { active, unlimited, expiry }: `expiry` is the LATER of the two dates as a YYYY-MM-DD string (or null).
// `unlimited` means Premium is on and neither place has an end date.
export function currentPremium(h) {
  const cfg = h && h.config && typeof h.config === 'object' ? h.config : {};
  const active = (h && h.isPremium === true) || cfg.isPremium === true;
  const raw = [h && h.premiumExpiry, cfg.premiumExpiry];
  let best = null, bestMs = -Infinity;
  for (const v of raw) { const ms = expiryToMs(v); if (!Number.isNaN(ms) && ms > bestMs) { best = v; bestMs = ms; } }
  const expiry = best === null ? null : (typeof best === 'string' ? best : ymdStr(catYMD(bestMs)));
  const anyRaw = !!(raw[0] || raw[1]);
  return { active, unlimited: active && !anyRaw, expiry };
}

// ── PayChangu helpers ────────────────────────────────────────────────────────
const hex =bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
export function newTxRef() { return 'by_' + Date.now().toString(36) + '_' + hex(crypto.getRandomValues(new Uint8Array(5))); }

function hexToBytes(h) { const out = new Uint8Array(h.length / 2); for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16); return out; }
function b64ToBytes(s) {
  const t = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
function sameBytes(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; }

// PayChangu signs the raw webhook body with HMAC-SHA256 and sends it in the `Signature` header.
// `rawBody` is the exact bytes received (Uint8Array), never re-serialised JSON.
export async function signatureOk(rawBody, header, secret) {
  if (!secret || !header) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, rawBody));
  const h = String(header).trim();
  let given;
  if (/^[0-9a-f]{64}$/i.test(h)) given = hexToBytes(h);
  else { try { given = b64ToBytes(h); } catch (_) { return false; } }
  return sameBytes(given, mac);
}

// The webhook body is not guaranteed to carry OUR reference under one name, so collect every plausible one;
// only references that match a payment we created can ever do anything.
export function candidateRefs(body, query) {
  const out = new Set();
  const take = v => { if (isTxRef(v)) out.add(v); };
  const b = body && typeof body === 'object' ? body : {};
  [b.tx_ref, b.reference, b.charge_id, b.txRef, b.data && b.data.tx_ref, b.data && b.data.reference, b.meta && b.meta.tx_ref,
   query && query.tx_ref].forEach(take);
  return [...out];
}

export async function payChanguCreate({ fetchImpl, secretKey, payload }) {
  const r = await fetchImpl('https://api.paychangu.com/payment', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer ' + secretKey },
    body: JSON.stringify(payload),
  });
  let j = null; try { j = await r.json(); } catch (_) {}
  const url = j && j.data && j.data.checkout_url;
  if (!r.ok || !url) throw new Error('PayChangu create failed: HTTP ' + r.status + ' ' + JSON.stringify(j || {}).slice(0, 300));
  return url;
}

// 'paid' | 'pending' | 'failed', always decided by asking PayChangu, never by trusting a webhook body.
export async function payChanguVerify({ fetchImpl, secretKey, txRef }) {
  const r = await fetchImpl('https://api.paychangu.com/verify-payment/' + encodeURIComponent(txRef), {
    headers: { Accept: 'application/json', Authorization: 'Bearer ' + secretKey },
  });
  let j = null; try { j = await r.json(); } catch (_) {}
  if (r.status === 404) return { state: 'pending' };
  if (!r.ok || !j || !j.data) throw new Error('PayChangu verify failed: HTTP ' + r.status);
  const st = String(j.data.status || '').toLowerCase();
  if (st === 'success' || st === 'successful') return { state: 'paid', amount: Number(j.data.amount), currency: String(j.data.currency || '') };
  if (st === 'failed' || st === 'cancelled' || st === 'canceled') return { state: 'failed' };
  return { state: 'pending' };
}

// ── start a payment ──────────────────────────────────────────────────────────
export async function createCheckout({ deps, uid, email, householdId, months, selfUrl, appUrl }) {
  const { db, fetchImpl, secretKey, now } = deps;
  if (!isCode(householdId)) return { code: 400, error: 'Invalid household.' };
  const price = PRICES[months];
  if (!price) return { code: 400, error: 'Invalid plan.' };

  const hh = await db.collection('households').doc(householdId).get();
  const h = hh.exists ? hh.data() : null;
  if (!h || !Array.isArray(h.memberUids) || !h.memberUids.includes(uid) || h.deletedAt) return { code: 403, error: 'Not allowed.' };

  // At most 5 attempts in 10 minutes. Single-field query (uid only), so Firestore needs no extra index.
  const mine = await db.collection('payments').where('uid', '==', uid).limit(200).get();
  const since = now() - 10 * 60 * 1000;
  if (mine.docs.filter(d => (d.data().createdAtMs || 0) > since).length >= 5) return { code: 429, error: 'Too many payment attempts. Please wait a few minutes.' };

  const txRef = newTxRef();
  const payRef = db.collection('payments').doc(txRef);
  await payRef.set({ uid, householdId, months, amount: price, currency: CURRENCY, status: 'pending', createdAtMs: now() });
  const payload = {
    amount: price, currency: CURRENCY, tx_ref: txRef,
    callback_url: selfUrl, return_url: appUrl + (appUrl.includes('?') ? '&' : '?') + 'paid=1',
    customization: { title: 'Bajeti Yanga Premium', description: months + (months === 1 ? ' month' : ' months') },
    meta: { householdId, uid },
  };
  if (typeof email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) payload.email = email;
  try {
    const url = await payChanguCreate({ fetchImpl, secretKey, payload });
    return { code: 200, body: { checkout_url: url, tx_ref: txRef } };
  } catch (e) {
    await payRef.update({ status: 'init_failed', error: String(e.message).slice(0, 300) });
    return { code: 502, error: 'Could not start the payment. Please try again.', detail: e.message };
  }
}

// ── confirm a payment and switch Premium on (safe to call any number of times) ─
export async function settlePayment({ deps, txRef }) {
  const { db, fetchImpl, secretKey, now, tsFromMillis } = deps;
  if (!isTxRef(txRef)) return { status: 'unknown' };
  const payRef = db.collection('payments').doc(txRef);
  const first = await payRef.get();
  if (!first.exists) return { status: 'unknown' };
  const p = first.data();
  if (p.status === 'paid') return { status: 'paid', premiumExpiry: p.premiumExpiry || null };
  if (p.status !== 'pending') return { status: 'failed' };

  const v = await payChanguVerify({ fetchImpl, secretKey, txRef });
  if (v.state === 'failed') { await payRef.update({ status: 'failed' }); return { status: 'failed' }; }
  if (v.state !== 'paid') {
    if (now() - (p.createdAtMs || 0) > PENDING_MAX_AGE_MS) { await payRef.update({ status: 'expired' }); return { status: 'failed' }; }
    return { status: 'pending' };
  }
  // What was paid must be at least what we asked for, in the right currency.
  if (!(v.amount >= p.amount) || v.currency !== CURRENCY) {
    await payRef.update({ status: 'mismatch', paidAmount: v.amount || null, paidCurrency: v.currency || null });
    return { status: 'failed' };
  }

  let result = { status: 'paid', premiumExpiry: null };
  await db.runTransaction(async tx => {
    const ps = await tx.get(payRef);
    if (ps.data().status === 'paid') { result = { status: 'paid', premiumExpiry: ps.data().premiumExpiry || null }; return; }
    const hhRef = db.collection('households').doc(p.householdId);
    const hs = await tx.get(hhRef);
    if (!hs.exists) { tx.update(payRef, { status: 'paid_no_household', paidAtMs: now() }); result = { status: 'failed' }; return; }
    const h = hs.data();
    const cur = currentPremium(h);                                       // reads root AND legacy config.* Premium
    const wasUnlimited = cur.unlimited;                                  // e.g. granted by hand with no end date
    const expiry = wasUnlimited ? null : extendExpiry(cur.active ? cur.expiry : null, p.months, now());
    if (!wasUnlimited) {
      const upd = { isPremium: true, premiumExpiry: expiry };
      if (h.isPremium !== true) upd.premiumActivatedAt = new Date(now()).toISOString();
      tx.update(hhRef, upd);
      if (h.owner) {
        const uRef = db.collection('users').doc(h.owner);
        const us = await tx.get(uRef);
        const cur = us.exists && us.data().premiumUntil && us.data().premiumUntil.toMillis ? us.data().premiumUntil.toMillis() : 0;
        tx.set(uRef, { premiumUntil: tsFromMillis(Math.max(cur, endOfDayMs(expiry))) }, { merge: true });
      }
    }
    // A household that already has Premium with no end date gains nothing from a payment: keep a note so it can be refunded.
    const extra = wasUnlimited ? { note: 'household already had Premium with no end date; nothing was extended' } : {};
    if (wasUnlimited) console.warn('payment on a household with unlimited Premium, check for a refund:', txRef);
    tx.update(payRef, { status: 'paid', paidAtMs: now(), premiumExpiry: expiry, ...extra });
    result = { status: 'paid', premiumExpiry: expiry };
  });
  return result;
}

// Settle every still-pending payment (webhook missed, customer closed the page, ...). Run on a schedule.
export async function reconcilePending({ deps, limit = 50 }) {
  const snap = await deps.db.collection('payments').where('status', '==', 'pending').limit(limit).get();
  const out = [];
  for (const d of snap.docs) {
    try { out.push([d.id, (await settlePayment({ deps, txRef: d.id })).status]); }
    catch (e) { out.push([d.id, 'error: ' + e.message]); }
  }
  return out;
}
