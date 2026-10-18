# Rollout guide (October 2026)

Written for someone working **only from a tablet**. Every step is done in a browser (GitHub, Cloudflare, Firebase
console, Google Cloud Console) except Step 5, which uses **Google Cloud Shell**, a terminal that runs inside the browser.

Nothing here changes the live app until you **merge the pull request** (Step 2). Do the steps in this order. Each step
says how to undo it.

> **Never paste a password, a service-account key, or an API secret into a chat, an issue, or a file in this repo.**
> The steps below type secrets straight into Cloudflare or Cloud Shell, where they stay.

---

## What changed, in one paragraph

AI requests now carry the person's sign-in token and the **Worker** enforces the daily limits (they used to be
reset-able from the browser). The **Firestore rules** are rewritten: allow-lists instead of block-lists on households,
a proper invite document for joining, validated chipereganyu payouts, and a block on writing premium/trial fields from
the app. **Cloud Functions** add automatic Premium after a PayChangu payment and one free trial per account. The app
file got an XSS clean-up, a Content-Security-Policy, and clearer AI/restore error messages.

## What is deliberately NOT done yet

| Item | Why | When |
|---|---|---|
| `migrate-premium.js` | You said you will run it later. The app still reads the old `config.isPremium` fields until then. | After Step 8 |
| Items/bills/goals to sub-collections | Large, risky change to an 8,000-line file that cannot be tested here. Plan in `DATA-MODEL-PLAN.md`. | Separate project |
| Rules "Phase B" (tighter join + household read) | Needs every household owner to have opened the new app once. | Step 7 |
| Private AI chats per person | Product decision: chats are shared per household today. | Your call |
| Removing `'unsafe-inline'` from the CSP | Needs the 240+ inline `onclick` handlers rewritten. | Separate project |

---

## Step 1. Deploy the Worker (Cloudflare dashboard)

1. Cloudflare dashboard -> **Workers & Pages** -> your `nyumba-ai` worker -> **Edit code**.
2. **Before you replace anything**, copy the model name your current worker uses (the part after `/models/` in its
   Gemini URL, for example `gemini-...`). You need it in item 5. Also copy the current code into a note as a backup.
3. Replace the code with the contents of `worker/index.js` from this repo (open the file on GitHub, tap **Raw**, select
   all, copy). **Deploy**.
4. **Settings -> Variables and Secrets**. Keep your existing secrets. Make sure these exist:
   - Secret `GEMINI_API_KEY` (already there if the old worker used it under this name; rename if it differs).
   - Variable `GEMINI_MODEL` = the model name from item 2. **Required.** Without it the Worker answers "not configured".
   - Secret `BAJETI_SECRET` = the old shared secret (still needed for a few days).
   - Variable `ALLOW_LEGACY_SECRET` = `true` (so people with the old cached app keep working).
   - Variable `TRUST_CONFIG_PREMIUM` = `true` (until Step 8).
5. **Storage & Databases -> KV -> Create namespace** `bajeti-quota`. Then worker **Settings -> Bindings -> Add ->
   KV namespace**, variable name **`QUOTA`**. Without it the Worker works but cannot count, so no daily limits.
6. Test: open the app, send one AI chat message. It should answer.

**Undo:** paste your backed-up old code and deploy.

## Step 2. Merge the pull request (GitHub)

1. Open the PR on GitHub and read the description.
2. Tap **Merge pull request**. GitHub Pages publishes in about a minute.
3. Open the app once (twice if it still shows the old look). The service-worker version changed (`bajeti-v9.7.0`) so
   the new copy replaces the old one.
4. **Ask every household owner to open the app once.** This quietly creates their `invites/{code}` document, which
   Step 7 relies on.

**Undo:** on the merged PR tap **Revert**, then merge the revert.

> Do Step 2 **before** Step 3. The old app writes trial fields in a place the new rules reject; the new app does not.

## Step 3. Publish the Firestore rules (Firebase console)

1. Firebase console -> **Firestore Database -> Rules**.
2. Select all, delete, paste the contents of `firestore.rules` from this repo.
3. Tap **Publish**. If the editor shows a red error, **do not publish**; tell me the message.
4. **Smoke test with two test accounts right away** (the rules could not be run against the emulator here):
   - [ ] Existing user signs in, household loads, editing an item saves.
   - [ ] Create a new household. The trial banner shows.
   - [ ] Second account joins with the code: request appears for the owner, owner approves, joiner enters.
   - [ ] Join with an expired code is refused (set a code expiry to a past time, or wait for one).
   - [ ] Chipereganyu with 3 test accounts: create, join, start, mark paid, confirm payment, confirm payout, next cycle.
   - [ ] AI chat and receipt scan work.
   - [ ] "Restore account" shows the honest message if you were removed from the household.
   - [ ] An existing Premium household is still Premium.

**Undo (about 20 seconds):** in the Rules tab tap the **history** (clock) icon, pick the version from before, **Publish**.
A copy of the previous rules is also saved in `docs/firestore.rules.previous`.

## Step 4. Restrict the Firebase web API key (Google Cloud Console)

