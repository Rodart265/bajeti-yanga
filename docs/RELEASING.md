# Releasing Bajeti Yanga

How a release reaches phones, and what to do when something goes wrong. Short version: change the code, bump the
version, run one command, run the tests, deploy.

## Every release

1. Make your changes.
2. Change `APP_VERSION` in `js/01-constants.js` (for example `9.17.4` to `9.17.5`). This is the number people see.
3. Run `node tools/release.js`. It writes the matching `V` and a fingerprint (`BUILD`) of every shipped file into `sw.js`.
   Do not edit those two lines by hand.
4. Run `node tests/release.test.js`. It must say PASS on every line. It catches: a forgotten step 2 or 3, a file
   missing from the list in `sw.js`, `index.html` and `sw.js` disagreeing about the scripts, and a bad `version.json`.
5. Add a short entry to `docs/CHANGES-*.md`, then deploy the hosting files.

If you add, rename or remove a file in `js/` (or any other file the app loads), update the `APP_SHELL` list in `sw.js`
and the `<script>` tags in `index.html`, then do steps 3 and 4.

## What phones do

- A phone checks for a new `sw.js` whenever the app opens, and when the installed app is resumed (at most every 10 minutes).
- It then downloads the **whole** release. If any file fails, or the files are not the release `sw.js` was built for
  (a deploy caught half-way), the update is thrown away and the phone keeps running the old release untouched. It
  tries again next time. A phone is never left with a mix of old and new files.
- When the whole release is saved, the open app shows **New version ready / Refresh**. It never reloads by itself, so
  nobody loses a half-typed entry.
- The app always loads from the saved release, so it opens quickly and works offline.

## Going back (rollback)

Roll forward, do not roll back the number. Restore the old code, then give it a new higher version (for example
`9.17.5` becomes `9.17.6` containing the code of `9.17.4`), and do the usual steps. Everyone gets the refresh bar.
Tag every release (`git tag v9.17.4`) so the old code is one command away.

A release that changes data (Firestore rules, data model, `functions/`) is harder to undo: keep the server side
working with both the old and new app, and redeploy functions if they changed.

## Forcing an update: `version.json`

`version.json` holds `{"min":"x.y.z"}`, the oldest version still allowed to run. A phone running something older
sees a full-screen **A new version is ready / Update now** page. Use it rarely: when an old version could do harm
(for example after a server change it cannot cope with).

- Raise `min` **in the same deploy as the release that fixes the problem**, never before it is live, and never above
  the version you are shipping (the release test checks this).
- It is fail-open: offline, a slow network or an unreadable file mean the app carries on. Nobody is locked out by the
  check itself failing.
- **Update now** deletes the saved copy of the app and fetches it fresh. It needs a connection. The library cache
  (Firebase, fonts) and all user data are kept.
- `version.json` is never cached by the service worker, so a change takes effect within minutes of deploying.
- To switch it off again, set `min` back to an old version.

## When something fails, what people see

| Situation | What they see |
|---|---|
| A screen cannot be drawn | "This screen couldn't load. Your data is safe." with **Try again**, **Reload app** and **Copy details**. The bottom nav keeps working. |
| An uncaught error in the app's own code | One calm toast, at most once a minute. The error is added to the on-device log (`nb_errlog` in the browser's local storage, last 20). |
| One of the app's files does not download at start | The splash says "Part of the app didn't finish loading" with **Retry**, within a second or so. |
| No connection on first ever visit / very slow start | The existing splash messages with **Retry** (after 9 seconds). |
| Offline while using the app | "You're offline. Changes will sync once you're back online." |
| Version below `version.json` min | The full-screen update page above. |

**Copy details** puts the app version, the screen and the error text on the clipboard, ready to paste into WhatsApp.
