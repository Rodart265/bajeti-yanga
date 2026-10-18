'use strict';
// Business logic for the payments + trial Cloud Functions. Everything that touches the database or the network
// receives it as an argument (`deps`), so functions/test.js can run it all against a fake. index.js is thin wiring.

const crypto = require('crypto');

const PRICES = { 1: 2500, 3: 7000 };               // MWK. Keep in step with selectPlan() in index.html.
const CURRENCY = 'MWK';
const CAT_OFFSET_MS = 2 * 3600 * 1000;             // Malawi is UTC+2, no daylight saving
const PENDING_MAX_AGE_MS = 3 * 86400 * 1000;
const FREE_HOUSEHOLD_CAP = 3;                      // keep in step with HOUSEHOLD_LIMITS.free in index.html

const pad = n => String(n).padStart(2, '0');
const isCode = s => typeof s === 'string' && /^[A-Za-z0-9_-]{3,40}$/.test(s);
const isTxRef = s => typeof s === 'string' && /^by_[a-z0-9]{6,12}_[a-f0-9]{10}$/.test(s);

// ── dates (Malawi time) ──────────────────────────────────────────────────────
function catYMD(ms) { const d = new Date(ms + CAT_OFFSET_MS); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; }
const ymdStr = ([y, m, d]) => `${y}-${pad(m)}-${pad(d)}`;
function addMonthsYMD([y, m, d], months) {
  const idx = m - 1 + months;
  const yy = y + Math.floor(idx / 12), mm = ((idx % 12) + 12) % 12;
  const dim = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();     // clamp 31 Jan + 1 month -> 28/29 Feb
  return [yy, mm + 1, Math.min(d, dim)];
}
function endOfDayMs(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return Date.UTC(y, m - 1, d, 23, 59, 59) - CAT_OFFSET_MS; }

// New premiumExpiry (a YYYY-MM-DD string, valid through the end of that day in Malawi) after buying `months`.
// Extends from the current expiry if it is still in the future, otherwise from today.
function extendExpiry(existing, months, nowMs) {
  let base = catYMD(nowMs);
  if (typeof existing === 'string' && existing) {
    let endMs = NaN, ymd = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(existing)) { endMs = endOfDayMs(existing); ymd = existing.split('-').map(Number); }
    else { const t = new Date(existing).getTime(); if (!Number.isNaN(t)) { endMs = t; ymd = catYMD(t); } }
    if (!Number.isNaN(endMs) && endMs >= nowMs) base = ymd;
  }
  return ymdStr(addMonthsYMD(base, months));
}

// ── PayChangu helpers ────────────────────────────────────────────────────────
function newTxRef() { return 'by_' + Date.now().toString(36) + '_' + crypto.randomBytes(5).toString('hex'); }

// PayChangu signs the raw webhook body with HMAC-SHA256 and sends it in the `Signature` header.
function signatureOk(rawBody, header, secret) {
  if (!secret || !header) return false;
  const mac = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const h = String(header).trim();
  let given;
  if (/^[0-9a-f]{64}$/i.test(h)) given = Buffer.from(h, 'hex');
  else { try { given = Buffer.from(h, 'base64'); } catch (_) { return false; } }
  return given.length === mac.length && crypto.timingSafeEqual(given, mac);
}

// The webhook body is not guaranteed to carry OUR reference under one name, so collect every plausible one;
// only references that match a payment we created can ever do anything.
function candidateRefs(body, query) {
  const out = new Set();
  const take = v => { if (isTxRef(v)) out.add(v); };
  const b = body && typeof body === 'object' ? body : {};
  [b.tx_ref, b.reference, b.charge_id, b.txRef, b.data && b.data.tx_ref, b.data && b.data.reference, b.meta && b.meta.tx_ref,
   query && query.tx_ref].forEach(take);
  return [...out];
}

