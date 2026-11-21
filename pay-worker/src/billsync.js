// Keeps the per-bill documents that the reminder job reads (households/{id}/bills/{billId}) in step with the bill list
// inside each household's budget (config.bills).
//
// Why: the app saves a bill into the list in the household document first (that list is still the real one) and then also
// as its own document. It only copies bills that CHANGE, and a copy that fails is only written to the browser's log. So bills
// nobody has edited since the copies were introduced have no document, and the reminder job (which can only search
// documents, not lists) never sees them. This job closes that gap from the Worker's side, with no app update:
//   - a bill that is in the list but has no document yet gets one;
//   - a document whose bill is no longer in the list is removed (only when PURGE_MODE is "delete"; in a dry run it is logged);
//   - a document that already exists is NEVER changed here: it was written by the app after the list, so it is newer.
//
// It works through the households a page at a time, in document-id order, remembering where it stopped (syncState/bills), so it
// fits the free plan's 50 requests per run and, over many runs, visits every household and then starts again.
// A household whose list is missing is left alone (it is never treated as "everything was deleted").

import { encodeFields } from './firestore.js';

const PLAIN = /^[A-Za-z0-9_-]{1,40}$/;
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const PAGE = 10;                                        // households looked at per run
const MAX_WRITES = 400;                                 // one commit takes at most 500

// What a bill document may hold (the same shape firestore.rules accepts for bills/{id}); null for a bill that cannot be used.
export function cleanBill(r, position) {
  if (!r || typeof r !== 'object' || !r.id || !PLAIN.test(String(r.id))) return null;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 100) : '';
  const amount = typeof r.amount === 'number' ? r.amount : NaN;
  if (!name || !Number.isFinite(amount) || amount < 0 || amount >= 100000000000) return null;
  if (typeof r.dueDate !== 'string' || !DATE.test(r.dueDate)) return null;
  const out = { id: String(r.id), name, amount, dueDate: r.dueDate, order: position };
  if (typeof r.icon === 'string' && r.icon) out.icon = r.icon.slice(0, 40);
  return out;
}

export async function syncBills({ deps, budget, log, live }) {
  if (budget.left < 6) return { skipped: true };
  budget.left -= 3;                                     // read where we stopped, read one page, write where we stopped
  const state = await deps.db.collection('syncState').doc('bills').get();
  const after = state.exists && typeof state.data().after === 'string' ? state.data().after : '';
  let query = deps.db.collection('households').orderBy('__name__').select('config.bills', 'deletedAt').limit(PAGE);
  if (after) query = query.startAfterId(after);
  const page = await query.get();

  const name = path => deps.db.root + '/' + path;
  let checked = 0, created = 0, orphans = 0, removed = 0, unusable = 0, last = after, finished = true;
  for (const d of page.docs) {
    if (budget.left < 2) { finished = false; break; }   // the next run carries on after the last household that was finished
    const h = d.data(), list = h.config && h.config.bills;
    if (!h.deletedAt && Array.isArray(list)) {
      const want = new Map();
      list.forEach((r, i) => { const c = cleanBill(r, i); if (c) want.set(c.id, c); else unusable++; });
      budget.left -= 1;
      const have = new Set((await deps.db.collection('households/' + d.id + '/bills').select('__name__').get()).docs.map(x => x.id));
      const writes = [];
      for (const [id, c] of want) {
        if (have.has(id) || writes.length >= MAX_WRITES) continue;
        writes.push({ update: { name: name('households/' + d.id + '/bills/' + id), fields: encodeFields({ ...c, updatedAt: deps.tsFromMillis(deps.now()) }) }, currentDocument: { exists: false } });
        created++;
      }
      for (const id of have) if (!want.has(id)) {
        orphans++;
        if (live && writes.length < MAX_WRITES) { writes.push({ delete: name('households/' + d.id + '/bills/' + id) }); removed++; }
      }
      if (writes.length) {
        budget.left -= 1;
        // All or nothing: if the app wrote one of these bills a moment ago, the whole household is simply looked at again next round.
        await deps.db.commitWrites(writes).catch(e => { console.error('bill sync: ' + d.id + ' skipped', e && e.message); created -= writes.filter(w => w.update).length; removed -= writes.filter(w => w.delete).length; });
      }
    }
    checked++; last = d.id;
  }
  const next = finished && page.docs.length < PAGE ? '' : last;
  await deps.db.collection('syncState').doc('bills').set({ after: next, at: deps.tsFromMillis(deps.now()), checked, created, orphans: live ? removed : orphans });
  log('bills: looked at ' + checked + ' households, added ' + created + ' missing bills' + (orphans ? (live ? ', removed ' + removed : ', ' + orphans + ' leftover copies would be removed (dry run)') : '') + (unusable ? ', ' + unusable + ' bills cannot be used (no id, name, amount or date)' : '') + (next === '' ? ' (round complete)' : ''));
  return { checked, created, orphans, removed, unusable, next };
}
