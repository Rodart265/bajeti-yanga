# Changes in 9.20.0 (November 2026): making the claims true

The audit listed things the app said but did not do. Instead of changing the wording, this release makes them true. Deploy
order and every console step are in `ROLLOUT-2026-11.md`.

## App
- Phone sign-in removed (Email and Google stay). Verification and reset e-mails show real errors and return to the app;
  the reset message says about 1 hour.
- Real push notifications (Firebase Cloud Messaging), English and Chichewa: bill due tomorrow and today, a join request (to
  the owner), approval (to the person). Permission is asked once, right after the first bill is saved (or when an owner opens
  the invite code, or a person asks to join), never at startup. Signing out stops notifications on that phone.
- Bajeti AI is Premium only (free trial counts). Free households see an upgrade screen. The AI address is now the payments Worker.
- New households are created by the Worker (one free trial per account, three free households).
- Trash only reads the last 30 days. Waiting-for-approval checks every 15 seconds instead of every 5.
- Privacy policy and FAQ say what is true: staff can view account and household information for support, AI is Premium,
  one trial per account, deleted data is erased after 30 days. Last updated November 2026.

## Payments Worker (`pay-worker/`)
- `POST /chat`: Bajeti AI proxy with Premium check on the server, 300 a day per person, overall daily ceiling, exact counters
  in Firestore that fail closed.
- `createHousehold` action, `notify` action, bill reminders (cron), clean-up (cron): trash older than 30 days, households
  and accounts 30 days after deletion (Firebase sign-in erased too), old AI counters and notification logs.
  Clean-up is a dry run until `PURGE_MODE` is `delete`; the 30 days cannot be shortened.
- 346 offline checks (`node pay-worker/test.mjs`).

## Rules and docs
- `firestore.rules` (and the phase-b copy): households can no longer be created from the browser.
- `firestore.indexes.json`: single-field overrides for `bills.dueDate` and `purchases.deletedAt` (collection group).
- `functions/` and `worker/` marked superseded; `AUDIT-2026-10.md` corrected (two items had been marked fixed in error).
