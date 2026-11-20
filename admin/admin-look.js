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
})();
