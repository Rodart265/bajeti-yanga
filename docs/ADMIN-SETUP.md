# Admin console: setup guide (plain English)

This turns on the new admin console at `/admin/`. It runs on the Cloudflare Worker you already have (`bajeti-pay`), so it
costs nothing and does not need the Firebase Blaze plan.

Do the parts in order. The live app is not touched until Part 4, and even then only people who update get the new version.

> Never paste a key or secret into WhatsApp, GitHub or a chat. They only go into the Cloudflare boxes named below.

---

## Part 1: Say who is an admin (Cloudflare)

The list of admins is kept in Cloudflare as **secrets**, so a new deploy from GitHub never wipes it.

1. Cloudflare dashboard → **Workers & Pages** → **bajeti-pay** → **Settings** → **Variables and Secrets**.
2. Tap **Add**. Type: **Secret**. Name: `ADMIN_OWNERS`. Value: the Gmail address you sign in with. Save.
   For more than one person, separate the addresses with commas.
3. Optional, same way:
   - `ADMIN_SUPPORT`: people who can re-check payments and add notes, but cannot change Premium or accounts.
   - `ADMIN_ANALYSTS`: people who can only look.

If none of the three is set, the console answers "not switched on" and nobody gets in. That is on purpose.

| | Owner | Support | Read-only |
|---|---|---|---|
| Look at everything | yes | yes | yes |
| Re-check a payment, add notes | yes | yes | no |
| Give, extend or remove Premium | yes | no | no |
| Disable or enable an account | yes | no | no |
| Notices and maintenance mode | yes | no | no |

---

## Part 2: Put the new Worker code on Cloudflare

Pick the way you used before.

**If Cloudflare deploys from GitHub:** push the files in Part 4 first. The Worker redeploys by itself.

**If you pasted the file by hand:**
1. **Workers & Pages** → **bajeti-pay** → **Edit code**.
2. Select everything in the editor and delete it.
3. Open `pay-worker/dist/worker.js` from this package, copy all of it, paste it in.
4. Tap **Deploy**.

Your secrets and the 15 minute check stay as they are.

Check: open `https://bajeti-pay.kabangorodrick6.workers.dev/health`. It should say `{"ok":true,"missing":[]}`.

---

## Part 3: Let the Worker read the sign-in list (Google Cloud)

Sign-up dates, "last seen" and the disable button need this. Without it the console still works, but those parts show a note.

1. **console.cloud.google.com**, project **bajeti-yanga** → **IAM & Admin** → **IAM**.
2. Find `bajeti-pay@bajeti-yanga.iam.gserviceaccount.com`. Tap the pencil.
3. **Add another role** → **Firebase Authentication Admin** → **Save**.

Check: in the console, **Settings** shows "Firebase sign-in access: Connected".

---

## Part 4: Put the app and console files on GitHub

These files changed. Keep the folders as they are.

```
admin/admin.css
admin/admin.js
admin/index.html
js/01-constants.js
js/11-premium.js
styles.css
sw.js
pay-worker/src/admin.js
pay-worker/src/identity.js
pay-worker/src/auth.js
pay-worker/src/firestore.js
pay-worker/src/index.js
pay-worker/dist/worker.js
pay-worker/test.mjs
docs/ADMIN-CONSOLE.md
docs/ADMIN-CONSOLE-SPARK.md
docs/ADMIN-SETUP.md
docs/CHANGES-9.18.0.md
```

Easiest from a computer: unzip the package over your copy of the repo, then

```
git checkout -b admin-console
git add -A
git commit -m "Admin console, Premium expiry fix, in-app notices (9.18.0)"
git push -u origin admin-console
```

Open the pull request, check the changed files look right, merge. GitHub Pages publishes by itself.

No Firestore rules change is needed. The old `adminUsers` document is no longer used and can stay or go.

---

## Part 5: First sign-in

1. Open `https://rodart265.github.io/bajeti-yanga/admin/` and tap **Continue with Google**.
2. You should land on **Overview**. If it says your account is not on the list, check the spelling in Part 1.
3. Open **Settings**. "Firebase sign-in access" should say Connected (Part 3).
4. Open **Needs attention**. This lists payments and Premium dates that look wrong.

Changes that touch money, accounts or what users see ask you to sign in with Google again if your last sign-in was more
than 30 minutes ago. That is normal.

---

## Part 6: Fix households that lost Premium early

Households switched on by hand before the new system may show "Premium ended" before their real date.

1. **Households** → filter **Ended**, or **Needs attention**.
2. Open the household. Read the **Premium** box: it shows the new field, the old field, and what the last payment ran to.
3. Under **Change Premium** choose **Set an exact end date**, pick the date the customer should have, and write a reason
   such as "Activated by hand on 3 Oct, one month".
4. Tap **Apply**. The change is written to the **Activity log**.

For a household you gave Premium with no end date, choose **Premium with no end date**.

Do not run `migrate-premium.js --apply` until you have looked at the households this way.

---

## Day to day: a customer sends proof on WhatsApp

1. **Payments**: search the customer's name, phone or the reference they sent. If the payment is there and **Pending**,
   open it and tap **Re-check now**. PayChangu is asked again, and Premium switches on if it confirms and the amount is right.
2. If PayChangu has no record (they paid another way), open **Households**, find the household, choose
   **Give or extend Premium**, tick **They paid me outside PayChangu**, enter the amount and a reason, **Apply**.
   The payment shows in Revenue as "recorded by hand".
3. If the app gave up on a payment after 3 days but the customer did pay, open it and use **Reopen and re-check**.

## Notices and maintenance

**Notices** shows a message at the top of the app for everyone, free users or Premium users, in English, Chichewa or both.
People can dismiss it. **Settings** has a maintenance message for when you are updating things. Phones need app version
9.18.0 or newer to show them.

## If something goes wrong

- **Console says "not switched on":** `ADMIN_OWNERS` is missing (Part 1).
- **Page says it cannot reach the server:** open the `/health` address in Part 2.
- **Cloudflare error 1102 on a big page:** the free plan limits work per request. Tell me which page; the answer is to
  split that list.
- **Go back:** Cloudflare → **bajeti-pay** → **Deployments** → pick the earlier one → **Rollback**. Remove `ADMIN_OWNERS`
  to switch the console off without changing code.

## What is not included

- Most-used features and error reports: the app does not record them yet.
- Failed Google sign-ins: Google handles those. Anyone with a Google account who tries this page without being listed is
  recorded in the Activity log under Blocked attempts.
- Chipereganyu: counts and overdue flags only. The console does not change contributions or payouts.
- Budgets, purchases and goals are never loaded by the console.
