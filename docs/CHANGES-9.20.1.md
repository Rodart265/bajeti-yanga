# Changes in 9.20.1 (November 2026): Home dashboard layout

A layout change to the Home screen only. No data, Firebase, sign-in, premium or payment code was touched.

## What changed on Home

New order, top to bottom: month switcher, hero card, (streak and bills-due cards when they apply), **Recent transactions**, **Budget health**, Chipereganyu card, 6-month chart.

- Recent transactions: heading now sits above the card, with the "View All" link on the right. Rows are unchanged (icon, name, note, date, member badge, warning icons).
- Budget health: new heading with a **Details** link (opens Insights, Summary). Three cards in one row: Over Budget, Near Limit, On Track. The separate "Purchases" card is gone; the hero's **Entries** count still shows every entry for the month.
- Hero: a thin bar under the ring shows how much of the budget is used, in the same colour as the ring. **The hero's background, gradient and corner pattern are untouched.**
- Tablets (600px and wider): the Home column is centred at a readable width. Phones and the desktop phone-frame look the same as before.
- The loading skeleton for Home follows the new order.

## Files

| File | Change |
|---|---|
| `js/07-render.js` | `rHome()` reordered; Purchases card and its `cnt` variable removed; new `home-page` class on the page |
| `js/02-helpers.js` | `skHome()` skeleton matches the new order |
| `glass.css` | new block at the end: `.sec-h`, `.sec-link`, `.h2-bar`, `.chips3`, tablet width |
| `js/01-constants.js` | `APP_VERSION` 9.20.0 to 9.20.1 |
| `sw.js` | stamped by `node tools/release.js` (v9.20.1) |

`version.json` is deliberately **not** changed: phones on 9.20.0 keep working and pick up 9.20.1 through the normal update.

## Chichewa wording to check

Two new strings were written for this change and are worth a native read before release:

- "Budget health" is `Momwe bajeti ikuyendera`
- "Details" is `Zambiri`

Both are in `rHome()` in `js/07-render.js`.

## Rolling back

Put back the previous `js/07-render.js`, `js/02-helpers.js` and `glass.css`, then run `node tools/release.js` again.
