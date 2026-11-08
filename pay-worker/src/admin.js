// Admin console backend, on the same Cloudflare Worker as payments (POST /admin, plus the public GET /public feed).
//
// Why it lives here: browsers are (correctly) not allowed to change Premium, disable accounts or read the Firebase
// sign-in list. This Worker already has a robot key that can, so the console asks the Worker, the Worker checks who is
// asking, does the change, and writes a log entry in the same step. The console page itself decides nothing.
//
// Who may do what (the whole policy is these three tables; change them here and nowhere else):
//   owner    everything
//   support  look at everything, re-check payments with PayChangu, add a note to a payment
//   analyst  look only
// Changes that touch money, accounts or what users see also need a sign-in from the last 30 minutes.
//
// Privacy: the console shows accounts, subscriptions and payments. It never loads or returns a household's budget,
// items, goals or purchases, and Chipereganyu is shown as counts only (no names, no who-paid-what).
//
// Everything that touches the database or Google sign-in arrives through `deps` / `identity`, so test.mjs runs all of it
// against fakes.

import * as logic from './logic.js';
import { DELETE, tsFromMillis, randomId } from './firestore.js';

const DAY = 86400000, HOUR = 3600000, TRIAL_DAYS = 14, FRESH_SECONDS = 30 * 60;

// ── who may do what ──────────────────────────────────────────────────────────
export const READ_ACTIONS = ['whoami', 'overview', 'attention', 'households', 'household', 'users', 'payments', 'premium',
  'chipereganyu', 'announcements', 'settings', 'log'];
export const WRITE_ROLES = {
  recheck_payment: ['owner', 'support'], payment_note: ['owner', 'support'],
  premium_set: ['owner'], user_disable: ['owner'], announcement_save: ['owner'], announcement_delete: ['owner'], settings_save: ['owner'],
};
const NEEDS_FRESH = new Set(['premium_set', 'user_disable', 'announcement_save', 'announcement_delete', 'settings_save']);

const parseList = s => new Set(String(s || '').split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean));
export function adminLists(env) {
  return { owner: parseList(env.ADMIN_OWNERS || env.ADMIN_EMAILS), support: parseList(env.ADMIN_SUPPORT), analyst: parseList(env.ADMIN_ANALYSTS) };
}
export function roleOf(email, env) {
  const e = String(email || '').toLowerCase(); if (!e) return null;
  const l = adminLists(env);
  return l.owner.has(e) ? 'owner' : l.support.has(e) ? 'support' : l.analyst.has(e) ? 'analyst' : null;
}

// The one gate. Email alone is not enough: the app also allows email+password sign-up, so we require Google + verified.
export function authorize({ user, env, action, nowMs }) {
  const l = adminLists(env);
  if (!l.owner.size && !l.support.size && !l.analyst.size) return { ok: false, code: 503, error: 'The admin console is not set up yet. Add ADMIN_OWNERS in Cloudflare.' };
  if (!user || !user.email || !user.emailVerified || user.provider !== 'google.com') return { ok: false, code: 403, error: 'Not allowed.', denied: true };
  const role = roleOf(user.email, env);
  if (!role) return { ok: false, code: 403, error: 'Not allowed.', denied: true };
  const isRead = READ_ACTIONS.includes(action), allowed = WRITE_ROLES[action];
  if (!isRead && !allowed) return { ok: false, code: 400, error: 'Unknown action.' };
  if (allowed && !allowed.includes(role)) return { ok: false, code: 403, error: 'Your role cannot do that.' };
  if (NEEDS_FRESH.has(action) && !(nowMs / 1000 - Number(user.authTime || 0) <= FRESH_SECONDS)) {
    return { ok: false, code: 401, error: 'Sign in again to make changes.', needsFreshSignIn: true };
  }
  return { ok: true, role, email: String(user.email).toLowerCase(), uid: user.uid };
}

class Fail extends Error { constructor(code, message) { super(message); this.code = code; } }

// ── small helpers ────────────────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0');
const ymd = ms => { const [y, m, d] = logic.catYMD(ms); return `${y}-${pad2(m)}-${pad2(d)}`; };   // Malawi date
const isYMD = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const realYMD = s => { if (!isYMD(s)) return false; const [y, m, d] = s.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
const ymdMs = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((ymdMs(b) - ymdMs(a)) / DAY);
const tsMs = v => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = new Date(v).getTime(); return Number.isNaN(t) ? null : t;
};
const expiryMs = v => (isYMD(v) ? logic.endOfDayMs(v) : tsMs(v));
const asDate = v => (v === null || v === undefined || v === '' ? null : isYMD(v) ? v : (tsMs(v) === null ? null : ymd(tsMs(v))));
const cleanLine = (s, max) => String(s === null || s === undefined ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
const cleanBlock = (s, max) => String(s === null || s === undefined ? '' : s).replace(/\r/g, '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').trim().slice(0, max);
const ok = body => ({ code: 200, body });
const asInt = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };

// ── reading the database (field lists keep budgets and purchases out of every request) ─────────────
const HH_FIELDS = ['name', 'owner', 'memberUids', 'isPremium', 'premiumExpiry', 'premiumActivatedAt', 'trialStarted', 'deletedAt',
  'premiumAdminAt', 'premiumAdminBy', 'config.isPremium', 'config.premiumExpiry', 'config.premiumActivatedAt', 'config.trialStarted'];
const USER_FIELDS = ['displayName', 'email', 'householdId', 'ownedHouseholds', 'premiumUntil', 'pendingDeletion', 'trialClaimedAt'];
const PAY_FIELDS = ['uid', 'householdId', 'months', 'amount', 'currency', 'status', 'createdAtMs', 'paidAtMs', 'premiumExpiry', 'source',
  'note', 'adminNote', 'adminResolved', 'paidAmount', 'by'];
