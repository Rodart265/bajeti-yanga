# Batch B (security fixes) — 2026-11-20

No app files changed. The app version stays 9.20.1, so users get no update and the Android app is not affected.
Changed: the admin page, the payments Worker, `firestore.rules`.

## What changed and why

| Area | Change | Why |
|---|---|---|
| `admin/admin.js` | Every value in the circle table is escaped. | A circle's `lap` was printed as raw HTML, so a circle admin could plant a script that runs in the admin's signed-in page. |
| `admin/index.html` | Content-Security-Policy (only own files, Google's Firebase scripts, fonts, the Worker). | A second wall: even if a script slipped in, the browser would refuse to run it. |
| `pay-worker/src/admin.js` | Circle round and lap leave the Worker only as whole numbers, or `null`. | Same problem, fixed at the source too. |
| `pay-worker/src/firestore.js`, `housekeeping.js` | The trash clean-up only erases a purchase when the **server's** `updateTime` is also older than 30 days. | `deletedAt` of a purchase is written by the phone. A phone with a wrong date could make a fresh deletion look old and get it erased early. |
| `pay-worker/src/ai.js` | At most 2 pictures per request (each up to about 6 MB, 7.5 MB together); no pictures in the system prompt; the body size limit is enforced while reading, even without a Content-Length header; default output limit 4096; every non-Google sign-in needs a verified email. | Stops one counted request from carrying hundreds of pictures, and closes the anonymous-account door. |
| `pay-worker/src/households.js` | Same verified-email rule. | Same. |
| `pay-worker/src/auth.js` | A token naming an unknown key makes the Worker reload Google's keys at most once a minute. | Forged tokens could otherwise burn the free request allowance. |
| `firestore.rules` | `deletedAt` (households, accounts) must stay as is, be cleared, or equal the server time. Nobody can delete a household document from the app. `legacySelfPaid()` is `false`. Circle `lap` must be a whole number. A member can change only their own `pushTokens` entry. All platform-admin access, the `adminUsers` helper and three unused helpers are removed. | See the review notes: backdated deletion stamps, self-confirmed circle payments, push tokens of other members, broad read access through `adminUsers`. |

## Not changed on purpose
* Members can still delete a purchase permanently (the circle "take back" button deletes a live entry, so a stricter rule would break it).
* `wrangler.toml` (your live settings already fit).
* The payment-attempt ordering (needs a new index; only matters after 200 payments).

## Deploy order
1. Upload the changed files to GitHub. Cloudflare deploys the Worker from there.
2. Open `https://bajeti-pay.kabangorodrick6.workers.dev/health`. It must still say it is healthy.
3. Open the admin page, sign in with Google. If sign-in or the pages break, remove the one `Content-Security-Policy` line from `admin/index.html` and upload that file again.
4. Firebase console, Firestore Database, Rules: replace the text with the new `firestore.rules`, then Publish.
5. Run the checks below.
6. Firestore Database, Data: delete your document in `adminUsers`.
7. Leave `PURGE_MODE` on `dry-run` until you have read a day of Worker logs.

## Checks (on a tablet)
Rules playground (Firebase console, Rules, Rules playground). Tap Run each time.
1. delete, `/databases/(default)/documents/households/<one of your test household codes>`, signed in as that household's owner: **denied**.
2. get, `/databases/(default)/documents/adminUsers/<your uid>`, signed in as you: **denied**.
3. get, `/databases/(default)/documents/payments/anything`, signed in as you: **denied**.
4. get, `/databases/(default)/documents/households/<test code>`, signed in as a member of it: **allowed**. As some other uid: **denied**.

In the app, on a **test** household and a **test** circle:
5. Delete the test household, then restore it from the deleted-households list. Both must work.
6. Turn notifications on for a member. No error.
7. Circle with two accounts: start it, one account taps "I have sent it", the recipient confirms, then confirm the payout. The next round appears.
8. Open Chipereganyu in the admin page. Rounds show as "Round 2" or "Round 2, lap 1".

## Roll back
* Worker or admin page: open the file on GitHub, History, pick the earlier version, copy it back.
* Rules: GitHub, `firestore.rules`, History, the version before this one, Raw, copy, paste into Firebase Rules, Publish.
