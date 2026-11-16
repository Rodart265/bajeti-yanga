// Clean-up jobs that Firebase's paid Cloud Functions would normally do. They run from the Worker's timer (every 2 hours).
//
//   1. Trash: entries a person deleted more than 30 days ago are removed for good (the app promises "30 days in Trash").
//   2. Households: a household whose owner asked for deletion more than 30 days ago is erased, with everything in it.
//   3. Accounts: an account that asked for deletion more than 30 days ago is erased: the sign-in itself (Firebase
//      Authentication) and the profile document. Payment records are kept (they are financial records).
//   4. Housekeeping of the Worker's own counters (AI use per day, notification logs), so they do not pile up.
//
// SAFETY: nothing is deleted unless the setting PURGE_MODE is exactly "delete". Any other value, including nothing, is a
// DRY RUN: the Worker only writes to the log what it WOULD remove, so the owner can look first. The 30 days can be made
// longer with PURGE_DAYS but never shorter.
//
// The Cloudflare free plan allows 50 outgoing requests per run, so every step spends from a shared `budget` and stops when
// it is nearly used up; the next run carries on where this one stopped.

import { catDate } from './ai.js';

const DAY = 86400000;
const HOUSEHOLD_SUBCOLLECTIONS = ['purchases', 'items', 'bills', 'goals', '_usage', '_conversations', 'joinRequests'];
const ID = /^[A-Za-z0-9_-]{3,128}$/;

export const purgeDays = env => Math.max(30, Number(env && env.PURGE_DAYS) || 30);
export const purgeLive = env => String((env && env.PURGE_MODE) || '').toLowerCase() === 'delete';

const fullName = (db, path) => db.root + '/' + path;

// 1. ── trash ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// Deleted purchases carry deletedAt as an ISO text (2026-10-01T08:00:00.000Z), which sorts correctly as text.
export async function purgeTrash({ deps, env, budget, log }) {
  if (budget.left < 4) return { skipped: true };
  const cutoff = new Date(deps.now() - purgeDays(env) * DAY).toISOString();
  budget.left -= 1;
  const res = await deps.db.collectionGroup('purchases').where('deletedAt', '<', cutoff).select('__name__').limit(400).get();
  const paths = res.docs.map(d => d.path).filter(p => /^households\/[^/]+\/purchases\/[^/]+$/.test(p || ''));
  if (!purgeLive(env)) { log('trash: would remove ' + paths.length + ' entries (dry run)'); return { found: paths.length, removed: 0, dryRun: true }; }
  if (paths.length) { budget.left -= 1; await deps.db.commitWrites(paths.map(p => ({ delete: fullName(deps.db, p) }))); }
  log('trash: removed ' + paths.length + ' entries');
  return { found: paths.length, removed: paths.length };
}

// 2. ── households ─────────────────────────────────────────────────────────────────────────────────────────────────────
async function eraseHousehold({ deps, budget, id }) {
  const base = 'households/' + id;
  for (const sub of HOUSEHOLD_SUBCOLLECTIONS) {
    for (;;) {
      if (budget.left < 4) return false;                              // out of requests: carry on next run
      budget.left -= 2;
      const r = await deps.db.deleteSubcollection(base, sub, 450);
      if (!r.more) break;
    }
  }
  // the join-code stub and the "approved" markers under it
  for (;;) {
    if (budget.left < 4) return false;
    budget.left -= 2;
    const r = await deps.db.deleteSubcollection('invites/' + id, 'approved', 450);
    if (!r.more) break;
  }
  if (budget.left < 2) return false;
  budget.left -= 1;
  await deps.db.commitWrites([{ delete: fullName(deps.db, 'invites/' + id) }, { delete: fullName(deps.db, base) }]);   // the household itself goes last
  return true;
}