const GROUP_FIELDS = ['name', 'status', 'createdBy', 'createdAt', 'frequency', 'contributionAmount', 'dueDay', 'memberUids',
  'currentCycle.cycleNumber', 'currentCycle.lap', 'currentCycle.dueDate', 'currentCycle.amount', 'currentCycle.contributions'];

const memos = new WeakMap();
async function cached(ctx, key, fn) {
  const ttl = Number(ctx.env.ADMIN_CACHE_SECONDS === undefined ? 30 : ctx.env.ADMIN_CACHE_SECONDS) * 1000;
  if (!(ttl > 0)) return fn();
  let m = memos.get(ctx.deps.db); if (!m) { m = new Map(); memos.set(ctx.deps.db, m); }
  const hit = m.get(key);
  if (hit && !ctx.fresh && ctx.now - hit.at < ttl) return hit.v;
  const v = await fn(); m.set(key, { at: ctx.now, v }); return v;
}
const forgetCache = ctx => memos.delete(ctx.deps.db);

const loadHouseholds = ctx => cached(ctx, 'hh', async () =>
  (await ctx.deps.db.collection('households').select(...HH_FIELDS).get()).docs.map(d => ({ id: d.id, created: d.createTime, ...d.data() })));
const loadUserDocs = ctx => cached(ctx, 'ud', async () =>
  (await ctx.deps.db.collection('users').select(...USER_FIELDS).get()).docs.map(d => ({ id: d.id, ...d.data() })));
const loadPayments = (ctx, n) => cached(ctx, 'pay' + n, async () =>
  (await ctx.deps.db.collection('payments').orderBy('createdAtMs', 'desc').limit(n).select(...PAY_FIELDS).get()).docs.map(d => ({ id: d.id, ...d.data() })));
const loadAuth = ctx => cached(ctx, 'auth', async () => {
  try { return { ok: true, list: await ctx.identity.listUsers() }; }
  catch (e) { return { ok: false, status: e.status || 0, message: String(e.message || e).slice(0, 200) }; }
});

// uid -> { uid, name, email, phone, created, lastSignIn, disabled, providers } from the sign-in list, falling back to profile documents.
function peopleMap(auth, userDocs) {
  const m = new Map();
  if (auth.ok) auth.list.forEach(u => m.set(u.uid, { ...u, name: u.email || u.phone || u.uid }));
  userDocs.forEach(d => { if (!m.has(d.id)) m.set(d.id, { uid: d.id, email: d.email || null, phone: null, name: d.email || d.displayName || d.id, created: null, lastSignIn: null, disabled: false, providers: [] }); });
  return m;
}
const nameOf = (people, uid) => (uid ? ((people.get(uid) || {}).name || uid) : null);

// ── Premium: the one place that says what a household's state is ──────────────
function premiumInfo(h, now) {
  const cur = logic.currentPremium(h);
  const cfg = h.config && typeof h.config === 'object' ? h.config : {};
  const eMs = cur.active && cur.expiry ? expiryMs(cur.expiry) : null;
  const trialStarted = tsMs(h.trialStarted) !== null ? tsMs(h.trialStarted) : tsMs(cfg.trialStarted);
  let state;
  if (cur.active) state = (cur.unlimited || eMs === null || eMs >= now) ? 'premium' : 'premium_expired';
  else if (trialStarted !== null) state = now - trialStarted < TRIAL_DAYS * DAY ? 'trial' : 'trial_ended';
  else state = 'free';
  return {
    state, active: cur.active, unlimited: cur.unlimited, expiry: cur.expiry ? asDate(cur.expiry) : null, expiryMs: eMs,
    daysLeft: state === 'premium' && eMs !== null ? Math.ceil((eMs - now) / DAY) : null,
    trialStarted, trialDaysLeft: state === 'trial' ? Math.max(0, TRIAL_DAYS - Math.floor((now - trialStarted) / DAY)) : null,
    legacyOnly: cfg.isPremium === true && h.isPremium !== true,
    rootActive: h.isPremium === true, rootExpiry: asDate(h.premiumExpiry), configActive: cfg.isPremium === true, configExpiry: asDate(cfg.premiumExpiry),
  };
}
const brief = i => ({ state: i.state, expiry: i.expiry, unlimited: i.unlimited, rootActive: i.rootActive, rootExpiry: i.rootExpiry, configActive: i.configActive, configExpiry: i.configExpiry });

function aggregatePayments(pays) {
  const by = new Map();
  for (const p of pays) {
    if (!p.householdId) continue;
    let a = by.get(p.householdId);
    if (!a) { a = { paidCount: 0, paidTotal: 0, lastPaidAt: 0, lastExpiry: null, maxExpiryMs: 0 }; by.set(p.householdId, a); }
    if (p.status !== 'paid') continue;
    a.paidCount++; a.paidTotal += Number(p.amount) || 0; a.lastPaidAt = Math.max(a.lastPaidAt, p.paidAtMs || 0);
    const em = isYMD(p.premiumExpiry) ? logic.endOfDayMs(p.premiumExpiry) : 0;
    if (em > a.maxExpiryMs) { a.maxExpiryMs = em; a.lastExpiry = p.premiumExpiry; }
  }
  return by;
}

// Why a payment needs a person to look at it (null = it does not).
function lookReason(p, now) {
  if (p.adminResolved === true) return null;
  const age = now - (p.createdAtMs || 0);
  if (p.status === 'pending' && age > HOUR && age < 3 * DAY) return 'Still pending after an hour';
  if (p.status === 'mismatch') return 'Amount paid did not match the price';
  if (p.status === 'paid_no_household') return 'Paid, but the household no longer exists';
  if (p.status === 'init_failed') return 'Could not be started at PayChangu';
  if (p.status === 'paid' && /no end date/i.test(String(p.note || ''))) return 'Household already had unlimited Premium (refund?)';
  return null;
}
const payRow = (p, now, people) => ({
  id: p.id, uid: p.uid || null, who: nameOf(people, p.uid), householdId: p.householdId || null, months: p.months || null,
  amount: Number(p.amount) || 0, status: p.status || 'unknown', createdAtMs: p.createdAtMs || null, paidAtMs: p.paidAtMs || null,
  premiumExpiry: p.premiumExpiry || null, source: p.source || 'paychangu', note: p.note || null, adminNote: p.adminNote || null,
  resolved: p.adminResolved === true, look: lookReason(p, now),
});

