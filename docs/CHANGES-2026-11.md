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

## 9.17.3: Navy & teal colour scheme
- The app moved from purple to the "Navy & teal" direction: primary teal `#176B78`, deep navy `#142F4B`, cool grey canvas `#F3F6F8`. The coloured top bar stays, now teal.
- Dark mode retuned: the purple-tinted and neutral-grey dark surfaces are now navy-tinted (`#0F1720` page, `#17212C` cards).
- Changed in `styles.css`, `glass.css`, `index.html` (theme-color, boot splash), `manifest.webmanifest`, the four PNG icons, and the inline colours in `js/`.
- Member colours already saved in Firestore are not migrated; existing members keep their old colour (purple for the default Person 1). New members and the chart palettes use teal first.
- No functions or rules change, so there is nothing to deploy beyond the hosting files.

## 9.17.4: safer updates and clearer failures
- **Updates are all-or-nothing.** A phone downloads the whole release before switching to it. If any file fails, or a deploy is caught half-way and the files do not belong together, the phone keeps the old release and retries later. Old and new files can no longer be mixed (`sw.js`).
- **Each release is pinned.** The app loads from its saved release (fast on weak connections, works offline) instead of racing the network file by file.
- **A forgotten version bump can no longer slip out.** `node tools/release.js` writes the version and a fingerprint of every shipped file into `sw.js`; `node tests/release.test.js` fails if that was not done, if `sw.js` and `index.html` disagree about the scripts, or if a listed file is missing. See `docs/RELEASING.md`.
- **Crash handling.** A screen that cannot be drawn shows "This screen couldn't load" with Try again, Reload app and Copy details instead of a blank screen. Uncaught errors in the app's code are kept in an on-device log and shown as one calm toast a minute. A script that fails to download at start is reported within a second instead of after 9.
- **Minimum version switch.** `version.json` can require a minimum version; older phones see a full-screen Update now page. It never blocks anyone when the check itself fails (offline, slow, unreadable).
- New Chichewa strings (please have a native speaker check them): "Tsambali silinatsegulike", "Zolemba zanu zili bwino. Yesaninso, kapena tsegulaninso pulogalamu.", "Koperani zambiri za vutoli", "Chinachake chinalakwika. Ngati chikupitirira, tsegulaninso pulogalamu.", "Kuti mupitirize kugwiritsa ntchito pulogalamu, dinani batani pansipa. Zolemba zanu zili bwino.", "Lumikizanani ndi intaneti, kenako yesaninso."
- The first deploy of this version still reaches phones the old way (they pick up the new `sw.js`); from then on updates follow the rules above.

## 9.17.5: Chipereganyu you can trust

Everything here is about the Chipereganyu feature (`js/06-chipereganyu.js`, the Chipereganyu part of both rules files, a few styles).

### Publish in this order (rules FIRST this time)

The new rules accept both the old app and the new one, so nothing breaks while phones update. If the new app went out first, "I have sent it" would be refused until the rules were published.

1. Publish the rules in the Firebase console: `firestore.rules` (Phase A), or `firestore.phase-b.rules` if Phase B is what is live now. Both files carry the same Chipereganyu changes.
2. Merge the app change (GitHub Pages). `node tools/release.js` and `node tests/release.test.js` have been run for 9.17.5.
3. Later, once every phone is on 9.17.5 (raise `min` in `version.json` to `9.17.5` and wait a few days): in the rules, change `legacySelfPaid()` to `return false;` and publish again. From then on a contributor can only say "I've sent it"; only the recipient or the admin can mark a contribution received. This step needs no new app version.

Until step 3, a phone still on the old app can mark its own contribution paid by itself, and an old phone looking at a finished circle sees it as "gathering" (it cannot start anything: the rules refuse).

### What changed

Honest records (Step 1)
- The Remind button opens WhatsApp with a ready message (amount, circle name, due date). It no longer says "Reminder sent".
- Every payout records `collected`, what really came in. History shows "MK15,000 of MK20,000 · short by MK5,000". Older entries stay as they were.
- The ring in the middle now shows collected / expected, so it always agrees with the amount under it. A note explains a short round ("Short by MK5,000: 1 member left before paying").
- A member who paid and then leaves (or is removed) is no longer erased: their payment moves to `currentCycle.departedPaid` and still counts, and History keeps the recipient's name even after they leave.
- Confirming a round that is short because someone left asks first.
- Chichewa Home card: "Gawo la Asher · pofika 25/11/2026" instead of "Asher's gawo".

