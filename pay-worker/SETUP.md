# Automatic Premium: setup guide (plain English)

**What this does.** Today a user pays on PayChangu, sends you a WhatsApp screenshot, and you switch Premium on by hand.
After this setup: the user taps **Upgrade** in the app, pays on PayChangu, and **Premium switches on by itself** within
seconds. You do nothing. If a payment ever gets stuck, a check runs every 15 minutes and fixes it.

**How it works (one minute).** A small program called a *Worker* lives on Cloudflare (free). PayChangu tells it "this
person paid". The Worker double-checks with PayChangu, then switches Premium on in your database.

You do 6 parts, in order. Each part says what you should see when it worked. Take your time; nothing here can break the live
app until the very last part (Part 6).

> **Golden rules**
> - **Never paste a key or secret into WhatsApp, GitHub, or a chat with me.** They only go into the boxes this guide names.
> - **Do not press "Reset Keys" on PayChangu.** That would break the keys that already work.
> - Screens change over time. If a button has a slightly different name, look for the closest one, or ask me with a screenshot
>   (hide any secret first).

---

## Part 1: Make a "robot key" so the Worker can reach your database (Google)

The Worker needs its own login to your Firebase database. This is a *service account*.

1. Open **console.cloud.google.com** and sign in with the Google account you use for Firebase.
2. At the top, check the project says **bajeti-yanga**. If not, tap it and pick it.
3. Open the menu (☰) → **IAM & Admin** → **Service Accounts**.
4. Tap **Create service account**.
   - Name: `bajeti-pay`. Tap **Create and continue**.
   - **Role:** choose **Cloud Datastore User**. (This is the small role: it lets the robot read and write the database and nothing else.)
   - Tap **Continue**, then **Done**.
5. In the list, tap the new `bajeti-pay` account → **Keys** tab → **Add key** → **Create new key** → **JSON** → **Create**.
6. A file downloads. **This file is the robot's password.** Keep it safe; you'll copy its contents in Part 3.

✅ You should see `bajeti-pay@bajeti-yanga.iam.gserviceaccount.com` in the list and have a `.json` file saved on your phone.

> If step 5 says key creation is blocked, tell me what the message says.

---

## Part 2: Put the Worker on Cloudflare

The Worker **must be named exactly `bajeti-pay`**. Its address will then be
`https://bajeti-pay.kabangorodrick6.workers.dev` (the same account address as your AI Worker). If Cloudflare shows you a
different address, **stop and tell me**: the app needs the exact one.

### Plan A (easiest if it is available): connect GitHub

1. Cloudflare dashboard → **Workers & Pages** → **Create application** → **GitHub**. Allow access to the `bajeti-yanga` repo.
2. Pick the repo `Rodart265/bajeti-yanga`.
3. Set **Root directory** to `pay-worker`. Leave **Build command** empty. Worker name: `bajeti-pay`.
4. Tap **Save and Deploy**.

✅ The build finishes green and you get the address above.

If Cloudflare says this isn't available on your plan, use Plan B.

### Plan B: paste one file

