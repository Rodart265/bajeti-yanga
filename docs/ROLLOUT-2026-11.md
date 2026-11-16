# Rollout, November 2026 (version 9.20.0): making the claims true

Everything here works from a **tablet browser**. No laptop, no command line. Do the steps **in this order**: the order
is what keeps the app working for everybody while it changes.

## What the app claimed, and what is true now

| The app said | Before | Now |
|---|---|---|
| Sign in with phone | Needs the Blaze plan (SMS), no phone users | **Removed.** Email and Google stay. |
| Verify / reset e-mail | Errors were hidden, links did not return to the app | Real send errors, links return to the app, "about 1 hour" shown |
| Bill reminders and "you'll be notified" | Only worked with the app open | **Real push notifications** (FCM): bill due tomorrow and today (about 08:00 Malawi), join request to the owner, approval to the person |
| Free users get a few AI uses a day | Limits were in the browser | **Free households get no AI.** Premium and the free trial only |
| "Unlimited" AI | No ceiling | 300 a day per person plus an overall daily ceiling, counted on the server |
| One free trial per account | Needed a Cloud Function (Blaze) | **Real**: households are created by the Worker |
| 3 free households | Could be bypassed | **Real**: counted from households that really exist |
| Trash keeps 30 days | Nothing ever erased it | **Erased after 30 days** by the Worker |
| Deleted account is erased after 30 days | Never happened | **Erased** (sign-in and profile). Payment records are kept |
| Privacy policy | Did not say staff can see data | Says it, in plain words |

## Steps