function hhRow(h, now, people, agg) {
  const i = premiumInfo(h, now), a = agg.get(h.id);
  return {
    id: h.id, name: h.name || null, owner: h.owner || null, ownerName: nameOf(people, h.owner),
    members: Array.isArray(h.memberUids) ? h.memberUids.length : 0, created: h.created || null, deleted: !!h.deletedAt,
    state: i.state, expiry: i.expiry, daysLeft: i.daysLeft, unlimited: i.unlimited, trialDaysLeft: i.trialDaysLeft, legacy: i.legacyOnly,
    paid: a ? a.paidCount : 0, lastPaidAt: a && a.lastPaidAt ? a.lastPaidAt : null,
  };
}

// Everything that needs a person to look at it, worst first.
function buildAttention({ hhs, pays, now, people }) {
  const items = [], agg = aggregatePayments(pays);
  for (const p of pays) {
    const why = lookReason(p, now); if (!why) continue;
    const high = p.status === 'pending' || p.status === 'paid_no_household' || p.status === 'mismatch';
    items.push({ id: 'pay:' + p.id, kind: 'payment', severity: high ? 'high' : 'medium', title: why, at: p.createdAtMs || 0,
      detail: `${nameOf(people, p.uid) || 'Unknown customer'} · MK ${(Number(p.amount) || 0).toLocaleString('en-GB')} · ${p.months || '?'} month${p.months === 1 ? '' : 's'}`,
      ref: { type: 'payment', id: p.id, householdId: p.householdId || null }, canRecheck: p.status === 'pending' });
  }
  for (const h of hhs) {
    if (h.deletedAt) continue;
    const i = premiumInfo(h, now), a = agg.get(h.id);
    if (i.legacyOnly) items.push({ id: 'legacy:' + h.id, kind: 'household', severity: 'low', title: 'Premium is only in the old config field',
      detail: `${h.id} · ${nameOf(people, h.owner) || 'no owner'} · ends ${i.expiry || 'no end date'}. It works, but move it to the new fields.`, at: 0, ref: { type: 'household', id: h.id } });
    if (i.rootExpiry && i.configExpiry && i.rootExpiry !== i.configExpiry) items.push({ id: 'dates:' + h.id, kind: 'household', severity: 'medium', title: 'Two different Premium end dates',
      detail: `${h.id} · new field ${i.rootExpiry}, old field ${i.configExpiry}. The later one is used.`, at: 0, ref: { type: 'household', id: h.id } });
    if (a && a.maxExpiryMs && !i.unlimited && (tsMs(h.premiumAdminAt) || 0) < a.lastPaidAt) {
      const cur = i.active && i.expiryMs ? i.expiryMs : 0;
      if (cur < a.maxExpiryMs - DAY / 2) items.push({ id: 'short:' + h.id, kind: 'household', severity: 'high', title: 'Premium ends sooner than the last payment',
        detail: `${h.id} · a payment ran to ${a.lastExpiry}, but the household shows ${i.expiry || 'no Premium'}.`, at: a.lastPaidAt, ref: { type: 'household', id: h.id } });
    }
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return items.sort((x, y) => rank[x.severity] - rank[y.severity] || y.at - x.at);
}

// ── handlers: looking ────────────────────────────────────────────────────────
const authNote = a => (a.ok ? null : (a.status === 403
  ? 'The robot account needs the role "Firebase Authentication Admin" before sign-in dates and account disabling work.'
  : 'Could not read the Firebase sign-in list right now. ' + (a.message || '')));

async function whoami(ctx) {
  return ok({ email: ctx.admin.email, role: ctx.admin.role, canWrite: ctx.admin.role === 'owner', canRecheck: ctx.admin.role !== 'analyst', freshSeconds: FRESH_SECONDS });
}

async function overview(ctx) {
  const { now } = ctx;
  const [hhs, auth, userDocs, pays, log] = await Promise.all([loadHouseholds(ctx), loadAuth(ctx), loadUserDocs(ctx), loadPayments(ctx, 1000),
    cached(ctx, 'log8', async () => (await ctx.deps.db.collection('adminLog').orderBy('atMs', 'desc').limit(8).get()).docs.map(d => ({ id: d.id, ...d.data() })))]);
  const people = peopleMap(auth, userDocs), agg = aggregatePayments(pays);
  const live = hhs.filter(h => !h.deletedAt), infos = new Map(live.map(h => [h.id, premiumInfo(h, now)]));

  const states = { premium: 0, premium_expired: 0, trial: 0, trial_ended: 0, free: 0 };
  let expiring7 = 0, expiring30 = 0, unlimited = 0, legacy = 0, trialed = 0, converted = 0;
  for (const h of live) {
    const i = infos.get(h.id); states[i.state]++;
    if (i.state === 'premium') { if (i.unlimited) unlimited++; else if (i.daysLeft !== null) { if (i.daysLeft <= 7) expiring7++; if (i.daysLeft <= 30) expiring30++; } }
    if (i.legacyOnly) legacy++;
    if (i.trialStarted !== null) { trialed++; if (agg.get(h.id) && agg.get(h.id).paidCount > 0) converted++; }
  }

  const days = []; for (let k = 29; k >= 0; k--) days.push(ymd(now - k * DAY));
  const at = new Map(days.map((d, k) => [d, k]));
  const signups = days.map(d => ({ d, n: 0 })), newHouseholds = days.map(d => ({ d, n: 0 }));
  hhs.forEach(h => { const k = h.created ? at.get(ymd(h.created)) : undefined; if (k !== undefined) newHouseholds[k].n++; });

  let users;
  if (auth.ok) {
    auth.list.forEach(u => { const k = u.created ? at.get(ymd(u.created)) : undefined; if (k !== undefined) signups[k].n++; });
    const cohort = auth.list.filter(u => u.created && u.created <= now - 30 * DAY);
    const kept = cohort.filter(u => u.lastSignIn && u.lastSignIn >= now - 30 * DAY).length;
    users = {
      total: auth.list.length, last7: auth.list.filter(u => u.created && now - u.created < 7 * DAY).length, last30: auth.list.filter(u => u.created && now - u.created < 30 * DAY).length,
      active7: auth.list.filter(u => u.lastSignIn && now - u.lastSignIn < 7 * DAY).length, active30: auth.list.filter(u => u.lastSignIn && now - u.lastSignIn < 30 * DAY).length,
      inactive30: auth.list.filter(u => !u.lastSignIn || now - u.lastSignIn >= 30 * DAY).length, disabled: auth.list.filter(u => u.disabled).length,
      retention30: cohort.length ? Math.round(kept / cohort.length * 1000) / 10 : null, retentionCohort: cohort.length,
    };
  } else users = { total: userDocs.length, last7: null, last30: null, active7: null, active30: null, inactive30: null, disabled: null, retention30: null, retentionCohort: 0 };

  const paid = pays.filter(p => p.status === 'paid'), when = p => p.paidAtMs || p.createdAtMs || 0;
  const [cy, cm] = logic.catYMD(now), months = [];
  for (let k = 11; k >= 0; k--) { const idx = cm - 1 - k; months.push({ m: `${cy + Math.floor(idx / 12)}-${pad2(((idx % 12) + 12) % 12 + 1)}`, amount: 0, count: 0 }); }
  const mAt = new Map(months.map((x, k) => [x.m, k]));
  paid.forEach(p => { const k = mAt.get(ymd(when(p)).slice(0, 7)); if (k !== undefined) { months[k].amount += Number(p.amount) || 0; months[k].count++; } });
  const prev3 = months.slice(8, 11);
  const payers = [...agg.values()].filter(a => a.paidCount > 0);
  const revenue = {
    currency: logic.CURRENCY, total: paid.reduce((s, p) => s + (Number(p.amount) || 0), 0), thisMonth: months[11].amount, lastMonth: months[10].amount, byMonth: months,
    avgMonthly3: Math.round(prev3.reduce((s, x) => s + x.amount, 0) / 3), truncated: pays.length >= 1000,
    byPlan: { one: paid.filter(p => p.months === 1).length, three: paid.filter(p => p.months === 3).length, manual: paid.filter(p => p.source === 'manual').length },
  };
  const byStatus = {}; pays.forEach(p => { byStatus[p.status || 'unknown'] = (byStatus[p.status || 'unknown'] || 0) + 1; });

  const attention = buildAttention({ hhs, pays, now, people });
  const recentSignups = auth.ok ? [...auth.list].filter(u => u.created).sort((a, b) => b.created - a.created).slice(0, 8).map(u => ({ uid: u.uid, name: u.name || u.email || u.phone || u.uid, created: u.created })) : [];
  return ok({
    auth: { ok: auth.ok, note: authNote(auth) }, users, signupsByDay: auth.ok ? signups : null, newHouseholdsByDay: newHouseholds,
    households: { live: live.length, deleted: hhs.length - live.length, last7: hhs.filter(h => h.created && now - h.created < 7 * DAY).length, last30: hhs.filter(h => h.created && now - h.created < 30 * DAY).length },
    premium: { states, expiring7, expiring30, unlimited, legacy, payingHouseholds: payers.length, repeatPayers: payers.filter(a => a.paidCount >= 2).length, trialed, converted,
      conversionRate: trialed ? Math.round(converted / trialed * 1000) / 10 : null },
    revenue, payments: { byStatus },
    attention: { total: attention.length, high: attention.filter(x => x.severity === 'high').length, items: attention.slice(0, 6) },
    recentSignups, recentLog: log,
  });
}

async function attention(ctx) {
  const [hhs, auth, userDocs, pays] = await Promise.all([loadHouseholds(ctx), loadAuth(ctx), loadUserDocs(ctx), loadPayments(ctx, 1000)]);
  return ok({ items: buildAttention({ hhs, pays, now: ctx.now, people: peopleMap(auth, userDocs) }), truncated: pays.length >= 1000 });
}

async function households(ctx) {
  const [hhs, auth, userDocs, pays] = await Promise.all([loadHouseholds(ctx), loadAuth(ctx), loadUserDocs(ctx), loadPayments(ctx, 1000)]);
  const people = peopleMap(auth, userDocs), agg = aggregatePayments(pays);
  const rows = hhs.map(h => hhRow(h, ctx.now, people, agg)).sort((a, b) => (b.created || 0) - (a.created || 0));
  return ok({ rows, auth: { ok: auth.ok, note: authNote(auth) } });
}

async function household(ctx, p) {
  const id = p.id;
  if (!logic.isCode(id)) throw new Fail(400, 'Invalid household.');
  const { db } = ctx.deps, { now } = ctx;
  const hs = await db.collection('households').doc(id).get(HH_FIELDS);
  if (!hs.exists) throw new Fail(404, 'Household not found.');
  const h = { id, created: hs.createTime, ...hs.data() };
  const [auth, userDocs, pays, hist] = await Promise.all([loadAuth(ctx), loadUserDocs(ctx),
    db.collection('payments').where('householdId', '==', id).limit(60).select(...PAY_FIELDS).get(),
    db.collection('adminLog').where('target', '==', id).limit(60).get()]);
  const people = peopleMap(auth, userDocs), info = premiumInfo(h, now);
  const payList = pays.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  const a = aggregatePayments(payList).get(id);
  const ownerDoc = userDocs.find(u => u.id === h.owner);
  return ok({
    id, name: h.name || null, created: h.created || null, deleted: !!h.deletedAt, owner: h.owner || null, ownerName: nameOf(people, h.owner),
    premium: { ...info, activatedAt: h.premiumActivatedAt || null, adminAt: tsMs(h.premiumAdminAt), adminBy: h.premiumAdminBy || null,
      lastPaymentRanTo: a ? a.lastExpiry : null, ownerPremiumUntil: ownerDoc ? tsMs(ownerDoc.premiumUntil) : null },
    members: (h.memberUids || []).map(uid => { const u = people.get(uid) || {}; return { uid, name: nameOf(people, uid), lastSignIn: u.lastSignIn || null, disabled: !!u.disabled, owner: uid === h.owner }; }),
    payments: payList.slice(0, 30).map(x => payRow(x, now, people)),
    history: hist.docs.map(d => ({ id: d.id, ...d.data() })).sort((x, y) => (y.atMs || 0) - (x.atMs || 0)).slice(0, 20),
  });
}

async function users(ctx) {
  const [auth, userDocs, hhs] = await Promise.all([loadAuth(ctx), loadUserDocs(ctx), loadHouseholds(ctx)]);
  const docs = new Map(userDocs.map(d => [d.id, d])), member = new Map();
  hhs.forEach(h => { if (h.deletedAt) return; (h.memberUids || []).forEach(uid => { const l = member.get(uid) || []; l.push(h.id); member.set(uid, l); }); });
  const row = (uid, u) => {
    const d = docs.get(uid) || {};
    return { uid, name: u.name || d.email || d.displayName || uid, providers: u.providers || [], created: u.created || null, lastSignIn: u.lastSignIn || null,
      verified: u.verified === undefined ? null : u.verified, disabled: !!u.disabled, households: (member.get(uid) || []).slice(0, 5), householdCount: (member.get(uid) || []).length,
      premiumUntil: tsMs(d.premiumUntil), pendingDeletion: d.pendingDeletion === true };
  };
  const rows = auth.ok ? auth.list.map(u => row(u.uid, { ...u, name: u.email || u.phone || u.uid })) : userDocs.map(d => row(d.id, {}));
  rows.sort((a, b) => (b.created || 0) - (a.created || 0));
  return ok({ rows, auth: { ok: auth.ok, note: authNote(auth) } });
}

async function payments(ctx, p) {
  const limit = asInt(p.limit, 1, 2000) || 500;
  const [pays, auth, userDocs] = await Promise.all([loadPayments(ctx, limit), loadAuth(ctx), loadUserDocs(ctx)]);
  const people = peopleMap(auth, userDocs);
  return ok({ rows: pays.map(x => payRow(x, ctx.now, people)), truncated: pays.length >= limit });
}

// The Premium page: who needs a follow-up and who is on a trial.
async function premium(ctx) {
  const [hhs, auth, userDocs, pays] = await Promise.all([loadHouseholds(ctx), loadAuth(ctx), loadUserDocs(ctx), loadPayments(ctx, 1000)]);
  const people = peopleMap(auth, userDocs), agg = aggregatePayments(pays), now = ctx.now;
  const rows = hhs.filter(h => !h.deletedAt).map(h => hhRow(h, now, people, agg));
  const byExpiry = (a, b) => (a.daysLeft === null ? 9e9 : a.daysLeft) - (b.daysLeft === null ? 9e9 : b.daysLeft);
  return ok({
    expiring: rows.filter(r => r.state === 'premium' && !r.unlimited && r.daysLeft !== null && r.daysLeft <= 14).sort(byExpiry),
    expired: rows.filter(r => r.state === 'premium_expired').sort((a, b) => String(b.expiry).localeCompare(String(a.expiry))).slice(0, 50),
    trials: rows.filter(r => r.state === 'trial').sort((a, b) => a.trialDaysLeft - b.trialDaysLeft),
    unlimited: rows.filter(r => r.state === 'premium' && r.unlimited),
    legacy: rows.filter(r => r.legacy),
  });
}

async function chipereganyu(ctx) {
  const [snap, auth, userDocs] = await Promise.all([cached(ctx, 'grp', async () => (await ctx.deps.db.collection('chipereganyu_groups').select(...GROUP_FIELDS).get()).docs.map(d => ({ id: d.id, ...d.data() }))),
    loadAuth(ctx), loadUserDocs(ctx)]);
  const people = peopleMap(auth, userDocs), today = ymd(ctx.now);
  const rows = snap.map(g => {
    const cc = g.currentCycle || null, c = cc && cc.contributions && typeof cc.contributions === 'object' ? Object.values(cc.contributions) : [];
    const paid = c.filter(x => x && x.paid === true).length;
    const sent = c.filter(x => x && x.sent === true && x.paid !== true);
    const stuck = sent.filter(x => tsMs(x.sentAt) !== null && ctx.now - tsMs(x.sentAt) > 3 * DAY).length;
    const overdueDays = cc && isYMD(cc.dueDate) ? Math.max(0, daysBetween(cc.dueDate, today)) : 0;
    return { id: g.id, name: g.name || g.id, status: g.status || 'unknown', admin: nameOf(people, g.createdBy), members: Array.isArray(g.memberUids) ? g.memberUids.length : 0,
      frequency: g.frequency || null, amount: Number(g.contributionAmount) || 0, created: tsMs(g.createdAt), cycle: cc ? cc.cycleNumber || null : null, lap: cc ? cc.lap || null : null,
      dueDate: cc ? cc.dueDate || null : null, overdueDays: paid < c.length ? overdueDays : 0, contributors: c.length, paid, sentNotConfirmed: sent.length, stuck };
  }).sort((a, b) => b.overdueDays - a.overdueDays || (b.created || 0) - (a.created || 0));
  const byStatus = {}; rows.forEach(r => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });
  return ok({ rows, summary: { total: rows.length, byStatus, overdue: rows.filter(r => r.overdueDays > 0).length, stuck: rows.filter(r => r.stuck > 0).length } });
}

