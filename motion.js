// motion.js: marks the moment a tab is opened so motion.css can animate that screen once.
// It wraps go() and changes nothing else. Without it (or with reduced motion) the app behaves as before.
(function () {
  'use strict';
  try { if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
  var ORDER = ['home', 'log', 'insights', 'chat', 'stg'], last = 0, timer;
  function idx(t) { var i = ORDER.indexOf(t === 'hist' || t === 'sum' ? 'insights' : t); return i < 0 ? last : i; }
  var orig = window.go;
  if (typeof orig !== 'function') return;
  window.go = function (t) {
    try {
      var v = document.getElementById('view'), i = idx(t);
      if (v) {
        v.style.setProperty('--mo-dx', (i >= last ? 18 : -18) + 'px');
        v.classList.remove('mo-in'); void v.offsetWidth; v.classList.add('mo-in');
        clearTimeout(timer); timer = setTimeout(function () { v.classList.remove('mo-in'); }, 1300);
      }
      last = i;
    } catch (e) {}
    return orig.apply(this, arguments);
  };
})();
