// Growth numbers for the admin console: the counting itself, with no database in it, so test.mjs can check it exactly.
//
// Two things feed it, both written by the app on the person's own profile document (users/{uid}):
//   lastActiveAt   the last day the person opened the app while signed in (written at most once a day, see js/05-household.js)
//   firstEntryAt   when the person added their first real entry by hand (written once; automatic recurring entries do not count)
// Plus Firebase's own sign-in list (created, last sign-in) when the robot is allowed to read it.
//
// Rules this file keeps:
//   - Admin accounts (the emails in ADMIN_OWNERS / ADMIN_SUPPORT / ADMIN_ANALYSTS) are left out of every "active" and "activated"
//     number, so testing the app yourself never inflates them. They still count in plain totals, like in Firebase.
//   - Someone who registered before tracking began is never counted as "not activated": the first-entry cohort only holds
//     people who registered on or after the moment the first phone reported in.
//   - Counts only. Nothing here carries a name, email, phone number or id.

import * as logic from './logic.js';

const DAY = 86400000, HOUR = 3600000, CAT_OFFSET_MS = 2 * HOUR;       // Malawi is UTC+2, no daylight saving
const pad2 = n => String(n).padStart(2, '0');

export const ymdOf = ms => { const [y, m, d] = logic.catYMD(ms); return y + '-' + pad2(m) + '-' + pad2(d); };   // the Malawi date of a moment
export const dayStartMs = day => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d) - CAT_OFFSET_MS; };
// A snapshot built at `now` always describes the Malawi day before it (built just after midnight, in practice).
export const describedDay = now => ymdOf(now - DAY);

const msOf = v => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = new Date(v).getTime(); return Number.isNaN(t) ? null : t;
};
const lower = s => String(s || '').trim().toLowerCase();

// Everyone on any admin list.
export function adminEmailSet(lists) {
  const s = new Set();
  for (const k of ['owner', 'support', 'analyst']) (lists[k] || []).forEach(e => s.add(e));
  return s;
}

// auth      { ok, list: [{ uid, email, created, lastSignIn }] }   (ok:false when the robot may not read the sign-in list)
// userDocs  [{ id, email, lastActiveAt, firstEntryAt }]
// hhs       [{ id, created, deletedAt }]
// day       the Malawi date being described, 'YYYY-MM-DD'
export function growthCounts({ auth, userDocs, hhs, now, day, adminEmails }) {
  const start = dayStartMs(day), end = start + DAY;
  const inDay = ms => ms !== null && ms >= start && ms < end;

  const people = new Map();
  if (auth.ok) auth.list.forEach(u => people.set(u.uid, { email: lower(u.email), created: u.created || null, lastSignIn: u.lastSignIn || null }));
  const docOf = new Map();
  userDocs.forEach(d => {
    docOf.set(d.id, d);
    const p = people.get(d.id);
    if (!p) people.set(d.id, { email: lower(d.email), created: null, lastSignIn: null });
    else if (!p.email) p.email = lower(d.email);
  });

  // The moment the first phone reported in with the new version: everything "since tracking began" is measured from here.
  let trackingStartMs = null;
  userDocs.forEach(d => { const t = msOf(d.lastActiveAt); if (t !== null && (trackingStartMs === null || t < trackingStartMs)) trackingStartMs = t; });

  const u = {
    total: people.size, newInDay: auth.ok ? 0 : null, adminAccounts: 0,
    active1: 0, active7: 0, active30: 0, active7Signin: auth.ok ? 0 : null, active30Signin: auth.ok ? 0 : null, stampedUsers: 0,
    withFirstEntry: 0, newWithFirstEntry: 0, trackingStartMs, cohortRegistered: auth.ok && trackingStartMs !== null ? 0 : null, cohortActivated: auth.ok && trackingStartMs !== null ? 0 : null,
  };
  for (const [uid, p] of people) {
    if (auth.ok && inDay(p.created)) u.newInDay++;
    if (p.email && adminEmails.has(p.email)) { u.adminAccounts++; continue; }
    const d = docOf.get(uid) || {}, act = msOf(d.lastActiveAt), first = msOf(d.firstEntryAt);
    if (act !== null) {
      u.stampedUsers++;
      if (act >= end - DAY) u.active1++;
      if (act >= end - 7 * DAY) u.active7++;
      if (act >= end - 30 * DAY) u.active30++;
    }
    if (auth.ok && p.lastSignIn) { if (p.lastSignIn >= end - 7 * DAY) u.active7Signin++; if (p.lastSignIn >= end - 30 * DAY) u.active30Signin++; }
    if (first !== null) { u.withFirstEntry++; if (inDay(first)) u.newWithFirstEntry++; }
    if (u.cohortRegistered !== null && p.created !== null && p.created >= trackingStartMs) { u.cohortRegistered++; if (first !== null) u.cohortActivated++; }
  }

  const h = {
    live: hhs.filter(x => !x.deletedAt).length,
    newInDay: hhs.filter(x => x.created && x.created >= start && x.created < end).length,
  };
  return { users: u, households: h };
}
