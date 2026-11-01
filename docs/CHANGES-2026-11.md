# Changes in 9.17.0 and 9.17.1 (November 2026)

This round fixes the review findings that do not involve the AI worker. The worker (`worker/`) is untouched.

## Publish in this order

1. Merge the app change (GitHub Pages). The service worker is now `bajeti-v9.17.0`.
2. `firebase deploy --only firestore:indexes,functions`. This adds the daily `purgeTrash` function and the index the
   payment rate limit needs. Wait until the console shows the index as built.
3. Publish `firestore.rules` (Phase A) in the Firebase console. Do this after step 1, because the new rule that asks
   for a verified email depends on the app refreshing the sign-in token (changed in `js/04-auth.js`).
4. Later, when every household owner has opened the new app once: publish `firestore.phase-b.rules` instead.

## What changed

Rules (`firestore.rules`, based on the copy you sent)
- A join request's `email` must match the signed-in account's email.
- Password accounts need a verified email to create a household, a chip group or a join request.
- Purchase `date` must look like YYYY-MM-DD (it only checked the length before), which also closes the unescaped-date
  route into the page.
- Entries with no `type` field count as expenses, so old entries can still be edited, trashed and restored.
- Chip group `currency` is capped at 8 characters.
- `firestore.phase-b.rules` is new: household and chip group reads need membership, and a join request needs an invite
  document. The app already copes with the denied reads.

App
- Chat sends the last 20 messages (and at most about 60,000 characters) instead of the whole history.
- Repeating expenses: a trashed item no longer comes back, and "Repeat every budget period" can be switched off in
  Edit Entry. A later one-off entry of the same item does not cancel the repeat.
- "Mark bill paid" runs as a transaction on the live bills, so two members cannot overwrite each other and a bill
  that someone else just paid is not logged twice. Offline it falls back to the old queued batch.
- Entries are loaded for the last 7 months only. Older months load when you go back to them, open History "All" or
  "This year", or export. Trashed entries of any date are always loaded.
- Receipt photos are shrunk to 1600 px JPEG before upload.
- Every AI and payment request has a timeout (30 s, 90 s for scans).
- Wrong PIN guesses are counted: after 5 the keypad locks for 30 s, doubling to a 15 minute cap.
- The edit and save screens validate the date, and the "Updated" toast waits for the write to succeed.
- Prices live in `PLANS` (`js/01-constants.js`); `tests/prices.test.js` checks they equal the server's `PRICES`.
- The back button on Home asks "press back again to exit" instead of never letting the app close.
- Clickable `div`s get `role="button"`, keyboard support and a focus ring; form labels are tied to their fields.
- Text below 11 px is now 11 px, the orange badge is darker for contrast, and money fields show a decimal keypad.
- Privacy text now says what the AI features send to Gemini.
- `.gitignore` excludes service-account keys. `batch1.patch` is removed.

Functions
- `purgeTrash` deletes entries that have been in the trash for over 30 days (daily, 03:00 Malawi time).
- The payment rate limit now counts the last 10 minutes properly (needs `firestore.indexes.json`).
- A payment on a household with Premium that has no end date is recorded with a refund note.

## 9.17.1: error messages

- Sign-in and sign-up no longer hide the real error. `fmtAErr` knows about 20 more codes (including a Firebase password
  policy, a restricted API key and a blocked web address), and an unknown code is shown in the message and logged to the
  console, instead of "Something went wrong."
- New `fsErrMsg()` in `js/02-helpers.js` turns Firestore errors into plain sentences. It replaces raw text such as
  "Error: Missing or insufficient permissions" and "Failed: permission-denied" in household setup, the chip groups,
  entries, trash, approvals and settings (15 places).

## Not done

- Everything on the worker.
- Removing `'unsafe-inline'` from the CSP (needs the inline handlers rewritten).
- Bundling and minifying the JavaScript.
- Moving items, bills and goals into their own documents.
- Removing the old `config.isPremium` fallbacks: run `migrate-premium.js` first.

## Checks to do on a real device

- Sign up with email and password, verify, then create a household straight away (the verified-email rule).
- Join a household as a second account; check the owner sees the right email.
- Go back several months on Home and open History > All: older entries should appear after a moment.
- Export a CSV for a month older than 7 months.
- Mark a bill paid on two phones at once.
- Scan a receipt on a phone camera photo.

## 9.17.2: shorter Premium screen and new prices
- Premium screen is shorter: slim header, feature tiles without sub-text, and the Proceed to Payment button is pinned at the bottom of the sheet.
- Prices are now MK 1,500 (1 month) and MK 4,000 (3 months). Changed in `js/01-constants.js` and `functions/lib.js`. **Deploy the functions** (`firebase deploy --only functions`) or the server will keep charging the old prices and payments will be flagged as a mismatch.
