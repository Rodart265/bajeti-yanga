# Plan: move items, bills and goals out of the household config arrays

## The problem

`households/{code}.config` holds `items`, `bills`, `goals` (and `users`) as **arrays**. `saveCfg()` writes a whole
array when anything inside it changed. If two phones edit the same array at nearly the same time, the second write
silently replaces the first (last write wins). Edits also use list positions (`items[3]`) captured when the screen was
drawn, so a change from another phone in between can point an edit at the wrong row.

Purchases are already fine: they live in their own documents (`households/{code}/purchases/{id}`), so concurrent
edits do not collide.

## Why this was not done in the October 2026 pass

- About 30 places read or write these arrays directly in an 8,000-line single file, and edits use array indexes in
  inline `onclick` handlers. Changing the data model means changing all of them together.
- There is no automated test suite for `index.html`, and this work was done without being able to run the app against
  a real Firestore. A half-working data migration on live family budgets is a worse outcome than the occasional lost edit.
- Existing households must keep working while data is moved.

So it was left as its own project, with the plan below.

## Target shape

```
households/{code}                       config keeps: settings, currency, language, budget numbers, premium fields
households/{code}/items/{itemId}        one document per item     { name, ..., order, updatedAt }
households/{code}/bills/{billId}        one document per bill
households/{code}/goals/{goalId}        one document per goal
```

Document ids are generated (`doc().id`), so rows are found by id, never by position.

## Stages (each one is shippable and reversible)

1. **Ids first, no storage change.** Give every existing array entry a stable `id` the first time it is loaded (and
   to all new entries). Change all handlers to find rows by `id` instead of by index. This alone removes the
   wrong-row bug and is invisible to users. (Bills' "mark paid" already finds by identity.)
2. **Dual write, read old.** On every change also write the sub-collection documents. Keep reading the array. Run
   for a while to find bugs with no user impact.
3. **Backfill.** A one-time job per household (run by the owner's app on open, guarded by a
   `config.schemaVersion` flag) copies the arrays into sub-collections.
4. **Read new.** Switch reads to the sub-collections (`onSnapshot` per collection). Keep writing the array for one
   release so an old cached app still sees data.
5. **Stop writing the array**, then delete the arrays after a safe period.
6. **Rules.** Add `match /items/{id}` etc. under households (members read/write, field validation like purchases:
   numeric amounts, bounded strings, size limits). Done together with stage 2 so the rules exist before data lands.

## Things to decide first

- Ordering: items/bills/goals need an explicit `order` field, since collections have no order.
- Offline: Firestore offline persistence is on, so per-document writes queue fine; confirm behaviour of the backfill
  while offline.
- Cost: more documents means more reads when a household opens. For a family budget (tens of rows) this is small;
  use a single `onSnapshot` per collection, not per document.

## Rough order of work

Stage 1 is the valuable one (days, not weeks). Stages 2 to 5 can follow when you have time to test with real
households. I recommend not skipping stage 2.