async function announcements(ctx) {
  const docs = (await ctx.deps.db.collection('announcements').limit(200).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  return ok({ rows: docs.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)) });
}

async function settings(ctx) {
  const s = await ctx.deps.db.collection('adminConfig').doc('settings').get();
  const d = s.exists ? s.data() : {}, l = adminLists(ctx.env), auth = await loadAuth(ctx);
  return ok({
    maintenanceOn: d.maintenanceOn === true, maintenanceMessage: d.maintenanceMessage || '', updatedAtMs: d.updatedAtMs || null, updatedBy: d.updatedBy || null,
    admins: ctx.admin.role === 'owner' ? { owner: [...l.owner], support: [...l.support], analyst: [...l.analyst] } : null,
    auth: { ok: auth.ok, note: authNote(auth) },
  });
}

async function log(ctx, p) {
  const limit = asInt(p.limit, 1, 300) || 150;
  return ok({ rows: (await ctx.deps.db.collection('adminLog').orderBy('atMs', 'desc').limit(limit).get()).docs.map(d => ({ id: d.id, ...d.data() })) });
}

// ── handlers: changing ───────────────────────────────────────────────────────
const logDoc = (ctx, action, target, extra) => ({ atMs: ctx.now, by: ctx.admin.email, role: ctx.admin.role, action, target: target || null, ...extra });
async function writeLog(ctx, action, target, extra) { await ctx.deps.db.collection('adminLog').doc(randomId('log')).set(logDoc(ctx, action, target, extra)); }
function needReason(p) {
  const reason = cleanLine(p.reason, 300);
  if (reason.length < 3) throw new Fail(400, 'Please give a reason (at least 3 letters). It goes in the activity log.');
  return reason;
}