1. **Workers & Pages** → **Create application** → **Create Worker**. Name it `bajeti-pay` → **Deploy** (it deploys a
   hello-world first; that's fine).
2. Tap **Edit code**. Delete everything in the editor.
3. In GitHub, open `pay-worker/dist/worker.js` (this guide's branch), tap **Raw**, select all, copy.
4. Paste into the Cloudflare editor → **Deploy**.
5. Back on the Worker page → **Settings** → **Variables and secrets** → add three plain *text* variables:
   `APP_URL` = `https://rodart265.github.io/bajeti-yanga/`
   `ALLOWED_ORIGINS` = `https://rodart265.github.io`
   `FIREBASE_PROJECT_ID` = `bajeti-yanga`
6. **Settings** → **Triggers** → **Cron Triggers** → add `*/15 * * * *` (means "every 15 minutes").

---

## Part 3: Give the Worker its three secrets (Cloudflare)

Cloudflare dashboard → **Workers & Pages** → `bajeti-pay` → **Settings** → **Variables and secrets** → **Add**. Choose type
**Secret** (not "Text") for each one. Names must be exactly these:

| Name | What to paste |
|---|---|
| `PAYCHANGU_SECRET_KEY` | PayChangu dashboard → **Api & Webhook** → **Secret key** → tap **Copy**, then paste |
| `PAYCHANGU_WEBHOOK_SECRET` | A long made-up password you create now (40+ random letters and numbers; a password manager's "generate" button is perfect). Save it somewhere; you'll paste the **same** one into PayChangu in Part 4 |
| `GOOGLE_SERVICE_ACCOUNT` | Open the `.json` file from Part 1, select **everything** (including the `{` and `}`), copy, paste |

Tap **Deploy** (or **Save and deploy**) after adding them.

✅ Open `https://bajeti-pay.kabangorodrick6.workers.dev/health` in your browser. You should see:
`{"ok":true,"missing":[]}`

If it says `"ok":false` it lists the **names** of any secret still missing (never the values). Add those and check again.

---

## Part 4: Tell PayChangu where to send payment news

PayChangu dashboard → **Api & Webhook** → the **Setup Webhook** box:

1. **Webhook url:** `https://bajeti-pay.kabangorodrick6.workers.dev/`  (keep the slash at the end)
2. **Webhook secret:** paste the **same** long password from Part 3. (If PayChangu fills this box in for you instead of letting
   you type, copy *its* value into the Cloudflare secret `PAYCHANGU_WEBHOOK_SECRET` instead. The two must match.)
3. Turn **Receive Webhook Notifications** **on**.
4. Tap **Save**.
5. Leave **IP Restrictions** empty (Cloudflare's addresses change, so a list would block us).

✅ Tap **Test Webhook**. If PayChangu shows success or a 200, the signature wiring works. (A test has no real payment in it,
so nothing else happens. That is correct.)

---

## Part 5: Look for trouble before going live

- `/health` says ok (Part 3).
- In Cloudflare → `bajeti-pay` → **Logs** (or **Observability**), nothing red.
- Your admin page → **Payments** tab still opens (it will say no records yet).

Nothing in the app has changed yet. Users still see the old payment screen.

---

## Part 6: Switch the app on (the last step; this is the live change)

I put this in a **separate** change (branch `feat/pay-worker-app`) so it only goes live when you decide. It changes one line in
the app (it points the app at the Worker) and allows that address in the app's security list.

1. Merge that change on GitHub, wait about a minute for the site to update.
2. On your phone, open the app (you may need to reload once; it says "New version ready").
3. **Test it yourself first:** upgrade your own household for **1 month (MK1,500)** and pay on PayChangu.
4. Within a few seconds of paying, your Premium should turn on by itself. Check:
   - the app shows Premium;
   - admin → **Payments** shows the payment as **paid**;
   - admin → **Households** shows your household as **Premium**.
5. If it does not switch on after a minute, tap **I've paid** in the app (it checks PayChangu directly). If that also fails,
   see below. Real customers can always still use the old WhatsApp route.

---

## If something goes wrong

| What you see | Most likely reason | What to do |
|---|---|---|
| `/health` says `"ok":false` | A secret is missing or misnamed | Add the secret named in `missing` |
| Payment done, Premium never switches on | Webhook not reaching the Worker | PayChangu → Api & Webhook: is the address right, ends with `/`, is the toggle on? The 15-minute check should still fix it within 15 minutes |
| Payment shows **mismatch** in admin | Customer paid less than the plan price | Handle by hand (refund or top-up) |
| Payment shows **paid_no_household** | They deleted the household after paying | Refund by hand |
| App says "Could not start the payment" | Worker not reachable or the app's security list does not allow it | Tell me; send a screenshot |
| You want to turn it off | | Revert the app change (set the address back to empty) and everything goes back to the WhatsApp route. Nothing is lost |

## Staying safe

- The robot key (Part 1) can read and write your database. If it ever leaks, go to Google Cloud → Service Accounts →
  `bajeti-pay` → **Keys** and **delete** it, then make a new one and update the Cloudflare secret.
- If you ever think the PayChangu secrets leaked, then (and only then) use **Reset Keys** on PayChangu and update the two
  Cloudflare secrets right after.
- Every payment is double-checked with PayChangu before Premium switches on, and a payment can only ever be used once.

## For developers

- `src/` is the code; `test.mjs` runs 122 offline checks (`node pay-worker/test.mjs`); `dist/worker.js` is the same code
  bundled into one file (`npm run build` inside `pay-worker/` regenerates it; do that after any change to `src/`).
- It replaces the `payments` and `reconcilePayments` Cloud Functions (which need the Blaze plan). The business rules are
  the same code as `functions/lib.js`. Differences: Web Crypto instead of Node `crypto`, a REST Firestore client instead of
  the Admin SDK, and the "5 attempts in 10 minutes" check no longer needs a composite index.
