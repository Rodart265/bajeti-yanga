# Changes in 9.17.8 (November 2026)

Batch 1 of the UI/UX review. No server, rules or functions changes: only the app files and `sw.js` change.

## What changed

- Restore screen (shown after "Delete account" when you log back in): readable white text on a darker glass card,
  an icon, the deletion date and days left, and the household it affects. Buttons are now "Restore my account",
  "Start fresh with a new household" and a plain "Sign out" link.
- "Start fresh": keeps the login, clears the deletion mark and the link to the old household on the user document,
  then shows the normal setup choices (Just Me / Create / Join). The old household keeps its own deletion date and is
  not restored. A confirmation explains this, including that Premium stays with the household it was bought for.
  The same option is offered when the 30-day window has already passed.
- Tapping outside a sheet now closes it through `closeM` (open-sheet list, focus return and onClose callbacks stay correct).
- Toasts are announced to screen readers (polite for messages, assertive for errors) through a separate live region.
- Labels added to the icon-only buttons: copy code, share code, remove and edit member, delete goal, add chip entry,
  show/hide password (label follows its state), fingerprint unlock, PIN delete key.
- Monthly Budget Cap row: no empty status line under the field; on narrow phones the field sits under the label.
- History: Edit and Delete have the same icon size and alignment, with more room between them.
- Home "Entries" now counts every entry this month (income too), matching History. "Purchases" still counts expenses only.

## New English-only strings (need Chichewa, currently the same in both languages)

Start fresh with a new household / Start with a new household / Your login stays... / the confirmation text /
Start fresh / Your household ... is scheduled for deletion too... / You left the household ... /
This account can no longer be restored / The 30-day recovery window has passed. / Sign out (English side) /
Show password / Hide password / Copy household code / Share code on WhatsApp / Remove / Edit / Delete goal / Add entry /
Unlock with fingerprint / Delete last digit / Could not start fresh. Check your connection.

## Release steps done

`APP_VERSION` 9.17.8, `node tools/release.js` (sw.js `V` and `BUILD` written), `node tests/release.test.js` all PASS.