const PREMIUM_MODES = ['extend', 'set_expiry', 'unlimited', 'revoke', 'tidy'];
async function actPremium(ctx, p) {
  const { db, tsFromMillis: ts } = ctx.deps, { now } = ctx;
  const id = p.householdId, mode = p.mode;
  if (!logic.isCode(id)) throw new Fail(400, 'Invalid household.');
  if (!PREMIUM_MODES.includes(mode)) throw new Fail(400, 'Unknown Premium action.');
  const reason = needReason(p);
  let months = null;
  if (mode === 'extend') { months = asInt(p.months, 1, 36); if (!months) throw new Fail(400, 'Months must be a whole number from 1 to 36.'); }
  if (mode === 'set_expiry') {
    if (!realYMD(p.expiry)) throw new Fail(400, 'Enter the end date as YYYY-MM-DD.');
    if (p.expiry < '2024-01-01' || p.expiry > ymd(now + 5 * 365 * DAY)) throw new Fail(400, 'That end date is out of range (up to 5 years ahead).');
  }
  let rec = null;
  if (p.recordPayment) {
    if (!['extend', 'set_expiry'].includes(mode)) throw new Fail(400, 'A payment can only be recorded when giving or extending Premium.');
    const amount = asInt(p.recordPayment.amount, 0, 5000000);
    if (amount === null) throw new Fail(400, 'The payment amount must be a whole number of kwacha.');
    rec = { amount, note: cleanLine(p.recordPayment.note, 200) };
  }

  let result;
  await db.runTransaction(async tx => {
    const hRef = db.collection('households').doc(id), hs = await tx.get(hRef, HH_FIELDS);
    if (!hs.exists) throw new Fail(404, 'Household not found.');
    const h = hs.data();
    if (h.deletedAt) throw new Fail(400, 'This household is deleted.');
    const cur = logic.currentPremium(h), before = premiumInfo(h, now);

    let active = true, expiry = null;
    if (mode === 'extend') {
      if (cur.unlimited) throw new Fail(400, 'This household already has Premium with no end date. Use "Set end date" to give it one.');
      expiry = logic.extendExpiry(cur.active ? cur.expiry : null, months, now);
    } else if (mode === 'set_expiry') expiry = p.expiry;
    else if (mode === 'unlimited') expiry = null;
    else if (mode === 'revoke') active = false;
    else if (mode === 'tidy') {
      if (!cur.active) throw new Fail(400, 'This household has no Premium to move.');
      expiry = cur.unlimited ? null : asDate(cur.expiry);
    }

    const rootData = active
      ? { isPremium: true, premiumExpiry: expiry === null ? DELETE : expiry, premiumAdminAt: now, premiumAdminBy: ctx.admin.email }
      : { isPremium: false, premiumExpiry: DELETE, premiumAdminAt: now, premiumAdminBy: ctx.admin.email };
    if (active && h.isPremium !== true) rootData.premiumActivatedAt = new Date(now).toISOString();
    const cfg = h.config && typeof h.config === 'object' ? h.config : {}, strippedCfg = { ...cfg };
    for (const k of ['isPremium', 'premiumExpiry', 'premiumActivatedAt']) if (k in cfg) { rootData['config.' + k] = DELETE; delete strippedCfg[k]; }
    tx.update(hRef, rootData);

    const after = premiumInfo({ ...h, isPremium: active, premiumExpiry: expiry === null || !active ? undefined : expiry, config: strippedCfg }, now);

    // The owner's profile carries premiumUntil (the household-limit rule reads it). Only move it when it belongs to this household.
    if (h.owner) {
      const uRef = db.collection('users').doc(h.owner), us = await tx.get(uRef, ['premiumUntil']);
      const curUntil = us.exists ? tsMs(us.data().premiumUntil) : null;
      const oldEnd = cur.active ? (cur.unlimited ? Infinity : (expiryMs(cur.expiry) || 0)) : 0;
      if (active) {
        const newUntil = expiry === null ? logic.endOfDayMs('2100-01-01') : logic.endOfDayMs(expiry);
        if (!(curUntil && curUntil > oldEnd && curUntil > newUntil)) tx.set(uRef, { premiumUntil: ts(newUntil) }, { merge: true });
      } else if (us.exists && curUntil !== null && curUntil <= oldEnd) tx.set(uRef, { premiumUntil: DELETE }, { merge: true });
    }

    let paymentId = null;
    if (rec) {
      paymentId = randomId('manual');
      tx.set(db.collection('payments').doc(paymentId), { uid: h.owner || null, householdId: id, months, amount: rec.amount, currency: logic.CURRENCY, status: 'paid', source: 'manual',
        createdAtMs: now, paidAtMs: now, premiumExpiry: expiry, note: rec.note || reason, by: ctx.admin.email });
    }
    tx.set(db.collection('adminLog').doc(randomId('log')), logDoc(ctx, 'premium_' + mode, id, { reason, before: brief(before), after: brief(after), paymentId, months }));
    result = { before: brief(before), after: brief(after), paymentId };
  });
  forgetCache(ctx);
  return ok({ ok: true, ...result });
}

