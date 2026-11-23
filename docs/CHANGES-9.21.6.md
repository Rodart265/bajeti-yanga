# 9.21.6 - landing screen: smaller, matching logo, clearer copy

The first-time landing screen (`scr-guest-entry`) was taller than a phone screen, so it scrolled and the hero photo was
mostly covered. This release makes it fit and tidies the wording. No logic changes.

## What changed

- **`landing.css`** (v6): smaller type and spacing. Headline about 25px (was 33px), buttons 44px (was 54px), shorter
  hero gap and waves, smaller shield icon, footer text .7rem. Touch targets stay at 40px or more.
- **`index.html`** (landing markup only):
  - The logo is now the same rounded-square mark with the cyan arrow that the sign-in screen uses. The old aqua bars
    and their gradient are gone.
  - Subline: "A simpler way to track, plan, and stay in control." (was the sample-data sentence).
  - Primary button: "Try it with sample data" (was "Explore the app"), so nobody mistakes the demo for the real app.
  - Privacy line: "Nothing is saved or shared until you create an account." (was "No personal information is
    accessed until you sign up.").
  - New "Made in Malawi" line in the footer, above the copyright.
- Each new line has a Chichewa version in `data-cw`. Please have a fluent speaker read these four before wide release:
  the subline, the button, the privacy line and "Yopangidwa ku Malawi".

## Not changed

The headline "Know where your Kwacha goes." stays. No JavaScript, no new files, and `APP_SHELL` is unchanged.
