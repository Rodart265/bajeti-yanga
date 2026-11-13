# 9.19.4: stage 2 of the move to one document per record

Items, bills and goals are still read and saved the same way as before. In addition, every time one of them is added,
changed, re-ordered or removed, the same change is written to its own document:

```
households/{code}/items/{id}     { id, name, budget, cat?, order, updatedAt }
households/{code}/bills/{id}     { id, name, amount, dueDate, icon?, order, updatedAt }
households/{code}/goals/{id}     { id, name, target, saved, deadline?, order, updatedAt }
```

**Nothing reads these documents yet**, so nobody sees any difference. This stage exists to find problems before anything
depends on the new documents.

## What changed

- `js/02-helpers.js`: `recMirrorOps(prev, next)` works out which records changed (pure function, tested).
- `js/05-household.js`: `mirrorRecs(prev, next)` writes them in batches of at most 400. `saveCfg()` calls it only after the
  main save has worked. A failure is logged to the console and never shown to the person.
- `js/08-history-summary.js`: "Mark paid" is a second place that saves the bills (a transaction online, a queued batch
  offline). Both now call `mirrorRecs()` too.
- `firestore.rules`: new `items`, `bills` and `goals` blocks under `households/{hhId}`. Members read, create, update and
  delete; the document id must equal the record's id; names are 1 to 100 characters; numbers must be numbers of sensible
  size; a bill's `dueDate` must look like `YYYY-MM-DD`; a record holds at most 12 fields.
- `tests/subcol.test.js`: 18 checks. `docs/DATA-MODEL-PLAN.md`: status updated.

## Known limits of this stage

- Each phone copies only its own changes, so the new documents can fall behind the lists (for example if a phone is
  offline for a long time, or a change is rejected by the new rules). Stage 3 (backfill) puts every household right
  before anything reads the new documents.
- The household create and "approve member" writes still send the whole config; they are covered by the stage 3 backfill.
- The rules were read through but not run in the Firestore emulator (no network in the build environment). Test on the
  test households first.

## Roll-out (in this order)

1. Firebase console, Firestore, Rules: paste the new `firestore.rules` and Publish. The new rules only add permissions.
2. Upload the changed files to GitHub and wait for GitHub Pages.
3. On a test household: add, edit and delete an item, a bill and a goal; use "Mark paid" on a bill.
4. Firebase console, Firestore, Data: open `households/{code}` and check that the `items`, `bills` and `goals`
   sub-collections hold matching documents, with `order` set.
5. Watch the browser console for `[mirror]` warnings (a warning means a record was refused by the rules).
