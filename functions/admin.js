'use strict';
// Admin console backend, Phase 1 (read-only). index.js is thin wiring; everything that touches the database or the
// sign-in system goes through a `store` argument, so functions/test-admin.js runs it all against a fake.

const lib = require('./lib');

const DAY = 86400000, TRIAL_DAYS = 14, FRESH_SECONDS = 30 * 60;
const READ_ACTIONS = new Set(['overview', 'households', 'household', 'users', 'payments', 'log']);

const parseAdmins = s => new Set(String(s || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
const needsFresh = action => !READ_ACTIONS.has(action);   // every future change needs a sign-in from the last 30 minutes

// The one gate. Email alone is not enough: the app also allows email+password sign-up, so we require Google + verified.
function authorize({ decoded, adminEmails, enabled, nowMs, needFresh }) {
  if (!enabled) return { ok: false, code: 503, error: 'The console is switched off.' };
  if (!decoded) return { ok: false, code: 401, error: 'Please sign in.' };
  const email = String(decoded.email || '').toLowerCase();
  const provider = decoded.firebase && decoded.firebase.sign_in_provider;
  if (!email || decoded.email_verified !== true || provider !== 'google.com' || !adminEmails.has(email)) {
    return { ok: false, code: 403, error: 'Not allowed.' };
  }
  if (needFresh && !(nowMs / 1000 - Number(decoded.auth_time || 0) <= FRESH_SECONDS)) {
    return { ok: false, code: 401, error: 'Sign in again to make changes.', needsFreshSignIn: true };
  }
  return { ok: true, email, uid: decoded.uid };
}

// ── small helpers ────────────────────────────────────────────────────────────
function toMs(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v === 'number') return v;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}
const expiryMs = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? lib.endOfDayMs(v) : toMs(v);

// 'premium' | 'premium_expired' | 'trial' | 'trial_ended' | 'free'
function premiumState(h, now) {
  if (h.isPremium === true) {
    const e = expiryMs(h.premiumExpiry);
    if (!h.premiumExpiry || e === null || e >= now) return 'premium';
    return 'premium_expired';
  }
  const started = toMs(h.trialStarted) || toMs(h.config && h.config.trialStarted);
  if (started) return now - started < TRIAL_DAYS * DAY ? 'trial' : 'trial_ended';
  return 'free';
}
// Premium that exists only in the old config copy (migrate-premium.js not run yet, or written by hand).
const legacyOnly = h => !!(h.config && h.config.isPremium === true && h.isPremium !== true);
const pad2 = n => String(n).padStart(2, '0');
const day = ms => { const [y, m, d] = lib.catYMD(ms); return `${y}-${pad2(m)}-${pad2(d)}`; };   // Malawi date
const who = u => (u ? (u.email || u.phone || u.uid) : null);
const STUCK = new Set(['mismatch', 'paid_no_household', 'init_failed']);

async function inChunks(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return out;
}

// ── handlers ─────────────────────────────────────────────────────────────────
async function overview({ store, now }) {
  const [hhs, users, pays] = await Promise.all([store.households(), store.authUsers(), store.payments(1000)]);
  const live = hhs.filter(h => !h.deletedAt);
  const states = {};
  live.forEach(h => { const s = premiumState(h, now); states[s] = (states[s] || 0) + 1; });

  const signups = {};
  for (let i = 13; i >= 0; i--) signups[day(now - i * DAY)] = 0;
  users.forEach(u => { const d = u.created ? day(u.created) : null; if (d in signups) signups[d]++; });

  const month = day(now).slice(0, 7);
  const paid = pays.filter(p => p.status === 'paid');
  const byStatus = {};
  pays.forEach(p => { byStatus[p.status] = (byStatus[p.status] || 0) + 1; });
  const stuckPending = pays.filter(p => p.status === 'pending' && now - (p.createdAtMs || 0) > 3600000).length;

  return { code: 200, body: {
    households: { live: live.length, deleted: hhs.length - live.length },
    states,
    users: { total: users.length, last7: users.filter(u => u.created && now - u.created < 7 * DAY).length },
    signupsByDay: signups,
    revenue: {
      currency: lib.CURRENCY,
      total: paid.reduce((s, p) => s + (p.amount || 0), 0),
      thisMonth: paid.filter(p => p.paidAtMs && day(p.paidAtMs).startsWith(month)).reduce((s, p) => s + (p.amount || 0), 0),
      truncated: pays.length >= 1000,
    },
    payments: { byStatus },
    attention: {
      stuckPending, needsLook: pays.filter(p => STUCK.has(p.status)).length,
      premiumNotMigrated: live.filter(legacyOnly).length,
    },
  } };
}

async function households({ store, now }) {
  const [hhs, users] = await Promise.all([store.households(), store.authUsers()]);
  const byUid = new Map(users.map(u => [u.uid, u]));
  const rows = await inChunks(hhs, 10, async h => {
    const e = await store.entryStats(h.id).catch(() => ({ count: null, lastMs: null }));
    return {
      id: h.id, owner: h.owner || null, ownerName: who(byUid.get(h.owner)),
      members: Array.isArray(h.memberUids) ? h.memberUids.length : 0,
      created: h._created || null, state: premiumState(h, now), premiumExpiry: h.premiumExpiry || null,
      trialStarted: toMs(h.trialStarted) || toMs(h.config && h.config.trialStarted),
      deleted: !!h.deletedAt, legacyPremium: legacyOnly(h), entries: e.count, lastEntry: e.lastMs,
    };
  });
  rows.sort((a, b) => (b.created || 0) - (a.created || 0));
  return { code: 200, body: { rows } };
}

async function household({ store, now, viewEntries, params }) {
  const id = params && params.id;
  if (!lib.isCode(id)) return { code: 400, body: { error: 'Invalid household.' } };
  const h = await store.household(id);
  if (!h) return { code: 404, body: { error: 'Household not found.' } };
  const users = await store.authUsers();
  const byUid = new Map(users.map(u => [u.uid, u]));
  // Root fields only, scalars only: budgets and other settings inside `config` are not sent to the console.
  const fields = {};
  Object.keys(h).forEach(k => {
    if (k === 'config' || k === 'memberUids' || k.startsWith('_')) return;
    const v = h[k]; const ms = (v && typeof v.toMillis === 'function') ? v.toMillis() : v;
    if (ms === null || ['string', 'number', 'boolean'].includes(typeof ms)) fields[k] = ms;
  });
  const pays = (await store.paymentsFor(id)).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  const e = await store.entryStats(id).catch(() => ({ count: null, lastMs: null }));
  return { code: 200, body: {
    id, state: premiumState(h, now), legacyPremium: legacyOnly(h), fields, entries: e.count, lastEntry: e.lastMs,
    members: (h.memberUids || []).map(uid => { const u = byUid.get(uid); return { uid, name: who(u), lastSignIn: u ? u.lastSignIn : null, owner: uid === h.owner }; }),
    payments: pays.slice(0, 20),
    recentEntries: viewEntries ? await store.recentEntries(id, 20) : null,
    entriesHidden: !viewEntries,
  } };
}

async function users({ store }) {
  const [list, docs] = await Promise.all([store.authUsers(), store.userDocs()]);
  const byUid = new Map(docs.map(d => [d.id, d]));
  const rows = list.map(u => {
    const d = byUid.get(u.uid) || {};
    return { uid: u.uid, name: who(u), providers: u.providers, created: u.created, lastSignIn: u.lastSignIn, verified: u.verified,
      disabled: u.disabled, owned: Array.isArray(d.ownedHouseholds) ? d.ownedHouseholds.length : 0,
      trialClaimed: toMs(d.trialClaimedAt), premiumUntil: toMs(d.premiumUntil), pendingDeletion: d.pendingDeletion === true };
  }).sort((a, b) => (b.created || 0) - (a.created || 0));
  return { code: 200, body: { rows } };
}

async function payments({ store, now, params }) {
  const limit = Math.min(Math.max(Number(params && params.limit) || 100, 1), 500);
  const rows = (await store.payments(limit)).map(p => ({
    id: p.id, uid: p.uid, householdId: p.householdId, months: p.months, amount: p.amount, status: p.status,
    createdAtMs: p.createdAtMs || null, paidAtMs: p.paidAtMs || null, premiumExpiry: p.premiumExpiry || null,
    source: p.source || 'paychangu', note: p.note || null,
    needsLook: STUCK.has(p.status) || (p.status === 'pending' && now - (p.createdAtMs || 0) > 3600000),
  }));
  return { code: 200, body: { rows } };
}

async function log({ store, params }) {
  const limit = Math.min(Math.max(Number(params && params.limit) || 100, 1), 300);
  return { code: 200, body: { rows: await store.log(limit) } };
}

const HANDLERS = { overview, households, household, users, payments, log };

async function handle({ action, params, store, now, viewEntries }) {
  const fn = HANDLERS[action];
  if (!fn) return { code: 400, body: { error: 'Unknown action.' } };
  return fn({ store, now, viewEntries: !!viewEntries, params: params || {} });
}

// For Phase 2: every change calls this with the before and after values, in the same request as the change.
async function logAction({ store, admin, action, target, before, after, now }) {
  await store.addLog({ atMs: now, by: admin.email, action, target: target || null, before: before === undefined ? null : before, after: after === undefined ? null : after });
}

// ── the real store (Firestore Admin SDK + Auth) ──────────────────────────────
function firestoreStore({ db, auth }) {
  const doc = d => ({ id: d.id, ...d.data() });
  return {
    households: async () => (await db.collection('households').get()).docs.map(d => ({ ...doc(d), _created: d.createTime ? d.createTime.toMillis() : null })),
    household: async id => { const d = await db.collection('households').doc(id).get(); return d.exists ? { ...doc(d), _created: d.createTime ? d.createTime.toMillis() : null } : null; },
    entryStats: async id => {
      const col = db.collection('households').doc(id).collection('purchases');
      const [c, last] = await Promise.all([col.count().get(), col.orderBy('timestamp', 'desc').limit(1).get()]);
      const l = last.empty ? null : last.docs[0].data();
      return { count: c.data().count, lastMs: l ? (toMs(l.timestamp) || toMs(l.date)) : null };
    },
    recentEntries: async (id, n) => (await db.collection('households').doc(id).collection('purchases').orderBy('timestamp', 'desc').limit(n).get()).docs.map(doc),
    payments: async limit => (await db.collection('payments').orderBy('createdAtMs', 'desc').limit(limit).get()).docs.map(doc),
    paymentsFor: async hid => (await db.collection('payments').where('householdId', '==', hid).limit(50).get()).docs.map(doc),
    userDocs: async () => (await db.collection('users').get()).docs.map(doc),
    log: async limit => (await db.collection('adminLog').orderBy('atMs', 'desc').limit(limit).get()).docs.map(doc),
    addLog: async entry => { await db.collection('adminLog').add(entry); },
    authUsers: async () => {
      const out = []; let token;
      do {
        const r = await auth.listUsers(1000, token);
        r.users.forEach(u => out.push({
          uid: u.uid, email: u.email || null, phone: u.phoneNumber || null, providers: (u.providerData || []).map(p => p.providerId),
          created: toMs(u.metadata.creationTime), lastSignIn: toMs(u.metadata.lastSignInTime), verified: !!u.emailVerified, disabled: !!u.disabled,
        }));
        token = r.pageToken;
      } while (token);
      return out;
    },
  };
}

module.exports = { parseAdmins, needsFresh, authorize, premiumState, handle, logAction, firestoreStore };
