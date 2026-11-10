# 9.18.1: text-injection fixes

A review found three ways for a household member to make their own text run as code on other members' screens.
All three are closed in this release. No data is changed or migrated.

1. **History** printed a purchase's category without escaping it (`js/08-history-summary.js`).
2. **Summary** printed the category in the spending breakdown without escaping it (`js/08-history-summary.js`).
3. **Bill, goal and budget-item ids** were placed inside button `onclick` handlers as they were stored. Any member can
   write those ids. `recKey()` now only returns plain ids (letters, digits, `-`, `_`), and `ensureRecIds()` replaces
   any other id with a fresh one the next time the household saves (`js/02-helpers.js`).

Also: `catOf()` now only ever returns one of the five known categories, so a stray value in the data can no longer
reach the screen as a category name.

New test: `tests/xss.test.js` (11 checks). It fails on 9.18.0 and passes on 9.18.1.

Not changed: Firestore rules. They still allow a member to save any text in `cat`; the app now ignores it.
