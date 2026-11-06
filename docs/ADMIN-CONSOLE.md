# Bajeti Yanga Admin Console — Spark-plan edition

## What this version does

The `/admin/` interface uses Firebase Authentication and Firestore directly. It does **not** call the `admin` Cloud Function and does not require Cloud Functions to display its read-only dashboard.

Available sections:
- Overview of the Firestore user profiles, households, payments, and Premium state.
- User profile listing (not the Firebase Authentication user directory).
- Household metadata and member counts. Individual budgets and purchase entries are deliberately not displayed.
- Read-only payment records.
- Chipereganyu group-level metadata only. Contribution-level financial details are deliberately not displayed.
- Existing admin log records, if any. This console does not create log entries because it does not perform administrative writes.

Each collection is capped at 300 documents per load to keep Firestore usage predictable on the Spark plan. Counts and revenue are therefore counts/sums of the loaded sample, not guaranteed platform-wide totals.

## Important limitations

- No Cloud Function is required by this admin page.
- No account disabling, Premium activation, payment settlement, account deletion, household editing, or Chipereganyu intervention is provided. Those operations require trusted server-side code and must not be implemented as client-side Firestore writes.
- Firestore does not expose the Firebase Authentication user directory or last-sign-in timestamps to this browser dashboard. It shows only `users/{uid}` profile documents stored by the app.
- The existing app's PayChangu, scheduled jobs, and other Cloud Functions are separate. This admin page does not deploy or replace them.

## Setup

1. Push the complete project files to the GitHub Pages branch, keeping the `admin/` folder at the repository root.
2. In Firebase Console → Authentication → Sign-in method, enable Google.
3. In Authentication → Settings → Authorized domains, add `rodart265.github.io` (and your custom domain if you later use one).
4. Publish the updated Firestore rules. If Phase A is currently live, publish `firestore.rules`. If Phase B is currently live, publish `firestore.phase-b.rules`. Do not switch from Phase B back to Phase A; use the matching file for the rules version already in production.
5. In Firebase Console → Authentication → Users, sign in to the admin page once with your Google account (or otherwise ensure the account exists), then copy that account's UID.
6. In Firestore Data, create a collection named `adminUsers`. Create a document whose document ID is that exact Firebase Auth UID. Add fields:
   - `enabled` — boolean `true`
   - `role` — string `owner`
   - `email` — string containing your Google email (for your reference only)
7. Open `https://rodart265.github.io/bajeti-yanga/admin/` and sign in with that same Google account.

The `adminUsers` collection is an owner-managed allowlist. The rules allow a signed-in account to read only its own allowlist document; client writes and listing are denied. Create or disable allowlist documents only from the Firebase Console as project owner.

## Security notes

- The rules require a verified Google sign-in and an enabled `adminUsers/{uid}` record.
- Admin privileges are read-only in this edition.
- The dashboard does not read individual `households/{id}/purchases` documents or embedded Chipereganyu contribution records.
- Keep your Google account protected with two-step verification. Never share your Firebase owner credentials.
- Firestore rules must be published in Firebase Console; pushing a rules file to GitHub does not publish it to Firestore.
