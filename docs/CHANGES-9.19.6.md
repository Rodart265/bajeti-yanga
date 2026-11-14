# 9.19.6: straight to Home on launch (no "Welcome back" tap)

Opening the app used to show three screens before Home: the Android launch splash, the "Loading your budget..." screen,
and "Welcome back, <name>" with a Continue button. The last one only offered "Continue" and "Switch Household" (which
Profile already has), so every launch cost a tap. A signed-in person now goes straight in.

## What changed

- `js/01-constants.js`: new switch `WELCOME_SCREEN = false`. Set it to `true` to bring the Welcome screen back. Version 9.19.6.
- `js/05-household.js`: in the sign-in handler, when the account has a household, go to the same place Continue went:
  the PIN screen if a PIN is set (fingerprint starts there as before), otherwise straight into the app. The extra household
  read that only fetched the name for the Welcome screen no longer happens.
- `index.html`: the loading screen no longer waits a minimum 0.5 s (`MIN_DISPLAY_MS` 500 to 0). It stays only as long as
  the app is really loading, then fades out as before.
- `tests/welcome.test.js`: new. Runs the skip block for "no PIN", "PIN set" and "switch on".
- `sw.js`: stamped with `node tools/release.js`.

## Not changed

The Welcome screen's HTML, styles and functions (switched off, not deleted), Profile > Switch Household, the resume-lock PIN,
sign-in and set-up screens, Firestore rules, functions and the Cloudflare Worker. No file was added to the app shell.

## Known limit

The first screen on launch (big icon) is drawn by Android from the manifest, not by the app. Some devices (for example
tablets) show the app name under it and others show only the icon. That cannot be controlled from the app.

## Check on a phone after deploying

1. Open the installed app with no PIN set: you land on Home with no Continue tap.
2. With a PIN set: the PIN screen appears straight after the splash (fingerprint prompt if enabled), then Home.
3. On the PIN screen press Back: you get "press back again to exit", not the sign-in form.
4. Profile > Switch Household still works.
