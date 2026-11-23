// motion.js: marks the moment a screen is opened, or its content is swapped by a tap, so motion.css can
// animate it once. Opening a tab goes through go(); Settings pages and Insights tabs redraw #view in place,
// which is caught by watching #view. Redraws that keep the same layout (a chip tap, new data arriving) are not
// animated, with three exceptions: changing the month, and content replacing a loading skeleton. Home numbers
// count up. Nothing in the app is changed, and with reduced motion this file does nothing.
(function () {
  'use strict';
  try { if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
  var v = document.getElementById('view');
  if (!v) return;
  var ORDER = ['home', 'log', 'insights', 'chat', 'stg'], last = 0, timer, goAt = 0, tapAt = 0, tapBack = false, tapMonth = 0, lastSig = '', lastSkel = false;
  var HOLD = 2000;   // how long the animation class stays on; must be longer than the slowest animation

  function idx(t) { var i = ORDER.indexOf(t === 'hist' || t === 'sum' ? 'insights' : t); return i < 0 ? last : i; }
  function sig() {
    var p = v.querySelector('.page') || v.firstElementChild; if (!p) return '';
    var s = p.className + '#';
    for (var i = 0; i < p.children.length && i < 12; i++) s += p.children[i].className + '|';
    return s;
  }
  function skel() { return !!v.querySelector('.sk,[aria-busy="true"]'); }

  // Home numbers count up to their real value, then the exact original text is put back.
  function countUp(el) {
    var txt = el.textContent, m = /\d[\d,]*/.exec(txt);
    if (!m) return;
    var target = parseInt(m[0].replace(/,/g, ''), 10);
    if (!(target > 0) || target > 1e12) return;
    var pre = txt.slice(0, m.index), post = txt.slice(m.index + m[0].length), t0 = null, DUR = 900;
    function frame(ts) {
      if (!el.isConnected) return;
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / DUR), e = 1 - Math.pow(1 - k, 3);
      el.textContent = k >= 1 ? txt : pre + Math.round(target * e).toLocaleString('en-US') + post;
      if (k < 1) requestAnimationFrame(frame);
    }
    el.textContent = pre + '0' + post;
    requestAnimationFrame(frame);
  }
  function counts() { var els = v.querySelectorAll('.h2-num,.h2-cv'); for (var i = 0; i < els.length; i++) countUp(els[i]); }

  function play(dx) {
    v.style.setProperty('--mo-dx', dx + 'px');
    v.classList.remove('mo-in'); void v.offsetWidth; v.classList.add('mo-in');
    clearTimeout(timer); timer = setTimeout(function () { v.classList.remove('mo-in'); }, HOLD);
  }

  document.addEventListener('click', function (e) {
    tapAt = Date.now();
    var el = e.target && e.target.closest ? e.target.closest('button,[onclick]') : null;
    var oc = el ? ((el.getAttribute('onclick') || '') + ' ' + el.className) : '';
    tapMonth = /prevM\(/.test(oc) ? -1 : /nextM\(/.test(oc) ? 1 : 0;
    tapBack = /back|chevron-left/i.test(oc) || !!(el && el.querySelector && el.querySelector('[data-lucide="chevron-left"],[data-lucide="arrow-left"]'));
  }, true);

  new MutationObserver(function () {
    var s = sig(), changed = s !== lastSig, sk = skel(), wasSkel = lastSkel;
    lastSig = s; lastSkel = sk;
    if (Date.now() - goAt < 500) return;                       // go() already handled this one
    var tapped = Date.now() - tapAt < 900;
    if (tapped && tapMonth) { play(tapMonth * 18); counts(); return; }   // month changed: slide the new month in
    if (wasSkel && !sk) { play(0); counts(); return; }         // real content replaced the loading skeleton
    if (!changed || !tapped) return;                           // same layout, or not caused by a tap
    play(tapBack ? -18 : 18);
  }).observe(v, { childList: true });

  var orig = window.go;
  if (typeof orig !== 'function') return;
  window.go = function (t) {
    try {
      var i = idx(t); goAt = Date.now();
      play(i >= last ? 18 : -18);
      last = i;
    } catch (e) {}
    var r = orig.apply(this, arguments);
    try { lastSig = sig(); lastSkel = skel(); counts(); } catch (e) {}
    return r;
  };
})();
