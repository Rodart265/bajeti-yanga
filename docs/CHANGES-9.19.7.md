# 9.19.7: clean-up (icons, wording, dead code, unused CSS, icon-size styles)

One release with five separate changes. Each is independent, so any one can be undone without the others.

## 1. Icons

- The sparkles icon is replaced with `scan-line` on Magic Log: the button on Home (`js/07-render.js`), the Magic Log window, its
  Extract button and the scan result card (`js/12-chat.js`), and the "AI features" chip in Help (`js/10-legal.js`).
- What's New (`js/09-settings.js`) uses `party-popper`.
- Both icons were already in `vendor/icons.min.js`, so that file is unchanged. The soap icon in `js/01-constants.js` is a real soap icon and stays.
- Undo: change the icon names back to `sparkles`.

## 2. Wording (English only)

- Premium header line (`js/11-premium.js`): "Unlock the full power of your money." is now "Charts, PDF export, bill tracker and unlimited AI."
- Premium lock window: "Upgrade to unlock this and all other premium features." is now "Upgrade to use this, plus everything listed below."
- Trial ended note: "Upgrade to unlock these features again." is now "Upgrade to Premium to use these features again."
- Generic errors: "Something went wrong (code)" is now "Could not complete that (code)" in `js/02-helpers.js` and `js/04-auth.js`;
  the AI fallback reply in `js/12-chat.js` is now "Bajeti AI could not answer that. Please try again."; the catch-all toast in
  `index.html` is now "The app hit a problem. If it keeps happening, reload it."
- **The Chichewa text was not changed.** The Chichewa Premium header line still translates the OLD English line. A Chichewa speaker should write the new one.

## 3. Dead code removed

Fourteen functions that nothing called: `chatSuggest`, `clearChat`, `confirmPaymentWA`, `openWithdraw` and the one-line helpers
`delBillD`, `swUD`, `openPxMD`, `viewItemD`, `openEUd`, `delItd`, `delMemberd`, `openEBd`, `topUpGoald`, `delGoald` (`js/13-actions-boot.js`).
The app has no code that builds function names at run time, so nothing could have been calling them indirectly.

Now unreachable because of this, but NOT removed (not in the approved list): `doWithdraw` (`js/08-history-summary.js`),
`openPxM` and `viewItem` (`js/13-actions-boot.js`).

## 4. Unused CSS removed

97 class names that no HTML or JavaScript uses, and that cannot be built from a name prefix, were removed from `styles.css`
(138 single-line rules) and from three selector lists in `glass.css`. Rules spread over several lines were left alone. The `prem-*` classes
were kept because the code builds names that start with `prem-`.

Removed: bdiff-eq, bell-badge, bell-btn, bill-acts, bio-ico, bio-info, bio-prompt, bio-sub, bio-ttl, breakdown-cat-card, breakdown-donut, bulk-bar, bulk-inp, cat-bar-wrap, cf-box, cf-lbl, cf-row, cf-val, chat-chip, chat-chips-grid, chat-hero, chat-hero-ico, chat-hero-sub, chat-hero-ttl, daily-banner, db-ico, db-lbl, db-main, db-sub, db-val, export-btn, export-row, great, hcode-acts, hcode-card, hcode-lbl, hcode-val, hero-slim, hs-bal, hs-bar, hs-bar-wrap, hs-cl, hs-col, hs-cols, hs-cv, hs-lbl, hs-pct, hs-top, igrid, logout-btn, mood-banner, mood-ico, mood-sub, mood-ttl, mood-txt, notif-btn, notif-time, obinp, pay-method, pay-method-hdr, pay-method-logo, pay-steps, pin-bio-btn, prico, prof-badge, qr-wrap, s-av, s-badge, s-email, s-info, s-name, sc-lbl, sc-val, set-card, set-hdr, set-ico, set-ico-lbl, set-lbl, set-row, set-sub, settings-hdr, setup-card-hdr, setup-card-hdr-ico, setup-icon, stat-chip, stat-row, stg-del-acc, trend-bar-amt, trend-bar-col, trend-bar-inner, trend-bar-lbl, trend-bar-row, trend-chart-wrap, trend-leg-dot, trend-leg-lbl, trend-legend, uav.

(`.set-row.tap` went with `.set-row`; the word `tap` is not used as a class anywhere else.)

## 5. Icon sizes: repeated inline styles replaced by classes

The exact same icon-size inline style that was repeated on 104 `<i data-lucide>` icons is now one small class each
(`ic11`, `ic12`, `ic13`, `ic14`, `ic16`, `ic13m4`, `ic14m4`, `ic14m5`, added at the end of `styles.css`). They use `!important`, so they keep the precedence
the inline style had and nothing should change size. Other inline styles (about 800) are untouched.

## Files

`index.html`, `sw.js`, `styles.css`, `glass.css`, `js/01-constants.js` (version), `js/02-helpers.js`, `js/03-pin.js`, `js/04-auth.js`,
`js/05-household.js`, `js/06-chipereganyu.js`, `js/07-render.js`, `js/08-history-summary.js`, `js/09-settings.js`, `js/10-legal.js`,
`js/11-premium.js`, `js/12-chat.js`, `js/13-actions-boot.js`, `docs/CHANGES-9.19.7.md`, `tests/cleanup.test.js`.

## Check on a phone after deploying

1. Home: the Magic Log button shows the scan icon; open it, and the window, Extract button and result card show it too.
2. Settings, History, Premium and the PIN screen: icons are the same size as before, nothing looks squashed or oversized.
3. Premium window (tap a locked feature): new wording, feature list still shown.
4. Profile > What's New shows the party icon.
5. Dark mode and the Settings list look unchanged.
