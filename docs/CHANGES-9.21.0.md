# 9.21.0 - guest mode: try the app before making an account

A first-time visitor now sees a short entry screen (Explore the app, Create an account, Sign in) instead of going
straight to sign-in. "Explore" opens a small demo with a made-up household. Nothing a visitor does in the demo is
saved, and the demo never touches Firebase.

## What changed

- **New file `js/12a-guest.js`** (listed in `APP_SHELL`, loaded after `12-chat.js`, before the boot script). It holds
  the whole demo: Home, Log, Insights and More tabs, an add-income / add-expense sheet, and the "this needs an
  account" sheet.
- **`index.html`**: two new screens (`scr-guest-entry`, `scr-guest`) placed before the setup screen, a hidden Back
  button on the sign-in card (only shown to people who arrived from the demo), the new script tag, and both guest
  screens added to the boot splash's list of real screens.
- **`js/05-household.js`**: two small hooks inside `bootApp()`. When nobody is signed in it asks `guestRoute()` first
  and falls back to the sign-in screen exactly as before. When someone is signed in it calls `guestNoteSignedIn()`.
- **`styles.css`**: a block at the end for the guest screens (uses the existing colour variables, so dark mode works).
- **`tests/guest.test.js`**: 19 checks. The important ones: guest code contains no Firebase, Worker or startup calls,
  it stores only `nb_seen_auth` and the language, and the routing rules below behave as described.

## Who sees the guest screen

Only a first-time visitor on this phone. These people go straight to sign-in, as before:

- anyone who has signed in on this phone before (`nb_seen_auth` is set the first time they do),
- any phone that already has a household on it (`nb_household`),
- anyone who opens an invite link (`?join=CODE`), because they need an account to join,
- anyone whose browser will not let the app read its storage.

Signing out lands on sign-in, not on the guest screen. The other places that show sign-in directly (account deletion,
"back to login" on the verify screen, session expiry in Premium) are untouched.

## What the demo can and cannot do

- Can: show a sample balance, budget, categories, goals and recent entries; add a temporary income or expense that
  moves the totals; switch between English and Chichewa.
- Cannot: save anything, sync, create a household, use bills, Chipereganyu, Bajeti AI or Premium. Tapping those opens
  a sheet that explains why and offers Create account / Sign in (the existing sign-in screen) or "Keep exploring".
- A refresh, or signing in, throws the demo entries away. They are never copied into the real account.
- Funnel analytics are not part of this release: the app has no analytics today, and a signed-out visitor cannot write
  to Firestore under the current rules. See the notes in the hand-over message.

## Chichewa that needs a native check

Every guest string is written inline with `L(en, cw)` in `js/12a-guest.js` or as `data-cw` in the two new screens.
Please review at least these, since they are new wording and not taken from `TX`:

- Yesani pulogalamuyi (Explore the app), Tsegulani akaunti (Create an account), Lowani (Sign in), Bwererani (Back)
- Onani momwe pulogalamuyi imagwirira ntchito pogwiritsa ntchito zitsanzo. Simufunika akaunti.
- Chitsanzo / Chitsanzo chokhala ndi zitsanzo. Palibe chomwe mungalowetse chimasungidwa.
- Ndalama zadzidzidzi (Emergency fund), Zolinga zosunga (Savings goals), Zomwe zikuonetsa (Insights)
- Every sentence in `GUEST_GATES` (the "this needs an account" sheet)

## How to check on a phone after the refresh bar appears

1. Clear the site data (or use a private tab), open the app: you see the entry screen, not sign-in.
2. Explore the app: balance MK 77,000. Add an expense of 5,000: balance MK 72,000. Refresh: back to MK 77,000.
3. Tap Household in More: the sheet appears. Create account: the existing sign-up form opens with a Back link.
4. Sign in normally: the app starts as always, and the demo is gone.
5. Sign out: you land on sign-in, not on the entry screen.
6. Open an invite link in a fresh private tab: sign-in, not the entry screen.
7. Switch to Chichewa on the entry screen, open the demo, and check nothing is cut off on a small screen.

## Rolling back

Roll forward, not back (see `docs/RELEASING.md`): restore the old `index.html`, `js/05-household.js` and `sw.js`
`APP_SHELL`, remove `js/12a-guest.js`, give it a new higher version, and run the usual release steps.