async function actRecheck(ctx, p) {
  const { deps } = ctx, txRef = p.txRef;
  if (!logic.isTxRef(txRef)) throw new Fail(400, 'That is not a PayChangu reference from this app.');
  const ref = deps.db.collection('payments').doc(txRef), snap = await ref.get();
  if (!snap.exists) throw new Fail(404, 'Payment not found.');
  const before = snap.data().status;
  let reopened = false;
  if (p.force === true && ['expired', 'failed'].includes(before)) {
    if (ctx.admin.role !== 'owner') throw new Fail(403, 'Only the owner can reopen a closed payment.');
    await ref.update({ status: 'pending', createdAtMs: ctx.now, adminReopenedAt: ctx.now });
    reopened = true;
  }
  const r = await logic.settlePayment({ deps, txRef });
  const after = (await ref.get()).data();
  await writeLog(ctx, 'payment_recheck', txRef, { before: { status: before }, after: { status: after.status, premiumExpiry: after.premiumExpiry || null }, reopened });
  forgetCache(ctx);
  return ok({ ok: true, result: r.status, status: after.status, premiumExpiry: after.premiumExpiry || null, reopened });
}

async function actPaymentNote(ctx, p) {
  const txRef = String(p.txRef || '');
  if (!/^[A-Za-z0-9_-]{6,60}$/.test(txRef)) throw new Fail(400, 'Invalid payment.');
  const note = cleanLine(p.note, 300), resolved = p.resolved === true;
  if (!note && !resolved) throw new Fail(400, 'Write a note, or mark it as reviewed.');
  const ref = ctx.deps.db.collection('payments').doc(txRef);
  if (!(await ref.get(['status'])).exists) throw new Fail(404, 'Payment not found.');
  await ref.update({ adminNote: note || DELETE, adminResolved: resolved, adminNoteBy: ctx.admin.email, adminNoteAt: ctx.now });
  await writeLog(ctx, 'payment_note', txRef, { after: { note, resolved } });
  forgetCache(ctx);
  return ok({ ok: true });
}

