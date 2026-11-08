# Bajeti Yanga admin console: reference

Setup steps are in `ADMIN-SETUP.md`. This file describes how it works.

## Design

The page in `admin/` only displays and sends requests. Every look and every change goes to the payments Worker
(`pay-worker/`, route `POST /admin`), which:

1. verifies the Firebase ID token (Google sign-in, verified email),
2. looks the email up in the role lists (`ADMIN_OWNERS`, `ADMIN_SUPPORT`, `ADMIN_ANALYSTS`, Cloudflare secrets),
3. checks the role allows the action, and for changes that the Google sign-in is less than 30 minutes old,
4. does the work with the service account, and writes the change plus an entry in `adminLog` in one transaction.

Editing `admin.js` to show more buttons changes nothing: the Worker still refuses. Browsers are never given Firestore
access to admin data, so no Firestore rules change is needed.

## Privacy

Households, payments and Chipereganyu groups are read with Firestore field masks, so budgets, purchases, goals and
member amounts never leave the database. The console shows account and subscription facts only.

## Pages

| Page | What it is for |
|---|---|
| Overview | Headline numbers, signups, revenue, plan mix, trial to paid, return rate |
| Needs attention | Stuck or mismatched payments, Premium ending before the last payment's date, old-field Premium |
| Premium | Expiring in 14 days, trials, recently ended, no end date, old field, household finder |
| Households | Search and filter, CSV export, household page with the Premium change form |
| Users | Firebase accounts, last seen, disable and enable |
| Payments | Every payment with filters, re-check with PayChangu, reopen, notes, CSV export |
| Chipereganyu | Circle counts, overdue and stuck confirmations |
| Notices | Announcements shown in the app |
| Reports | Growth and revenue charts with table views |
| Activity log | Every change and every blocked attempt |
| Settings | Maintenance message, app version, admins, access status |

## Premium changes (`premium_set`)

Modes: `extend` (from today, or from the current end date if still active), `set_expiry`, `unlimited`, `revoke`, `tidy`
(move old config fields to the new ones). A reason is required. `recordPayment` adds a `manual_...` payment so revenue
and history are right. The change is written to the root fields and any old `config` Premium fields are removed in the same transaction, so
the two can never disagree again. `users/{owner}.premiumUntil` is kept in step for the household limit rule.

## Roles

See the table in `ADMIN-SETUP.md`. Support can re-check payments and add notes. Owners can do everything. Read-only
accounts can look at every page.

## In-app notices

`GET /public?plan=free|premium&lang=en|cw` returns live notices and the maintenance message. It needs no sign-in, is cached
for 60 seconds and contains only text an admin chose to publish. The app (9.18.0 and later) shows it as a dismissible
banner and ignores any failure to load it.

## Limits worth knowing

- Revenue and payment figures use the latest 1,000 payments.
- Tables show 300 rows at a time; use search or filters to narrow.
- Disabling an account blocks new sign-ins. Phones already signed in keep working for up to an hour.
- Cloudflare's free plan allows about 10 ms of CPU per request. Very large lists may need a paid plan or a smaller page.
- Not tracked by the app, so not reported: most-used features, error reports.
