'use strict';
// Look switch for the admin console: dark glass or light bento. Runs in <head> so the page never flashes the wrong look.
// It only sets attributes on <html> and remembers the choice on this device. It touches no data and calls no server.
(() => {
  const KEY = 'by-admin-look', root = document.documentElement;
  const COLOUR = { glass: '#07151c', bento: '#e9eef6' };
  const read = () => { try { const v = localStorage.getItem(KEY); return COLOUR[v] ? v : ''; } catch (_) { return ''; } };
  const save = v => { try { localStorage.setItem(KEY, v); } catch (_) {} };
  const media = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  const system = () => (media && media.matches ? 'glass' : 'bento');

  function labels() {
    const look = root.getAttribute('data-look');
    const text = look === 'glass' ? 'Switch to the light look' : 'Switch to the dark glass look';
    document.querySelectorAll('[data-look-toggle]').forEach(b => { b.setAttribute('aria-label', text); b.title = text; });
  }
  function apply(look) {
    root.setAttribute('data-look', look);
    if (look === 'bento') root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', COLOUR[look]);
    labels();
  }
  apply(read() || system());
  if (media && media.addEventListener) media.addEventListener('change', () => { if (!read()) apply(system()); });
  document.addEventListener('DOMContentLoaded', labels);
  document.addEventListener('click', e => {
    if (!e.target.closest || !e.target.closest('[data-look-toggle]')) return;
    const next = root.getAttribute('data-look') === 'glass' ? 'bento' : 'glass';
    save(next); apply(next);
  });

  // Count-up: the Overview tile figures run up from zero as each tile arrives. The real text is always put back at the end,
  // and nothing happens for people who asked for less motion.
  const still = () => !(window.matchMedia && matchMedia('(prefers-reduced-motion: no-preference)').matches);
  function countUp(el) {
    const text = el.textContent, m = /\d[\d,]*(\.\d+)?/.exec(text);
    if (!m || el.dataset.counted) return;
    el.dataset.counted = '1';
    const to = parseFloat(m[0].replace(/,/g, '')); if (!(to > 0) || !isFinite(to)) return;
    const dec = m[1] ? m[1].length - 1 : 0, pre = text.slice(0, m.index), post = text.slice(m.index + m[0].length);
    const tile = el.closest('.tile'), delay = tile ? (parseFloat(getComputedStyle(tile).animationDelay) || 0) * 1000 : 0;
    const fmt = n => pre + n.toLocaleString('en-GB', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + post;
    const dur = 750, t0 = performance.now() + delay;
    el.textContent = fmt(0);
    (function frame(now) {
      if (!el.isConnected) return;
      const k = Math.min(1, Math.max(0, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3);
      el.textContent = k >= 1 ? text : fmt(dec ? Math.round(to * e * Math.pow(10, dec)) / Math.pow(10, dec) : Math.round(to * e));
      if (k < 1) requestAnimationFrame(frame);
    })(performance.now());
  }
  function scan() { if (still()) return; document.querySelectorAll('#view .tile .value').forEach(countUp); }
  document.addEventListener('DOMContentLoaded', () => {
    const view = document.getElementById('view'); if (!view) return;
    new MutationObserver(scan).observe(view, { childList: true });
  });
})();