async function actUserDisable(ctx, p) {
  const uid = String(p.uid || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Fail(400, 'Invalid account.');
  const reason = needReason(p), disable = p.disabled !== false;
  const u = await ctx.identity.lookup(uid).catch(e => { throw new Fail(e.status === 403 ? 403 : 502, e.status === 403 ? 'The robot account needs the role "Firebase Authentication Admin" first.' : 'Could not reach Firebase sign-in right now.'); });
  if (!u) throw new Fail(404, 'Account not found.');
  if (disable && (uid === ctx.admin.uid || roleOf(u.email, ctx.env))) throw new Fail(400, 'Admin accounts cannot be disabled here.');
  await ctx.identity.setDisabled(uid, disable);
  await writeLog(ctx, disable ? 'user_disable' : 'user_enable', uid, { reason, before: { disabled: !!u.disabled }, after: { disabled: disable }, who: u.email || u.phone || null });
  forgetCache(ctx);
  return ok({ ok: true, disabled: disable });
}

const NOTICE_KINDS = ['info', 'warning'], NOTICE_AUDIENCE = ['all', 'free', 'premium'], NOTICE_LANG = ['all', 'en', 'cw'];
async function actAnnouncementSave(ctx, p) {
  const title = cleanLine(p.title, 80), body = cleanBlock(p.body, 500);
  if (title.length < 3) throw new Fail(400, 'Give the notice a title (at least 3 letters).');
  const audience = NOTICE_AUDIENCE.includes(p.audience) ? p.audience : 'all', lang = NOTICE_LANG.includes(p.lang) ? p.lang : 'all', kind = NOTICE_KINDS.includes(p.kind) ? p.kind : 'info';
  const startsAtMs = p.startsAtMs ? Number(p.startsAtMs) : null, endsAtMs = p.endsAtMs ? Number(p.endsAtMs) : null;
  if ((startsAtMs !== null && !Number.isFinite(startsAtMs)) || (endsAtMs !== null && !Number.isFinite(endsAtMs))) throw new Fail(400, 'Invalid start or end time.');
  if (startsAtMs && endsAtMs && endsAtMs <= startsAtMs) throw new Fail(400, 'The end time must be after the start time.');
  const col = ctx.deps.db.collection('announcements');
  let id = p.id ? String(p.id) : null, prev = null;
  if (id) { if (!/^[A-Za-z0-9_-]{3,60}$/.test(id)) throw new Fail(400, 'Invalid notice.'); const s = await col.doc(id).get(); if (!s.exists) throw new Fail(404, 'Notice not found.'); prev = s.data(); }
  else id = randomId('n');
  const doc = { title, body, audience, lang, kind, active: p.active !== false, startsAtMs, endsAtMs, createdAtMs: prev ? prev.createdAtMs || ctx.now : ctx.now,
    createdBy: prev ? prev.createdBy || ctx.admin.email : ctx.admin.email, updatedAtMs: ctx.now, updatedBy: ctx.admin.email };
  await col.doc(id).set(doc);
  await writeLog(ctx, prev ? 'announcement_edit' : 'announcement_create', id, { after: { title, audience, lang, kind, active: doc.active } });
  return ok({ ok: true, id });
}
async function actAnnouncementDelete(ctx, p) {
  const id = String(p.id || '');
  if (!/^[A-Za-z0-9_-]{3,60}$/.test(id)) throw new Fail(400, 'Invalid notice.');
  const ref = ctx.deps.db.collection('announcements').doc(id), s = await ref.get();
  if (!s.exists) throw new Fail(404, 'Notice not found.');
  await ref.delete();
  await writeLog(ctx, 'announcement_delete', id, { before: { title: s.data().title || null } });
  return ok({ ok: true });
}
async function actSettingsSave(ctx, p) {
  const msg = cleanLine(p.maintenanceMessage, 300), on = p.maintenanceOn === true;
  if (on && msg.length < 3) throw new Fail(400, 'Write the message people will see during maintenance.');
  const ref = ctx.deps.db.collection('adminConfig').doc('settings'), prev = (await ref.get()).data() || {};
  await ref.set({ maintenanceOn: on, maintenanceMessage: msg, updatedAtMs: ctx.now, updatedBy: ctx.admin.email });
  await writeLog(ctx, 'settings_save', 'maintenance', { before: { on: prev.maintenanceOn === true, message: prev.maintenanceMessage || '' }, after: { on, message: msg } });
  return ok({ ok: true });
}

const HANDLERS = { whoami, overview, attention, households, household, users, payments, premium, chipereganyu, announcements, settings, log };
const WRITERS = {
  premium_set: actPremium, recheck_payment: actRecheck, payment_note: actPaymentNote, user_disable: actUserDisable,
  announcement_save: actAnnouncementSave, announcement_delete: actAnnouncementDelete, settings_save: actSettingsSave,
};
const run = action => HANDLERS[action] || WRITERS[action];

// Someone signed in with a real Google account but not on the list. Recorded (at most one entry per person per hour,
// and a hard cap per hour) so the activity page can show who has been knocking.
const denied = { seen: new Map(), hourStart: 0, count: 0 };
async function logDenied(deps, user, action) {
  const now = deps.now();
  if (now - denied.hourStart > HOUR) { denied.hourStart = now; denied.count = 0; denied.seen.clear(); }
  const e = String(user.email || user.uid).toLowerCase();
  if (denied.seen.has(e) || denied.count >= 20) return;
  denied.seen.set(e, now); denied.count++;
  await deps.db.collection('adminLog').doc(randomId('log')).set({ atMs: now, by: e, role: null, action: 'denied', target: String(action || '').slice(0, 40) });
}

export async function handle({ user, action, params, env, deps, identity }) {
  const now = deps.now(), p = params && typeof params === 'object' ? params : {};
  const a = authorize({ user, env, action, nowMs: now });
  if (!a.ok) {
    if (a.denied) await logDenied(deps, user, action).catch(() => {});
    return { code: a.code, body: { error: a.error, needsFreshSignIn: a.needsFreshSignIn || undefined } };
  }
  const fn = run(action);
  if (!fn) return { code: 400, body: { error: 'Unknown action.' } };
  const ctx = { deps, env, identity, now, admin: a, fresh: p.fresh === true };
  try { return await fn(ctx, p); }
  catch (e) {
    if (e instanceof Fail) return { code: e.code, body: { error: e.message } };
    console.error('admin error', action, e && e.message);
    return { code: 500, body: { error: 'Something went wrong.', detail: String(e && e.message || e).slice(0, 200) } };
  }
}

// ── what the app is told (no sign-in needed; nothing private in it) ──────────
const publicMemo = new WeakMap();
export async function publicFeed({ deps, env, plan, lang }) {
  const ttl = Number(env.PUBLIC_CACHE_SECONDS === undefined ? 60 : env.PUBLIC_CACHE_SECONDS) * 1000, now = deps.now();
  let raw = ttl > 0 ? publicMemo.get(deps.db) : null;
  if (!raw || now - raw.at >= ttl) {
    const [n, s] = await Promise.all([deps.db.collection('announcements').where('active', '==', true).limit(50).get(), deps.db.collection('adminConfig').doc('settings').get()]);
    raw = { at: now, notices: n.docs.map(d => ({ id: d.id, ...d.data() })), settings: s.exists ? s.data() : {} };
    if (ttl > 0) publicMemo.set(deps.db, raw);
  }
  const p = plan === 'premium' ? 'premium' : 'free', l = lang === 'cw' ? 'cw' : 'en';
  const notices = raw.notices
    .filter(x => (!x.startsAtMs || x.startsAtMs <= now) && (!x.endsAtMs || x.endsAtMs > now) && (x.audience === 'all' || x.audience === p) && (x.lang === 'all' || x.lang === l))
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)).slice(0, 3)
    .map(x => ({ id: x.id, title: x.title || '', body: x.body || '', kind: x.kind === 'warning' ? 'warning' : 'info' }));
  const on = raw.settings.maintenanceOn === true;
  return { notices, maintenance: on ? { on: true, message: raw.settings.maintenanceMessage || '' } : { on: false } };
}