Paid vs received (Step 2)
- A contributor taps **I've sent it** (`sent`, `sentAt`); only the recipient or the admin can mark it **Received** (`paid`). Only received money counts as collected. Either step can be undone (the recipient/admin undo a Received; a contributor undoes their own Sent until it is confirmed).
- The expense is logged to the contributor's budget when they tap "I've sent it", and removed if they take it back.
- Force confirm lists who is not confirmed and records the round as short.

Laps and a proper end (Step 3)
- New circles get a **pay day** (day of the month, or weekday). Later due dates step on from the previous due date instead of the day the payout was confirmed, and dates already in the past are skipped. Older circles (no pay day) keep their rhythm from their last due date.
- A contribution past its due date shows **Overdue by N days** (the Home card says "overdue" too). "Sent" is not overdue.
- History entries and rounds carry a `lap`. Older entries get theirs worked out when read (a lap ends when a recipient comes round again), so the Received/Upcoming labels and the "move up" guard are per lap and reset when a new lap starts.
- When everyone has received, the circle becomes **completed** (`status: 'completed'`, no current round) instead of silently looping. The admin can reorder, **start another lap** (same members), or **close** the circle. Closed circles leave Home; the admin can delete a completed or closed circle, and members can remove it from their list.
- The gathering screen shows the pot (contribution × (members − 1)) and the pay day before the admin presses Start.

### Data and rules (all additive)
- New optional fields: group `dueDay`; round `lap`, `departedPaid`; contribution `sent`, `sentAt`; history `lap`, `collected`, `recipientName`, `departed`. New group `status` values `completed` and `closed`. No migration.
- New rule functions: `legacySelfPaid`, `ownEntryOk`, `freshCycleOk`, `historyAppendOk`, `validChipLapComplete`, `validChipNewLap`, `validChipClose`, `departedOk`. Reordering is also allowed while `completed`; leaving/removal also while `completed` or `closed`.
- `tests/chip.test.js` (new) covers dates, laps and round money. Run: `node tests/chip.test.js`.

### Please check

- **The rules were not run against the Firestore emulator** (it could not be downloaded where this was built). They were reviewed by hand, and then read again by a second reviewer who traced every app write against them; that review found and fixed: confirming your own "sent" entry being refused (stale `sentAt`), a contributor being able to take back the recipient's confirmation, any member being able to rewrite `lap`/`departedPaid` through a contribution write, a paid member leaving without their payment being recorded, and a leaver being able to rename other members. Before relying on the rules, try the flows below with 3 test accounts, and use the Rules Playground in the console for anything that is refused unexpectedly.
- **Older circles keep an approximate pay day.** A circle made before 9.17.5 has no pay day, so its next due dates follow the day of its last due date (a 31st that was clamped to the 28th stays on the 28th). Only new circles get a chosen pay day.
- While `legacySelfPaid()` is true, an old phone can still self-mark paid and leave a round without recording a payment in `departedPaid`; both are refused once it is switched off.
- **New Chichewa strings need a native speaker**: "Ndatumiza", "Zatumizidwa", "Zalandiridwa", "Bwezerani", "Yachedwa masiku N", "Tsiku lolipira", "Kuzungulira" (lap), "Yambani kuzungulira kwina", "Tsekani Chipereganyu ichi", "Chipereganyu chodalirika" (What's New), the WhatsApp reminder text, and the short-round / confirm messages.
- Still one-sided: income is logged to the recipient's budget only when the recipient confirms the payout on their own phone, and a contributor's expense only when they tap "I've sent it". If someone else marks it for them, their budget does not change. (The earlier decision to prompt each time before logging payout income is not done yet.)

### Test with 3 accounts (A admin, B, C)
- Create a monthly circle with pay day 31 and a weekly one; the gathering screen shows the pot and the pay day.
- B and C join; A starts. A is the first recipient.
- B taps "I've sent it": the row says Sent, B's budget has the expense, the ring does not move. A taps Mark received: Received, ring moves. B undoes Sent before A confirms: expense disappears.
- C marks sent, then leaves before A confirms: the round shows "Short by MK…". A confirms: History shows "of MK… · short by MK…"; A's budget income equals what was collected.
- Round where B paid and was confirmed, then B leaves: the note "Paid, then left: B" shows and the money still counts.
- Let the due date pass (or edit `dueDate` in the console): rows show Overdue.
- Finish every turn: the circle shows "Everyone has received"; reorder, Start another lap (Lap 2, recipient is first in order), then finish and Close. Closed circle disappears from Home; delete it as admin.
- A non-admin tries to mark their OWN contribution received from the console: allowed until step 3 above, refused after it.
