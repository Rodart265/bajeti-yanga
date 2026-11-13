# 9.19.5: loading skeletons instead of "MK 0" and "No group yet"

When the app opens, the household document arrives before the entries do. For a moment Home showed "MK 0 spent" with the
whole budget left, and the Chipereganyu screen said "No group yet." for people who do have a group. Those screens now show
grey placeholder shapes (a skeleton) until the real data arrives, then swap to the real screen.

## What changed

- `js/01-constants.js`: two flags, `_pxFirst` (first entries arrived) and `_chipFirst` (first groups arrived). Version 9.19.5.
- `js/02-helpers.js`: `skHome()`, `skList()`, `skChipCard()`, `skChipPage()` and `pxPending(kind)`. The skeletons keep the
  month navigator working and hold the same space as the real content.
- `js/07-render.js`, `js/08-history-summary.js`: `rHome`, `rHist` and `rSum` (Insights uses the last two) draw the skeleton
  while the first entries are pending.
- `js/06-chipereganyu.js`: `rChip` and the Home Chip card draw a skeleton until the first groups arrive.
- `js/09-settings.js`: the "N this month" count on each member card shows a small shimmer pill instead of "0 this month".
- `js/05-household.js`: the flags are set by the first snapshot and cleared when a listener is torn down. If a listener
  errors, or nothing arrives within 8 seconds (`_pxDone`, `_chipFirstDone`), the screens draw normally, so a skeleton can
  never stay up for ever.
- `styles.css`: `.sk` shimmer and shapes. Uses the existing `--border` / `--mist` colours, so dark mode follows. The shimmer
  is switched off under `prefers-reduced-motion`.

## Not changed

Log (reads only the household settings, no gap), Chat, the sign-in and set-up screens, the CSV export, Firestore rules,
functions and the Cloudflare Worker. No file was added, so the `sw.js` file list and the `index.html` script tags are unchanged.

## Checked

Syntax of every file in `js/`; `node tests/release.test.js` and the other tests in `tests/` (see the run below); a small
check of the skeleton gate (draws while pending, not without a household or listener, not after the first snapshot).
Not checked: how it looks on a phone. Open the app on a slow connection, in English and Chichewa, light and dark, and look
at Home, History, Summary, Chip and the Profile > Members screen.