### 1. Google Cloud: give the robot two more permissions (5 minutes)
1. console.cloud.google.com → project **bajeti-yanga** → ☰ → **IAM & Admin** → **IAM**.
2. Find `bajeti-pay@bajeti-yanga.iam.gserviceaccount.com` → pencil (edit).
3. It should already have **Cloud Datastore User** and **Firebase Authentication Admin**. Tap **Add another role** →
   **Firebase Cloud Messaging API Admin** → **Save**.
   (Authentication Admin is what erases an account's sign-in. Messaging Admin is what sends notifications.)
4. Firebase console → ⚙ **Project settings** → **Cloud Messaging** tab: **Firebase Cloud Messaging API (V1)** must say
   **Enabled**. (Your screenshot showed the Web Push key; that part is done.)
5. If your browser API key is restricted (Google Cloud → **APIs & Services** → **Credentials** → the *Browser key*):
   under **API restrictions** make sure **Firebase Installations API** and **FCM Registration API** are allowed. If the key is
   "Don't restrict key", there is nothing to do.

### 2. Firestore: two small index settings (5 minutes)
Firebase console → **Firestore Database** → **Indexes** tab → **Single field** → **Add exemption**:

| Collection ID | Field path | Query scope | Turn on |
|---|---|---|---|
| `bills` | `dueDate` | **Collection group** | Ascending |
| `purchases` | `deletedAt` | **Collection group** | Ascending |

Tap **Save** each time and wait until each shows **Enabled** (a minute or two). Without these, bill reminders and the
30-day trash clean-up fail with an "index required" error in the Worker log.

### 3. Cloudflare: settings for the payments Worker `bajeti-pay`
Workers & Pages → `bajeti-pay` → **Settings** → **Variables and secrets**:

| Name | Type | Value |
|---|---|---|
| `GEMINI_API_KEY` | **Secret** | Your Gemini key. Secrets cannot be read back, so use the one in your notes or create a new one at aistudio.google.com/apikey |
| `GEMINI_MODEL` | Text | The same model name the old `nyumba-ai` Worker uses (its Settings → Variables shows it) |
| `PURGE_MODE` | Text | `dry-run` (leave it like this for now; step 9 explains when to change it) |
| `GLOBAL_DAILY_CAP` | Text, optional | The most AI requests per day across everyone. Default `3000`. Pick a number your Gemini bill can live with |
| `HARD_DAILY_CAP` | Text, optional | Per person per day. Default `300` |

Then **Settings → Triggers → Cron Triggers → Add**, adding these two (type them exactly; the Worker recognises each by its exact text).
The `*/15 * * * *` one you already have stays.

| Cron | What it does |
|---|---|
| `5,20,35,50 5-6 * * *` | Bill reminders, 07:05 to 08:50 Malawi time |
| `10 */2 * * *` | Clean-up (trash, deleted households and accounts), every 2 hours |

(Cloudflare shows times in UTC; Malawi is UTC+2. If you deploy through GitHub, `wrangler.toml` already contains all three.)

### 4. Deploy the Worker (**before** the app)
Same way you deployed it before (GitHub connection, or paste `pay-worker/dist/worker.js` into the editor). Then open
`https://bajeti-pay.kabangorodrick6.workers.dev/health`: it must show `"ok":true`. Open
`https://bajeti-pay.kabangorodrick6.workers.dev/chat`: you should get a short error, not a blank page (it expects a POST).

**Tablet route (what was actually used):** pasting 100 KB into Cloudflare's editor freezes on a tablet, so instead connect
`bajeti-pay` to GitHub: Settings → Builds → Connect → repo `Rodart265/bajeti-yanga`, production branch
`feat/real-claims-nov-2026` (switch it to `main` after the pull request is merged), root directory `/pay-worker`,
deploy command `npx wrangler deploy --keep-vars` (keeps your saved variables). A push to that branch deploys the Worker.

### 5. Merge the pull request → the app updates
Wait about a minute, open the app, tap **Refresh** on the "New version ready" bar.

### 6. Publish the new rules (**last**)
Firebase console → **Firestore Database** → **Rules** → replace everything with the contents of `firestore.rules` → **Publish**.
This is the step that stops the browser creating households by itself. Do it only after steps 4 and 5; before then, phones
that have not refreshed would be unable to create a household.

### 7. Retire the old AI Worker
1. Edit `version.json` on GitHub: set `{"min":"9.20.0"}`. Phones older than that are forced to update.
2. Wait a day or two. Then Cloudflare → Workers & Pages → `nyumba-ai` → **Settings** → **Domains & Routes** → disable the
   `workers.dev` address (or delete the Worker). Until you do, old app versions can still get free AI from it.

### 8. Your three browser checks (13, 14, 15)
- **13. Old Worker: no shared secret.** Only needed if you keep `nyumba-ai` running for a while. Cloudflare → `nyumba-ai` →
  Settings → Variables: `ALLOW_LEGACY_SECRET` = `false`, and replace the `BAJETI_SECRET` value with a new long random one.
- **14. The live AI Worker is the one in the repo.** Cloudflare → `bajeti-pay` → **Deployments**: the newest deployment should be
  the one from step 4 (time and, if you use GitHub, the commit message). Then ask Bajeti AI a question from a Premium household
  and from a free one: Premium answers, free shows the upgrade screen.
- **15. Test the rules.** Firebase console → Firestore → Rules → **Rules Playground**. Each of these must say **Denied**:
  1. `create` on `/households/abcd1234`, signed in as any user.
  2. `get` on `/households/someone-elses-code`, signed in as a user who is not a member.
  3. `update` on `/users/{your uid}` where the new data sets `trialClaimedAt`.
  4. `get` on `/aiUsage/anything` and `/pushLog/anything`, signed in.
  5. `update` on a household you are a member of, changing `owner`.
  And this must say **Allowed**: `get` on `/households/{your code}` signed in as yourself, with the household's `memberUids` including your uid.

### 9. Switch clean-up from "look" to "delete" (after you have looked)
Clean-up starts in **dry-run**: it only writes to the Worker log what it *would* erase.
1. Wait a day. Cloudflare → `bajeti-pay` → **Observability / Logs**: look for lines starting `trash:`, `households:`, `accounts:`.
   They say things like `households: would erase 2 (dry run): abcd1234, ...`.
2. Check the ids are accounts and households that really asked to be deleted more than 30 days ago.
3. Change `PURGE_MODE` to `delete` and deploy. From then on the Worker really erases them.

## What you should know (honest limits)
- **Capacity of reminders.** Cloudflare's free plan lets one run make 50 outgoing requests. Reminders therefore reach roughly
  100 to 150 households a morning on the free plan (the Worker takes turns across several runs). Past that, Cloudflare's paid
  Workers plan (about US$5 a month) removes the limit; nothing in the code has to change.
- **Bills added the old way** (inside the household settings document rather than as separate records) are not seen by the
  reminder job. Bills are moved to the new layout when a household next edits its settings.
- **Deleting an owner's account deletes their whole household** after 30 days (the app already warns about this). Ownership is
  not handed to another member.
- **AI counters** use about four database operations per AI request. Fine for now, but worth watching on the Firestore usage page.
- **iPhones** only receive notifications when the app has been added to the Home Screen.
- If notifications never arrive on a phone, the usual cause is a restricted API key (step 1.5).

## If something goes wrong
| Symptom | Likely cause | Fix |
|---|---|---|
| "Could not create the household" for everyone | Rules published before the Worker/app (step 6 too early) | Redeploy the Worker (step 4), refresh the app |
| Bajeti AI says "busy" for Premium users | `GEMINI_API_KEY` or `GEMINI_MODEL` missing, or Firestore error | Check `/health` and the Worker log |
| No reminders | Index missing, cron not added, or no one allowed notifications | Steps 2 and 3; log line `bill reminders {...}` shows what ran |
| `accounts: could not erase ...` in the log | Robot lacks **Firebase Authentication Admin** | Step 1.3 |
| Need to undo the rules change | | Publish `docs/firestore.rules.previous`-style older rules; households then can be created in the browser again (trial and limit stop being enforced) |