async function payChanguCreate({ fetchImpl, secretKey, payload }) {
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
async function payChanguVerify({ fetchImpl, secretKey, txRef }) {
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
async function createCheckout({ deps, uid, email, householdId, months, selfUrl, appUrl }) {
  const { db, fetchImpl, secretKey, now } = deps;
  if (!isCode(householdId)) return { code: 400, error: 'Invalid household.' };
  const price = PRICES[months];
  if (!price) return { code: 400, error: 'Invalid plan.' };

  const hh = await db.collection('households').doc(householdId).get();
  const h = hh.exists ? hh.data() : null;
  if (!h || !Array.isArray(h.memberUids) || !h.memberUids.includes(uid) || h.deletedAt) return { code: 403, error: 'Not allowed.' };

  const recent = await db.collection('payments').where('uid', '==', uid).limit(40).get();
  let n = 0; recent.forEach(d => { if ((d.data().createdAtMs || 0) > now() - 10 * 60 * 1000) n++; });
  if (n >= 5) return { code: 429, error: 'Too many payment attempts. Please wait a few minutes.' };

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
async function settlePayment({ deps, txRef }) {
  const { db, fetchImpl, secretKey, now, FV, tsFromMillis } = deps;
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
    const wasUnlimited = h.isPremium === true && !h.premiumExpiry;       // e.g. granted by hand with no end date
    const expiry = wasUnlimited ? null : extendExpiry(h.isPremium === true ? h.premiumExpiry : null, p.months, now());
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
    tx.update(payRef, { status: 'paid', paidAtMs: now(), premiumExpiry: expiry });
    result = { status: 'paid', premiumExpiry: expiry };
  });
  return result;
}

// Settle every still-pending payment (webhook missed, customer closed the page, ...). Run on a schedule.
async function reconcilePending({ deps, limit = 50 }) {
  const snap = await deps.db.collection('payments').where('status', '==', 'pending').limit(limit).get();
  const out = [];
  for (const d of snap.docs) {
    try { out.push([d.id, (await settlePayment({ deps, txRef: d.id })).status]); }
    catch (e) { out.push([d.id, 'error: ' + e.message]); }
  }
  return out;
}

// ── one free trial per ACCOUNT, and (optionally) the free household cap ──────
// Runs after every household is created. The rules already stop a trial from being requested when the account has
// claimed one; this closes the race where several households are created at once, and covers accounts that used a
// trial before this existed. The earliest household that carries a trial keeps it; later ones lose it.
async function enforceTrialAndCap({ deps, householdId, data, createdMs, enforceCap }) {
  const { db, FV, now } = deps;
  const owner = data && data.owner;
  if (!owner) return { action: 'skip' };
  const userRef = db.collection('users').doc(owner);

  const mine = await db.collection('households').where('owner', '==', owner).get();
  const withTrial = [];
  let liveCount = 0, anyPremiumHousehold = false;
  mine.forEach(o => {
    const od = o.data();
    const t = o.createTime && o.createTime.toMillis ? o.createTime.toMillis() : 0;
    if (od.trialStarted || (od.config && od.config.trialStarted)) withTrial.push({ id: o.id, t });
    if (!od.deletedAt) liveCount++;
    if (od.isPremium === true) anyPremiumHousehold = true;
  });
  if (data.trialStarted && !withTrial.some(x => x.id === householdId)) withTrial.push({ id: householdId, t: createdMs });

  let stripped = false;
  await db.runTransaction(async tx => {
    const u = await tx.get(userRef);
    const ud = u.exists ? u.data() : {};
    let winner = ud.trialHouseholdId || null;
    if (!winner && withTrial.length) {
      withTrial.sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
      winner = withTrial[0].id;
      tx.set(userRef, { trialClaimedAt: FV.serverTimestamp(), trialHouseholdId: winner }, { merge: true });
    }
    if (data.trialStarted && winner !== householdId) {
      tx.update(db.collection('households').doc(householdId), { trialStarted: FV.delete() });
      stripped = true;
    }
  });

  let removed = false;
  if (enforceCap && liveCount > FREE_HOUSEHOLD_CAP) {
    const u = await userRef.get();
    const until = u.exists && u.data().premiumUntil && u.data().premiumUntil.toMillis ? u.data().premiumUntil.toMillis() : 0;
    if (until <= now() && !anyPremiumHousehold) {
      await db.collection('households').doc(householdId).delete();
      await userRef.set({ ownedHouseholds: FV.arrayRemove(householdId) }, { merge: true });
      removed = true;
    }
  }
  return { action: 'done', stripped, removed };
}

module.exports = {
  PRICES, CURRENCY, isCode, isTxRef, catYMD, addMonthsYMD, endOfDayMs, extendExpiry, newTxRef, signatureOk,
  candidateRefs, payChanguCreate, payChanguVerify, createCheckout, settlePayment, reconcilePending, enforceTrialAndCap,
};
