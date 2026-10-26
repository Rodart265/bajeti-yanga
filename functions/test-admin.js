'use strict';
// Run with:  node functions/test-admin.js   (no npm install needed; uses a fake store)
const admin = require('./admin');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => { if (cond) { passed++; console.log('  ok  ', name); } else { failed++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); } };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b });

const NOW = Date.UTC(2026, 9, 26, 10, 0, 0);          // 26 Oct 2026
const DAY = 86400000;
const ts = ms => ({ toMillis: () => ms });

// ── access check ─────────────────────────────────────────────────────────────
const admins = admin.parseAdmins(' Me@Gmail.com , other@x.com ');
const tok = (o = {}) => ({ uid: 'u1', email: 'me@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' }, auth_time: NOW / 1000 - 60, ...o });
const gate = (decoded, o = {}) => admin.authorize({ decoded, adminEmails: admins, enabled: true, nowMs: NOW, needFresh: false, ...o });

ok('listed Google account is allowed (case-insensitive)', gate(tok()).ok === true);
eq('not on the list -> 403', gate(tok({ email: 'x@gmail.com' })).code, 403);
eq('unverified email -> 403', gate(tok({ email_verified: false })).code, 403);
eq('email+password sign-in with an admin email -> 403', gate(tok({ firebase: { sign_in_provider: 'password' } })).code, 403);
eq('no token -> 401', gate(null).code, 401);
eq('switched off -> 503', gate(tok(), { enabled: false }).code, 503);
ok('read works on an old session', gate(tok({ auth_time: NOW / 1000 - 86400 })).ok === true);
const stale = gate(tok({ auth_time: NOW / 1000 - 3600 }), { needFresh: true });
ok('change on a 1-hour-old session needs a fresh sign-in', stale.ok === false && stale.needsFreshSignIn === true);
ok('change on a 5-minute-old session is allowed', gate(tok({ auth_time: NOW / 1000 - 300 }), { needFresh: true }).ok === true);
ok('reads do not need a fresh sign-in; unknown/future actions do', !admin.needsFresh('overview') && admin.needsFresh('grantPremium'));

// ── premium state ────────────────────────────────────────────────────────────
const st = h => admin.premiumState(h, NOW);
eq('premium with future expiry', st({ isPremium: true, premiumExpiry: '2026-11-01' }), 'premium');
eq('premium expired yesterday', st({ isPremium: true, premiumExpiry: '2026-10-25' }), 'premium_expired');
eq('premium expiring today is still premium', st({ isPremium: true, premiumExpiry: '2026-10-26' }), 'premium');
eq('premium with no end date', st({ isPremium: true }), 'premium');
eq('trial day 5', st({ trialStarted: ts(NOW - 5 * DAY) }), 'trial');
eq('trial ended', st({ trialStarted: ts(NOW - 15 * DAY) }), 'trial_ended');
eq('legacy ISO trial in config', st({ config: { trialStarted: new Date(NOW - 2 * DAY).toISOString() } }), 'trial');
eq('free', st({}), 'free');

// ── fake store ───────────────────────────────────────────────────────────────
const HH = [
  { id: 'AAA', owner: 'u1', memberUids: ['u1', 'u2'], isPremium: true, premiumExpiry: '2026-12-01', _created: NOW - 40 * DAY, config: { secretBudget: 'PRIVATE-123' } },
  { id: 'BBB', owner: 'u2', memberUids: ['u2'], trialStarted: ts(NOW - 3 * DAY), _created: NOW - 3 * DAY, config: {} },
  { id: 'CCC', owner: 'u3', memberUids: ['u3'], _created: NOW - 90 * DAY, config: { isPremium: true } },        // Premium only in old config
  { id: 'DDD', owner: 'u3', memberUids: ['u3'], deletedAt: ts(NOW - DAY), _created: NOW - 60 * DAY, config: {} },
];
const store = {
  households: async () => HH,
  household: async id => HH.find(h => h.id === id) || null,
  entryStats: async id => ({ count: id === 'AAA' ? 120 : 0, lastMs: id === 'AAA' ? NOW - DAY : null }),
  recentEntries: async () => [{ item: 'Maize', amount: 5000 }],
  authUsers: async () => [
    { uid: 'u1', email: 'a@x.com', created: NOW - 40 * DAY, lastSignIn: NOW - DAY, providers: ['google.com'] },
    { uid: 'u2', email: 'b@x.com', created: NOW - 2 * DAY, lastSignIn: NOW - 3600000, providers: ['password'] },
    { uid: 'u3', phone: '+265999', created: NOW - 90 * DAY, lastSignIn: null, providers: ['phone'] },
  ],
  userDocs: async () => [{ id: 'u1', ownedHouseholds: ['AAA'], premiumUntil: ts(NOW + DAY) }],
  payments: async () => [
    { id: 'p1', uid: 'u1', householdId: 'AAA', amount: 2500, status: 'paid', createdAtMs: NOW - DAY, paidAtMs: NOW - DAY },
    { id: 'p2', uid: 'u1', householdId: 'AAA', amount: 7000, status: 'paid', createdAtMs: NOW - 40 * DAY, paidAtMs: NOW - 40 * DAY },
    { id: 'p3', uid: 'u2', householdId: 'BBB', amount: 2500, status: 'pending', createdAtMs: NOW - 2 * 3600000 },
    { id: 'p4', uid: 'u2', householdId: 'BBB', amount: 2500, status: 'mismatch', createdAtMs: NOW - DAY },
    { id: 'p5', uid: 'u2', householdId: 'BBB', amount: 2500, status: 'pending', createdAtMs: NOW - 60000 },
  ],
  paymentsFor: async id => [{ id: 'p1', householdId: id, createdAtMs: 1 }, { id: 'p2', householdId: id, createdAtMs: 2 }],
  log: async () => [{ id: 'l1', action: 'x' }],
};
const run = (action, params, extra = {}) => admin.handle({ action, params, store, now: NOW, ...extra });