export async function purgeHouseholds({ deps, env, budget, log }) {
  if (budget.left < 8) return { skipped: true };
  const cutoff = deps.now() - purgeDays(env) * DAY;
  budget.left -= 1;
  const res = await deps.db.collection('households').where('deletedAt', '<', deps.tsFromMillis(cutoff)).select('deletedAt').limit(5).get();
  const due = res.docs.filter(d => ID.test(d.id) && d.data().deletedAt && typeof d.data().deletedAt.toMillis === 'function' && d.data().deletedAt.toMillis() < cutoff);
  if (!purgeLive(env)) { log('households: would erase ' + due.length + ' (dry run): ' + due.map(d => d.id).join(', ')); return { found: due.length, erased: 0, dryRun: true }; }
  let erased = 0;
  for (const d of due) {
    if (await eraseHousehold({ deps, budget, id: d.id })) { erased++; log('households: erased ' + d.id); }
    else { log('households: ' + d.id + ' not finished, continues next run'); break; }
  }
  return { found: due.length, erased };
}

// 3. ── accounts ───────────────────────────────────────────────────────────────────────────────────────────────────────
export async function purgeAccounts({ deps, env, identity, budget, log }) {
  if (budget.left < 8) return { skipped: true };
  const cutoff = deps.now() - purgeDays(env) * DAY;
  budget.left -= 1;
  const res = await deps.db.collection('users').where('deletedAt', '<', deps.tsFromMillis(cutoff)).select('deletedAt', 'pendingDeletion').limit(10).get();
  const due = res.docs.filter(d => ID.test(d.id) && d.data().pendingDeletion === true && d.data().deletedAt && typeof d.data().deletedAt.toMillis === 'function' && d.data().deletedAt.toMillis() < cutoff);
  if (!purgeLive(env)) { log('accounts: would erase ' + due.length + ' (dry run): ' + due.map(d => d.id).join(', ')); return { found: due.length, erased: 0, dryRun: true }; }
  let erased = 0, failed = 0;
  for (const d of due) {
    if (budget.left < 4) break;
    try {
      budget.left -= 2;
      await identity.deleteUser(d.id);                               // the sign-in first, so they cannot come back in
      await deps.db.collection('users').doc(d.id).delete();
      erased++; log('accounts: erased ' + d.id);
    } catch (e) {
      failed++; log('accounts: could not erase ' + d.id + ': ' + String(e && e.message).slice(0, 160));   // left in place; tried again next run
    }
  }
  return { found: due.length, erased, failed };
}

// 4. ── the Worker's own counters ───────────────────────────────────────────────────────────────────────────────────────
export async function purgeCounters({ deps, env, budget, log }) {
  if (budget.left < 6) return { skipped: true };
  const live = purgeLive(env);
  const out = { aiUsage: 0, pushLog: 0 };
  budget.left -= 1;
  const oldDay = catDate(deps.now() - 14 * DAY);                    // keep two weeks of AI counters
  const ai = await deps.db.collection('aiUsage').where('day', '<', oldDay).select('__name__').limit(200).get();
  budget.left -= 1;
  const logs = await deps.db.collection('pushLog').where('at', '<', deps.tsFromMillis(deps.now() - 7 * DAY)).select('__name__').limit(200).get();
  const jobs = [['aiUsage', ai.docs.map(d => 'aiUsage/' + d.id)], ['pushLog', logs.docs.map(d => 'pushLog/' + d.id)]];
  for (const [name, paths] of jobs) {
    if (!paths.length) continue;
    if (live && budget.left >= 2) { budget.left -= 1; await deps.db.commitWrites(paths.map(p => ({ delete: fullName(deps.db, p) }))); out[name] = paths.length; }
    else log('counters: ' + (live ? 'later: ' : 'would remove ') + paths.length + ' ' + name + (live ? '' : ' (dry run)'));
  }
  return out;
}

// Runs the four jobs in order; one failing never stops the others.
export async function runHousekeeping({ deps, env, identity, budget = { left: 38 } }) {
  const lines = [], log = s => { lines.push(s); console.log(s); };
  const result = { mode: purgeLive(env) ? 'delete' : 'dry-run' };
  for (const [name, fn] of [['trash', purgeTrash], ['households', purgeHouseholds], ['accounts', purgeAccounts], ['counters', purgeCounters]]) {
    try { result[name] = await fn({ deps, env, identity, budget, log }); }
    catch (e) { result[name] = { error: String(e && e.message).slice(0, 200) }; console.error('housekeeping ' + name + ' failed', e && e.message); }
  }
  return result;
}
