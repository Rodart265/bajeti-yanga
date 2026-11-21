// Push notifications: bills due, someone asked to join, request approved.
//
// How it works (all free): each phone registers with Firebase Cloud Messaging (FCM) and the app saves that address (a
// "token") in the household document, pushTokens.<uid> = { tokens: [...], lang }, which is used for bill reminders and
// for telling an owner about a join request, and in the person's own user document (pushTokens, pushLang), which is
// used to tell someone their request was approved before they are a member. This Worker sends through FCM's HTTP v1
// API with the Google service account it already has. The phone's service worker (sw.js) shows the message.
//
// The Cloudflare free plan allows 50 outgoing requests per run, so the daily job keeps a `budget` and stops before it
// runs out; households not reached are picked up by the next run (it runs every 15 minutes through the morning). A log
// document per household and day (pushLog/...) makes sure nobody is told twice. One lookup at the start of each run lists
// the households already dealt with today, so they cost nothing; only households that are still waiting use the budget.

import { catDate } from './ai.js';

export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const MAX_TOKENS_PER_USER = 3;
const MAX_TOKENS_PER_HOUSEHOLD = 24;                    // phones told per household per day (the free plan's request limit is shared by all households)
const MAX_TRIES = 3;                                    // a household is tried at most this often per day, and only again when NOTHING got through
const HH = /^[A-Za-z0-9_-]{3,40}$/;

export function makeFcm({ projectId, getToken, fetchImpl }) {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  return {
    // Data-only message: sw.js decides how to show it. `invalid` is true when Google says the address no longer exists.
    async send(token, { title, body, tag, link }) {
      const r = await (0, fetchImpl || fetch)(url, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + (await getToken()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token, data: { title, body, tag: tag || '', url: link || '' }, webpush: { headers: { TTL: '86400', Urgency: 'normal' } } } }),
      });
      if (r.ok) return { ok: true };
      let j = null; try { j = await r.json(); } catch (_) {}
      const st = j && j.error && j.error.status;
      return { ok: false, status: r.status, invalid: r.status === 404 || st === 'NOT_FOUND' || st === 'UNREGISTERED' };
    },
  };
}

const asTokens = v => (Array.isArray(v) ? v.filter(t => typeof t === 'string' && t).slice(-MAX_TOKENS_PER_USER) : []);
const entryOf = (map, uid) => { const e = map && map[uid]; return { tokens: asTokens(e && e.tokens), lang: e && e.lang === 'cw' ? 'cw' : 'en' }; };
const money = n => 'MK ' + Math.round(Number(n) || 0).toLocaleString('en-US');

// ── wording, English and Chichewa ────────────────────────────────────────────────────────────────────────────────────
export const words = {
  joinRequest: (lang, name) => lang === 'cw' ? `${name} akupempha kulowa m'nyumba yanu.` : `${name} wants to join your household.`,
  joinApproved: lang => lang === 'cw' ? 'Pempho lanu lavomerezedwa. Mwalowa!' : 'Your request was approved. You are in!',
  bills(lang, today, tomorrow) {
    const list = bs => bs.map(b => `${b.name} (${money(b.amount)})`).join(', ');
    const parts = [];
    if (today.length) parts.push(lang === 'cw' ? `Lero: ${list(today)}.` : `Due today: ${list(today)}.`);
    if (tomorrow.length) parts.push(lang === 'cw' ? `Mawa: ${list(tomorrow)}.` : `Due tomorrow: ${list(tomorrow)}.`);
    return parts.join(' ');
  },
  billTitle: (lang, today) => lang === 'cw' ? (today.length ? 'Bajeti Yanga: Bilu ya lero' : 'Bajeti Yanga: Bilu ya mawa') : (today.length ? 'Bajeti Yanga: Bill due today' : 'Bajeti Yanga: Bill due tomorrow'),
};

// Sends to every saved address of one person and drops the ones Google says are gone. Returns how many were sent and how
// many failed for a reason that may pass (Google busy, network): `temporary`. A dead address is not a temporary failure.
async function sendToTokens({ fcm, tokens, msg, spend, prune }) {
  let sent = 0, temporary = 0; const dead = [];
  for (const t of tokens) {
    spend(1);
    const r = await fcm.send(t, msg).catch(e => { console.error('push send failed', e && e.message); return { ok: false }; });
    if (r.ok) sent++; else if (r.invalid) dead.push(t); else temporary++;
  }
  if (dead.length && prune) { spend(3); await prune(tokens.filter(t => !dead.includes(t))).catch(() => {}); }
  return { sent, temporary };
}

