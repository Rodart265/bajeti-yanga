# Changes in 9.18.0 (November 2026)

## App

- **Notices.** A dismissible banner at the top shows announcements and the maintenance message from the admin console.
  It loads quietly in the background after the app opens and never blocks the app if it fails. The close button reuses
  the existing Chichewa label "Tsekani". No other new text.

The Premium end date fix (later of root and old config date) shipped earlier in 9.17.9 and is not repeated here.

## Payments Worker (`pay-worker/`)

- New `POST /admin` route behind Google sign-in and role lists, and a public `GET /public` notice feed.
- New files `src/admin.js` and `src/identity.js`. `firestore.js`, `auth.js` and `index.js` extended.
- New Cloudflare secrets: `ADMIN_OWNERS`, optional `ADMIN_SUPPORT`, `ADMIN_ANALYSTS`.
- New role for the service account: Firebase Authentication Admin (for sign-up dates and disabling accounts).
- 266 offline tests pass against both `src/` and the bundled `dist/worker.js`.

## Admin console (`admin/`)

Rebuilt. See `ADMIN-CONSOLE.md` and `ADMIN-SETUP.md`.

## Files

`js/01-constants.js` (version), `js/11-premium.js`, `styles.css` (notice banner styles only), `sw.js` (stamped by `node tools/release.js`).
`tests/release.test.js` passes.
