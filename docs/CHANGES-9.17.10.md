# Changes in 9.17.10 (November 2026)

Batch 2 of the UI/UX review: more room on small phones. App files and `sw.js` only; no server, rules or functions changes. Built on top of 9.17.9 (the Premium expiry change).

## What changed

- Log: the last rows (including "Repeat every budget period") can be reached. An inline `padding-bottom:16px` was
  overriding the space the floating Save bar and nav need, so at the end of the scroll the checkbox sat behind the Save bar.
- Log: with one household member the "WHO?" picker is not shown (the sole member is used). It comes back with 2+ members.
- Log: Quick Pick shows all 10 chips, with no scroll box inside the scrolling page.
- Log: the floating nav is slightly more opaque (.97) so page text does not show through it.
- History: the type chips (All / Income / Expenses) and member chips live behind a "Filters" button next to search.
  The period chips (Week / Month / Year / All) stay visible. The button shows a dot when a filter is active.
- History: with one member there are no member chips and no member tag on each entry.
- History: entries are compact (about 68px instead of 99-114px). Tap an entry, or its chevron button, to show Edit and
  Delete. One entry is open at a time.
- History: the icon on the selected "All" type chip was teal on teal and invisible; it now follows the chip colour.
- Home: the member tag on recent entries is hidden when there is one member.

## Measured on a 360px wide phone (headless Chromium, same data before and after)

| | before (9.17.9) | after (9.17.10) |
|---|---|---|
| History: first entry starts at | 521px | 426px |
| History: entry height | 99 to 114px | 68 to 75px |
| History: entries fully visible (800px tall / 640px tall) | 1 / 0 | 3 / 1 |
| Log: Amount field | partly under the Save bar | fully above it |
| Log: Repeat checkbox reachable | no | yes |

## New English-only strings (need Chichewa, currently the same in both languages)

Filters / Show actions

## Release steps done

`APP_VERSION` 9.17.10, `node tools/release.js` (sw.js `V` and `BUILD` written), `node tests/release.test.js` all PASS.