// Removes dead addresses of ONE member from the household's pushTokens map, leaving everyone else's alone. The whole map
// is read and written back in one all-or-nothing step, because a single field inside a map cannot be changed on its own here.
function pruneHousehold(deps, hhId, uid) {
  return keep => deps.db.runTransaction(async tx => {
    const ref = deps.db.collection('households').doc(hhId);
    const snap = await tx.get(ref, ['pushTokens']);
    if (!snap.exists) return;
    const map = { ...((snap.data().pushTokens) || {}) };
    if (!map[uid]) return;
    map[uid] = { ...map[uid], tokens: keep };
    tx.set(ref, { pushTokens: map }, { merge: true });
  });
}

// Creates a log document only if it does not exist yet, in ONE request (Firestore itself refuses to create it twice).
// True when this call created it, false when somebody already had.
async function claim(deps, col, id, extra = {}) {
  try { await deps.db.collection(col).doc(id).create({ at: deps.tsFromMillis(deps.now()), ...extra }); return true; }
  catch (e) { if (e && (e.status === 409 || (e.status === 400 && /exist/i.test(String(e.message))))) return false; throw e; }
}
// Gives a claim back (after a send where nothing got through for a temporary reason), so the person can be told later.
const release = (deps, col, id) => deps.db.collection(col).doc(id).delete().catch(() => {});

// ── the app asks us to tell someone ──────────────────────────────────────────────────────────────────────────────────
export async function handleNotify({ deps, fcm, user, body }) {
  const hhId = body && body.householdId;
  if (typeof hhId !== 'string' || !HH.test(hhId)) return { code: 400, body: { error: 'Invalid household.' } };
  const spend = () => {};
  const hh = await deps.db.collection('households').doc(hhId).get(['owner', 'memberUids', 'deletedAt', 'pushTokens']);
  if (!hh.exists || hh.data().deletedAt) return { code: 404, body: { error: 'Not found.' } };
  const h = hh.data();

  if (body.type === 'join-request') {
    // The person must really have a pending request (the security rules only let them write their own).
    const rq = await deps.db.collection('households/' + hhId + '/joinRequests').doc(user.uid).get();
    if (!rq.exists) return { code: 404, body: { error: 'No request found.' } };
    const r = rq.data();
    // Told at most once per person, per household and per day. (The request itself can be rewritten any number of times by
    // its writer, so its own time cannot be what limits this.)
    const id = 'join_' + hhId + '_' + user.uid + '_' + catDate(deps.now());
    if (!(await claim(deps, 'pushLog', id))) return { code: 200, body: { ok: true, sent: 0 } };
    const name = String(r.displayName || (r.email ? String(r.email).split('@')[0] : '') || 'Someone').slice(0, 40);
    const owner = entryOf(h.pushTokens, h.owner);
    const out = await sendToTokens({ fcm, spend, tokens: owner.tokens, msg: { title: 'Bajeti Yanga', body: words.joinRequest(owner.lang, name), tag: 'join-' + user.uid, link: '' },
      prune: pruneHousehold(deps, hhId, h.owner) });
    if (out.sent === 0 && out.temporary > 0) await release(deps, 'pushLog', id);
    return { code: 200, body: { ok: true, sent: out.sent } };
  }

  if (body.type === 'join-approved') {
    if (h.owner !== user.uid) return { code: 403, body: { error: 'Only the owner can do that.' } };
    const target = body.uid;
    if (typeof target !== 'string' || !Array.isArray(h.memberUids) || !h.memberUids.includes(target) || target === user.uid) return { code: 400, body: { error: 'Invalid member.' } };
    const aid = 'approved_' + hhId + '_' + target;
    if (!(await claim(deps, 'pushLog', aid))) return { code: 200, body: { ok: true, sent: 0 } };
    const u = await deps.db.collection('users').doc(target).get(['pushTokens', 'pushLang']);
    const ud = u.exists ? u.data() : {};
    const out = await sendToTokens({ fcm, spend, tokens: asTokens(ud.pushTokens), msg: { title: 'Bajeti Yanga', body: words.joinApproved(ud.pushLang === 'cw' ? 'cw' : 'en'), tag: 'approved-' + hhId, link: '' },
      prune: keep => deps.db.collection('users').doc(target).set({ pushTokens: keep }, { merge: true }) });
    if (out.sent === 0 && out.temporary > 0) await release(deps, 'pushLog', aid);
    return { code: 200, body: { ok: true, sent: out.sent } };
  }
  return { code: 400, body: { error: 'Unknown notification.' } };
}

