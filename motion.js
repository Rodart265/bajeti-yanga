// motion.js: marks the moment a screen is opened, or its content is swapped by a tap, so motion.css can
// animate it once. Opening a tab goes through go(); Settings pages and Insights tabs redraw #view in place,
// which is caught by watching #view. Redraws that keep the same layout (a chip tap, new data arriving) are not
// animated. Nothing in the app is changed, and with reduced motion this file does nothing.
(function () {
  'use strict';
  try { if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
  var v = document.getElementById('view');
  if (!v) return;
  var ORDER = ['home', 'log', 'insights', 'chat', 'stg'], last = 0, timer, goAt = 0, tapAt = 0, tapBack = false, lastSig = '';
  var HOLD = 2000;   // how long the animation class stays on; must be longer than the slowest animation

  function idx(t) { var i = ORDER.indexOf(t === 'hist' || t === 'sum' ? 'insights' : t); return i < 0 ? last : i; }
  function sig() {
    var p = v.firstElementChild; if (!p) return '';
    var s = p.className + '#';
    for (var i = 0; i < p.children.length && i < 12; i++) s += p.children[i].className + '|';
    return s;
  }
  function play(dx) {
    v.style.setProperty('--mo-dx', dx + 'px');
    v.classList.remove('mo-in'); void v.offsetWidth; v.classList.add('mo-in');
    clearTimeout(timer); timer = setTimeout(function () { v.classList.remove('mo-in'); }, HOLD);
  }

  document.addEventListener('click', function (e) {
    tapAt = Date.now();
    var el = e.target && e.target.closest ? e.target.closest('button,[onclick]') : null;
    var oc = el ? ((el.getAttribute('onclick') || '') + ' ' + el.className) : '';
    tapBack = /back|chevron-left/i.test(oc) || !!(el && el.querySelector && el.querySelector('[data-lucide="chevron-left"],[data-lucide="arrow-left"]'));
  }, true);

  new MutationObserver(function () {
    var s = sig(), changed = s !== lastSig; lastSig = s;
    if (!changed || Date.now() - goAt < 500) return;       // go() already handled this one
    if (Date.now() - tapAt > 900) return;                   // not caused by a tap (data arriving, timers)
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
    try { lastSig = sig(); } catch (e) {}
    return r;
  };
})();