(async () => {
  let r = await run('overview');
  eq('overview: live and deleted households', r.body.households, { live: 3, deleted: 1 });
  eq('overview: states (config-only Premium shows as free, flagged separately)', r.body.states, { premium: 1, trial: 1, free: 1 });
  ok('overview: revenue total and this month', r.body.revenue.total === 9500 && r.body.revenue.thisMonth === 2500, r.body.revenue);
  eq('overview: sign-ups in last 7 days', r.body.users.last7, 1);
  eq('overview: today and two days ago in the sign-up chart', [r.body.signupsByDay['2026-10-26'], r.body.signupsByDay['2026-10-24']], [0, 1]);
  eq('overview: attention counts', r.body.attention, { stuckPending: 1, needsLook: 1, premiumNotMigrated: 1 });

  r = await run('households');
  eq('households: all four listed, newest first', r.body.rows.map(x => x.id), ['BBB', 'AAA', 'DDD', 'CCC']);
  const aaa = r.body.rows.find(x => x.id === 'AAA');
  ok('households: owner shown by email, entries and last entry', aaa.ownerName === 'a@x.com' && aaa.entries === 120 && aaa.lastEntry === NOW - DAY, aaa);
  ok('households: config is never sent', !JSON.stringify(r.body).includes('PRIVATE-123'));
  eq('households: Premium only in old config is flagged', r.body.rows.find(x => x.id === 'CCC').legacyPremium, true);
  ok('households: deleted flag', r.body.rows.find(x => x.id === 'DDD').deleted === true);

  r = await run('household', { id: 'AAA' });
  ok('detail: members with names and owner flag', r.body.members.length === 2 && r.body.members[0].owner === true && r.body.members[1].name === 'b@x.com', r.body.members);
  ok('detail: entries hidden by default', r.body.recentEntries === null && r.body.entriesHidden === true);
  ok('detail: config not sent, payments newest first', !JSON.stringify(r.body).includes('PRIVATE-123') && r.body.payments[0].id === 'p2');
  r = await run('household', { id: 'AAA' }, { viewEntries: true });
  eq('detail: entries shown when switched on', r.body.recentEntries.length, 1);
  eq('detail: bad id -> 400', (await run('household', { id: '../x' })).code, 400);
  eq('detail: missing household -> 404', (await run('household', { id: 'ZZZ' })).code, 404);

  r = await run('users');
  const u2 = r.body.rows.find(x => x.uid === 'u2'), u1 = r.body.rows.find(x => x.uid === 'u1');
  ok('users: phone-only account is named by phone', r.body.rows.find(x => x.uid === 'u3').name === '+265999');
  ok('users: owned households and premium until', u1.owned === 1 && u1.premiumUntil === NOW + DAY, u1);
  eq('users: account with no user doc still listed', u2.owned, 0);

  r = await run('payments', {});
  eq('payments: stuck ones are flagged (mismatch and old pending, not the new pending)', r.body.rows.filter(x => x.needsLook).map(x => x.id), ['p3', 'p4']);
  eq('payments: source defaults to paychangu', r.body.rows[0].source, 'paychangu');

  eq('log works', (await run('log')).body.rows.length, 1);
  eq('unknown action -> 400', (await run('grantPremium', {})).code, 400);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