// ── daily bill reminders (run from the timer in the morning, Malawi time) ───────────────────────────────────────────────
// One query per day (today, tomorrow) across ALL households reads only the bills that are due; each household's members
// are then told once. Needs the collection-group index on bills.dueDate (docs/ROLLOUT-2026-11.md).
//
// The Cloudflare free plan allows 50 requests per run, so the work is counted exactly:
//   - ONE query lists the households already dealt with today (pushLog.day == today), they cost nothing more;
//   - for a household still waiting: 1 read, 1 request to claim it (before sending, so it is told at most once a day even
//     if a run is cut short), 1 per phone, and room to drop dead phones; a household with nobody to tell is claimed too
//     (done), so later runs do not read it again;
//   - if every send failed for a temporary reason the claim is marked "not done" and a later run tries again (at most
//     MAX_TRIES times a day). If even one phone was reached, the household is done.
export async function runBillReminders({ deps, fcm, budget = { left: 44 } }) {
  const spend = n => { budget.left -= n; };
  const t0 = catDate(deps.now()), t1 = catDate(deps.now() + 86400000);
  const byHh = new Map();
  for (const [date, slot] of [[t0, 'today'], [t1, 'tomorrow']]) {
    spend(1);
    const res = await deps.db.collectionGroup('bills').where('dueDate', '==', date).get();
    for (const d of res.docs) {
      const m = /^households\/([^/]+)\/bills\/[^/]+$/.exec(d.path || '');
      if (!m) continue;
      const e = byHh.get(m[1]) || { today: [], tomorrow: [] };
      const b = d.data();
      e[slot].push({ name: String(b.name || 'Bill').slice(0, 40), amount: b.amount });
      byHh.set(m[1], e);
    }
  }
  // Who is already dealt with today? (Claims written before this change have no `day` and are simply tried once more.)
  const finished = new Set(), tried = new Map();
  if (byHh.size) {
    spend(1);
    const logged = await deps.db.collection('pushLog').where('day', '==', t0).get();
    for (const d of logged.docs) {
      const m = /^bills_(.+)_\d{4}-\d{2}-\d{2}$/.exec(d.id);
      if (!m) continue;
      const x = d.data(), n = Number(x.tries) || 1;
      if (x.done === true || n >= MAX_TRIES) finished.add(m[1]); else tried.set(m[1], n);
    }
  }
  let households = 0, sent = 0, waiting = 0, retried = 0;
  for (const [hhId, bills] of byHh) {
    if (finished.has(hhId)) continue;
    if (budget.left < 6) { waiting++; continue; }                    // not even a small household fits; the next run carries on
    spend(1);
    const hh = await deps.db.collection('households').doc(hhId).get(['memberUids', 'deletedAt', 'pushTokens']);
    const logId = 'bills_' + hhId + '_' + t0;
    if (!hh.exists || hh.data().deletedAt) { spend(1); await claim(deps, 'pushLog', logId, { day: t0, tries: 1, done: true }).catch(() => false); continue; }
    const h = hh.data(), targets = [];
    let tokenCount = 0;
    for (const uid of (Array.isArray(h.memberUids) ? h.memberUids : [])) {
      const e = entryOf(h.pushTokens, uid);
      if (!e.tokens.length || tokenCount + e.tokens.length > MAX_TOKENS_PER_HOUSEHOLD) continue;
      targets.push({ ...e, uid }); tokenCount += e.tokens.length;
    }
    const need = tokenCount ? 1 + tokenCount + 3 + 1 : 1;            // claim + one per phone + dropping dead phones + marking a failed try
    if (budget.left < need) { waiting++; continue; }
    const n = (tried.get(hhId) || 0) + 1;
    spend(1);
    if (tried.has(hhId)) await deps.db.collection('pushLog').doc(logId).update({ tries: n, done: true }).catch(() => {});
    else if (!(await claim(deps, 'pushLog', logId, { day: t0, tries: n, done: true }).catch(() => false))) continue;
    if (!tokenCount) continue;
    households++;
    let gotThrough = 0, failed = 0;
    for (const e of targets) {
      const out = await sendToTokens({ fcm, spend, tokens: e.tokens, msg: { title: words.billTitle(e.lang, bills.today), body: words.bills(e.lang, bills.today, bills.tomorrow), tag: 'bills-' + t0, link: '' },
        prune: pruneHousehold(deps, hhId, e.uid) });
      gotThrough += out.sent; failed += out.temporary;
    }
    sent += gotThrough;
    if (gotThrough === 0 && failed > 0) {                             // nothing got through, and it may pass: try again on a later run
      retried++; spend(1);
      await deps.db.collection('pushLog').doc(logId).update({ done: false }).catch(() => {});
    }
  }
  return { households, sent, waiting, retried };
}