1. console.cloud.google.com -> select project `bajeti-yanga` -> **APIs & Services -> Credentials**.
2. Open the **Browser key** (the one starting `AIza...` that is in `index.html`).
3. **Application restrictions -> Websites**. Add `https://rodart265.github.io/*` and
   `https://bajeti-yanga.firebaseapp.com/*` (the sign-in pop-up runs from this one). Add `http://localhost/*` only if
   you test locally.
4. Save. Wait a few minutes, then sign in with Google, email and phone once each.

**Undo:** set Application restrictions back to **None**.

The key is public by design. This stops other websites from using it, it does not make it secret.

## Step 5. Automatic Premium (Cloud Shell)

Needs the Firebase **Blaze** (pay-as-you-go) plan. Functions have a free monthly allowance; this app's volume is tiny.
Set a budget alert in Google Cloud -> Billing -> Budgets so you are warned early.

1. Firebase console -> **Firestore Database -> Data** tab: note the **location** shown at the top.
   `nam5 (United States)` -> use region `us-central1`. A single region such as `europe-west1` -> use that exact name.
2. PayChangu dashboard -> API keys: have ready your **secret key**, and the **web secret** used to sign webhooks.
3. Open Cloud Shell (the `>_` icon, top right of console.cloud.google.com) and run these one at a time:

```
git clone https://github.com/Rodart265/bajeti-yanga.git
cd bajeti-yanga/functions
npm install
node test.js
echo "FUNCTION_REGION=us-central1" > .env
firebase login --no-localhost
firebase functions:secrets:set PAYCHANGU_SECRET_KEY --project bajeti-yanga
firebase functions:secrets:set PAYCHANGU_WEBHOOK_SECRET --project bajeti-yanga
firebase deploy --only functions --project bajeti-yanga
```

   - Change `us-central1` in the `echo` line to your region from item 1.
   - Each `secrets:set` asks you to type or paste the value **in the terminal**. That is the right place for it.
   - `node test.js` should end with all tests passing.
4. When the deploy finishes it prints a **Function URL** for `payments`. Copy it.
5. In **PayChangu dashboard -> API & Webhooks**, set the **webhook URL** to that same URL.
6. In GitHub (works in the mobile web editor): open `index.html`, find the line `const PAYMENTS_API = '';`, paste the
   URL between the quotes, **Commit** to a branch and merge, or ask me to do it.
   Until you do this the app keeps the old iframe + WhatsApp flow, so nothing breaks.
7. **Make one real test payment** (MK 2,500) on a test household. The reason: PayChangu's documentation does not
   clearly say whether the webhook includes our reference, so the first live payment confirms it. If Premium does not
   switch on straight away, the 15-minute reconcile job (and the "I've paid. Activate my Premium" button in the app) will catch it. Check
   **Firebase console -> Functions -> Logs** if not, and tell me what it says.

Optional: to enforce the 3-household limit for free accounts on the server, set `ENFORCE_HOUSEHOLD_CAP=true`
(redeploy). Off by default.

**Undo:** set `PAYMENTS_API` back to `''` (app returns to the manual flow). `firebase functions:delete payments
--project bajeti-yanga` removes the function.

## Step 6. Check Premium and AI limits work end to end

- [ ] A free household hits the chat limit (10/day) and sees the limit message, not a raw error.
- [ ] A Premium household does not.
- [ ] Sign out, then use AI: the app says to sign in again instead of a confusing error.

## Step 7. Rules Phase B (a few days after Step 2)

When all active owners have opened the new app, tighten two things in `firestore.rules`. Both are described in the
comments marked `PHASE B`:

1. In `joinOpen()`, also require that the invite document exists.
2. Change the household `allow get` so only members can read the whole household document (non-members use
   `invites/{code}` instead).

I can prepare this as a second PR when you are ready. Do not do it earlier: households whose owner has not opened the
new app would stop accepting joins.

## Step 8. Later, in this order

1. Run `migrate-premium.js` (your step). It moves old `config.isPremium / premiumExpiry / trialStarted` to the new
   places.
2. In Cloudflare set `TRUST_CONFIG_PREMIUM` = `false`.
3. Ask me to remove the `config.*` fallbacks from `index.html`.
4. In Cloudflare set `ALLOW_LEGACY_SECRET` = `false`, delete the `BAJETI_SECRET` secret, and treat the old secret as
   public forever (it was in the page source). Do this after a week or two, once old cached copies have updated.

## If something goes wrong

| Symptom | Likely cause | First thing to try |
|---|---|---|
| "Permission denied" everywhere after Step 3 | Rules published before the app update reached devices | Open the app twice to update; if still bad, roll back the rules |
| AI says "not configured" | `GEMINI_MODEL` or `GEMINI_API_KEY` missing in Worker | Step 1 item 4 |
| AI works but limits never apply | KV binding `QUOTA` missing | Step 1 item 5 |
| Page is blank or something does not load after merge | Content-Security-Policy blocked something | Delete the `<meta http-equiv="Content-Security-Policy" ...>` line in `index.html` and tell me what broke |
| Joiner cannot join | Owner has not opened the new app yet (no invite document) | Ask the owner to open the app once |
| Payment taken but no Premium | Webhook did not match the reference | Tap "I've paid. Activate my Premium" in the app, wait 15 min, then check Functions logs; you can still switch Premium on by hand as before |
