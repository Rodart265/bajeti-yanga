'use strict';
// Bajeti Yanga admin console.
// This page decides nothing: every look and every change goes to the payments Worker (/admin), which checks who you are,
// does the work and writes the activity log. If you edit this file to show more buttons, the Worker still says no.
(() => {
  const WORKER = 'https://bajeti-pay.kabangorodrick6.workers.dev/admin';
  const FIREBASE = { apiKey: 'AIzaSyA5TdvAFE0cFkme7O--LtJNKIikM-KXFdM', authDomain: 'bajeti-yanga.firebaseapp.com', projectId: 'bajeti-yanga', storageBucket: 'bajeti-yanga.firebasestorage.app', messagingSenderId: '585037359165', appId: '1:585037359165:web:01b831d5277faed34be254' };
  const PRICES = { 1: 1500, 3: 4000 };                 // only used to pre-fill the "record a payment" amount
  const TZ = 'Africa/Blantyre', DASH = '-', ROW_CAP = 300;

  // ── small helpers ──────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => (n === null || n === undefined ? DASH : Number(n).toLocaleString('en-GB'));
  const money = n => 'MK ' + Math.round(Number(n) || 0).toLocaleString('en-GB');
  const short = n => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'm' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '') + 'k' : String(n));
  const fmtDate = ms => (ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : DASH);
  const fmtDateTime = ms => (ms ? new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }) : DASH);
  const fmtYmd = s => (s ? fmtDate(Date.parse(s + 'T12:00:00Z')) : DASH);
  const ago = ms => {
    if (!ms) return DASH;
    const m = Math.floor((Date.now() - ms) / 60000);
    if (m < 2) return 'just now'; if (m < 60) return m + ' min ago';
    const h = Math.floor(m / 60); if (h < 48) return h + ' h ago';
    const d = Math.floor(h / 24); return d < 60 ? d + ' days ago' : fmtDate(ms);
  };
  const monthName = m => new Date(m + '-01T12:00:00Z').toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  const dayLabel = d => { const t = new Date(d + 'T12:00:00Z'); return t.getUTCDate() + ' ' + t.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }); };
  const STATE = { premium: 'Premium', premium_expired: 'Premium ended', trial: 'On trial', trial_ended: 'Trial over', free: 'Free' };
  const badge = (cls, text) => `<span class="badge ${esc(cls)}">${esc(text === undefined ? String(cls).replace(/_/g, ' ') : text)}</span>`;
  const stateBadge = r => badge(r.state, STATE[r.state] || r.state);
  const ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    alert: '<path d="M12 3l10 18H2L12 3zM12 10v5M12 18h.01"/>', home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3-5.5 6.5-5.5s6 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .6 3.2 2.3 3.5 5"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/>', star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/>',
    circle: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/>', mega: '<path d="M3 11v3l14 6V5L3 11zM7 14v5"/><path d="M20 9v6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', log: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>', down: '<path d="M12 3v12M7 11l5 5 5-5M4 20h16"/>',
  };
  const icon = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  // ── session and calls to the Worker ────────────────────────────────────────
  let auth = null;
  const S = { me: null, data: {}, f: {}, page: 'overview', attention: null };
  class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }

  async function api(action, params = {}) {
    const user = auth && auth.currentUser;
    if (!user) throw new ApiError(401, 'You are signed out.');
    let res;
    try {
      res = await fetch(WORKER, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await user.getIdToken()) }, body: JSON.stringify({ action, ...params }) });
    } catch (e) { throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.'); }
    let body = {}; try { body = await res.json(); } catch (_) {}
    if (!res.ok) { const e = new ApiError(res.status, body.error || 'Something went wrong (' + res.status + ').'); e.fresh = !!body.needsFreshSignIn; e.detail = body.detail; throw e; }
    return body;
  }
  // Looks are kept in memory until something changes, so moving between pages is instant.
  async function get(action, params = {}, force = false) {
    const key = action + JSON.stringify(params);
    if (!force && S.data[key]) return S.data[key];
    return (S.data[key] = await api(action, { ...params, fresh: force || undefined }));
  }
  const forget = () => { S.data = {}; };
  // Sign-in uses a pop-up, never a page redirect: a redirect reloads the page (typed text is lost) and many phone
  // browsers block the storage it needs, which sends you back to the login screen.
  const provider = () => { const p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return p; };
  const popupMsg = e => (e && (e.code === 'auth/popup-blocked' ? 'The sign-in window was blocked. Allow pop-ups for this site, then try again.' : e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request' ? 'Sign-in was cancelled.' : e.code === 'auth/user-mismatch' ? 'Sign in with the same Google account you are using here.' : e.code === 'auth/network-request-failed' ? 'No connection. Try again.' : e.message)) || 'Sign-in failed.';
  async function reauth() {
    try { await auth.currentUser.reauthenticateWithPopup(provider()); await auth.currentUser.getIdToken(true); return true; }
    catch (e) { toast(popupMsg(e), true); return false; }
  }
  // True when the current sign-in is too old for the Worker to accept a change.
  async function isStale() {
    try { const t = await auth.currentUser.getIdTokenResult(); return Date.now() / 1000 - Number(t.claims.auth_time || 0) > ((S.me && S.me.freshSeconds) || 1800) - 60; }
    catch (_) { return false; }
  }
  // Changes: a stale sign-in is refreshed first (one Google tap), then the change is sent. The page is never reloaded.
  async function act(action, params) {
    if (await isStale() && !(await reauth())) return null;
    try { return await api(action, params); }
    catch (e) {
      if (e.fresh) { if (!(await reauth())) return null; try { return await api(action, params); } catch (e2) { toast(e2.message, true); return null; } }
      toast(e.message + (e.detail ? ' (' + e.detail + ')' : ''), true); return null;
    }
  }
  async function signIn() {
    $('loginError').textContent = '';
    if (auth.currentUser) { enter(auth.currentUser); return; }          // already signed in: just try the console again
    try { await auth.signInWithPopup(provider()); }
    catch (e) { $('loginError').textContent = popupMsg(e); }
  }
  let toastTimer;
  function toast(msg, bad) { const t = $('toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 6000 : 3500); }

  const canWrite = () => !!(S.me && S.me.canWrite), canRecheck = () => !!(S.me && S.me.canRecheck);

  // ── navigation ─────────────────────────────────────────────────────────────
  const NAV = [['overview', 'Overview', 'grid'], ['attention', 'Needs attention', 'alert'], ['premium', 'Premium', 'star'], ['households', 'Households', 'home'], ['users', 'Users', 'users'],
    ['payments', 'Payments', 'card'], ['chipereganyu', 'Chipereganyu', 'circle'], ['announcements', 'Notices', 'mega'], ['reports', 'Reports', 'chart'], ['activity', 'Activity log', 'log'], ['settings', 'Settings', 'gear']];
  function drawNav() {
    $('nav').innerHTML = NAV.map(([id, label, ic]) => `<button class="nav-item${S.page === id ? ' active' : ''}" type="button" data-a="go" data-id="${id}">${icon(ic)}${esc(label)}${id === 'attention' && S.attention ? `<span class="count">${S.attention}</span>` : ''}</button>`).join('');
  }
  function go(page) { if (location.hash !== '#' + page) location.hash = '#' + page; else render(); }
  async function render(force) {
    const page = (location.hash || '#overview').slice(1);
    S.page = PAGES[page] ? page : 'overview';
    drawNav(); closeMenu();
    $('pageTitle').textContent = (NAV.find(n => n[0] === S.page) || NAV[0])[1];
    const v = $('view');
    v.innerHTML = '<div class="grid tiles"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
    const seq = (S.seq = (S.seq || 0) + 1);
    try { const html = await PAGES[S.page](force === true); if (seq === S.seq) { v.innerHTML = html; after(); } }
    catch (e) { if (seq === S.seq) v.innerHTML = errorBox(e); }
  }
  const errorBox = e => `<div class="banner bad"><b>Could not load this page.</b><br>${esc(e.message || e)}${e.detail ? '<br><span class="small">' + esc(e.detail) + '</span>' : ''}<br><button class="btn sm" type="button" data-a="reload">Try again</button></div>`;
  const header = (title, sub, extra = '') => `<div class="page-head"><div><h2>${esc(title)}</h2>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}</div><div class="actions">${extra}<button class="btn subtle sm" type="button" data-a="reload">${icon('refresh')}Refresh</button></div></div>`;
  const authBanner = a => (a && !a.ok ? `<div class="banner warn"><b>Sign-in dates are not available.</b> ${esc(a.note || '')} Users, last-seen and growth figures need this. <button class="btn sm" type="button" data-a="go" data-id="settings">How to fix</button></div>` : '');
  const noteTrunc = t => (t ? '<p class="small muted" style="margin-top:8px">Showing the 1,000 most recent payments. Older ones are not included in these figures.</p>' : '');

  // ── charts (plain SVG, no library) ─────────────────────────────────────────
  const niceMax = m => { if (m <= 4) return Math.ceil(m); const p = Math.pow(10, Math.floor(Math.log10(m))); const f = m / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
  function columns(items, { fmt = num, label = x => x, unit = '' } = {}) {
    const vw = $('view').clientWidth || 640, W = Math.max(280, Math.round((vw >= 860 ? (vw - 12) / 2 : vw) - 34)), H = 170, L = 40, R = 6, T = 16, B = 24, iw = W - L - R, ih = H - T - B;
    const max = niceMax(Math.max(1, ...items.map(x => x.v))), slot = iw / items.length, bw = Math.min(24, slot * 0.7);
    const peak = items.reduce((a, x, i) => (x.v > items[a].v ? i : a), 0);
    let g = '';
    (max <= 4 ? [0, 1] : [0, 0.5, 1]).forEach(f => { const y = T + ih - f * ih; g += `<line class="${f ? 'grid' : 'base'}" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text x="${L - 6}" y="${y + 4}" text-anchor="end">${esc(short(Math.round(max * f)))}</text>`; });
    items.forEach((x, i) => {
      const bh = (x.v / max) * ih, bx = L + i * slot + (slot - bw) / 2, by = T + ih - bh, r = Math.min(4, bh);
      if (x.v > 0) g += `<path class="bar" d="M${bx},${by + bh}V${by + r}Q${bx},${by} ${bx + r},${by}H${bx + bw - r}Q${bx + bw},${by} ${bx + bw},${by + r}V${by + bh}Z"/>`;
      g += `<rect class="hit" x="${L + i * slot}" y="${T}" width="${slot}" height="${ih}" data-tip="${esc(label(x.k) + ': ' + fmt(x.v) + unit)}"/>`;
    });
    if (items[peak].v > 0) { const px = L + peak * slot + slot / 2; g += `<text x="${Math.min(Math.max(px, L + 14), W - R - 14)}" y="${T + ih - (items[peak].v / max) * ih - 5}" text-anchor="middle" style="fill:var(--ink);font-weight:700">${esc(short(items[peak].v))}</text>`; }
    [0, Math.floor((items.length - 1) / 2), items.length - 1].forEach((i, n) => { g += `<text x="${L + i * slot + slot / 2}" y="${H - 6}" text-anchor="${n === 0 ? 'start' : n === 2 ? 'end' : 'middle'}">${esc(label(items[i].k))}</text>`; });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Column chart, ${items.length} values, highest ${esc(fmt(items[peak].v))} on ${esc(label(items[peak].k))}">${g}</svg>`;
  }
  const tableView = (items, label, fmt, head) => `<details class="small" style="margin-top:8px"><summary class="muted" style="cursor:pointer">Show as a table</summary><div class="table-wrap"><table><thead><tr><th>${esc(head[0])}</th><th class="r">${esc(head[1])}</th></tr></thead><tbody>${items.map(x => `<tr><td>${esc(label(x.k))}</td><td class="r num">${esc(fmt(x.v))}</td></tr>`).join('')}</tbody></table></div></details>`;
  const columnCard = (title, sub, items, o) => `<article class="card"><div class="card-head"><div><h3>${esc(title)}</h3><p class="muted small">${esc(sub)}</p></div></div>${columns(items, o)}${tableView(items, o.label || (x => x), o.fmt || num, [o.head || 'Day', o.valueHead || 'Value'])}</article>`;
  function segmented(parts) {
    const total = parts.reduce((s, p) => s + p.v, 0) || 1;
    return `<div class="seg" role="img" aria-label="${esc(parts.map(p => p.label + ' ' + p.v).join(', '))}">${parts.filter(p => p.v > 0).map(p => `<i style="flex:${p.v};background:var(${p.c})" data-tip="${esc(p.label + ': ' + p.v + ' (' + Math.round(p.v / total * 100) + '%)')}"></i>`).join('')}</div>
      <table class="legend"><tbody>${parts.map(p => `<tr><td><span class="sw" style="background:var(${p.c})"></span>${esc(p.label)}</td><td class="r num">${num(p.v)}</td><td class="r num muted">${Math.round(p.v / total * 100)}%</td></tr>`).join('')}</tbody></table>`;
  }
  const mixParts = s => [{ label: 'Premium', v: s.premium, c: '--c1' }, { label: 'On trial', v: s.trial, c: '--c2' }, { label: 'Premium ended', v: s.premium_expired, c: '--c3' }, { label: 'Trial over', v: s.trial_ended, c: '--c4' }, { label: 'Free', v: s.free, c: '--c5' }];

  // ── lists shared by pages ──────────────────────────────────────────────────
  const tile = (label, value, sub, o = {}) => `<${o.go ? 'button type="button" data-a="go" data-id="' + o.go + '"' : 'div'} class="card tile${o.warn ? ' warn' : ''}"><div class="label">${esc(label)}</div><div class="value">${value}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</${o.go ? 'button' : 'div'}>`;
  const chips = (key, list, counts) => `<div class="chips" role="group">${list.map(([id, label]) => `<button type="button" class="chip${(S.f[key] || {}).chip === id || (!(S.f[key] || {}).chip && id === 'all') ? ' on' : ''}" data-a="chip" data-key="${key}" data-id="${id}">${esc(label)}${counts && counts[id] !== undefined ? `<span class="n">${counts[id]}</span>` : ''}</button>`).join('')}</div>`;
  const searchBox = (key, ph) => `<input class="search" type="search" placeholder="${esc(ph)}" value="${esc((S.f[key] || {}).q || '')}" data-a="search" data-key="${key}" aria-label="${esc(ph)}">`;
  const fq = key => ((S.f[key] || {}).q || '').trim().toLowerCase(), fc = key => (S.f[key] || {}).chip || 'all';
  const cap = (rows, total) => (total > ROW_CAP ? `<p class="small muted" style="padding:10px">Showing the first ${ROW_CAP} of ${total}. Use the search or a filter to narrow it down.</p>` : '');
  function csvDownload(name, rows) {
    const cell = v => { v = v === null || v === undefined ? '' : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const blob = new Blob(['﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);

  // ── pages ──────────────────────────────────────────────────────────────────
  const PAGES = {};

  PAGES.overview = async force => {
    const o = await get('overview', {}, force);
    S.attention = o.attention.total; drawNav();
    const u = o.users, p = o.premium, r = o.revenue, hh = o.households;
    const attn = o.attention.total
      ? `<button type="button" class="banner ${o.attention.high ? 'bad' : 'warn'}" style="width:100%;text-align:left;cursor:pointer" data-a="go" data-id="attention"><b>${o.attention.total} thing${o.attention.total === 1 ? '' : 's'} need${o.attention.total === 1 ? 's' : ''} a look</b>${o.attention.high ? ` (${o.attention.high} urgent)` : ''}. ${esc(o.attention.items[0].title)}. Tap to review.</button>`
      : '<div class="banner good">Nothing needs attention. Payments and Premium dates look consistent.</div>';
    return `${header('Overview', 'How Bajeti Yanga is doing right now.')}${authBanner(o.auth)}${attn}
      <div class="grid tiles">
        ${tile('Users', num(u.total), u.last7 === null ? '' : '+' + u.last7 + ' this week', { go: 'users' })}
        ${tile('Active this week', num(u.active7), u.active30 === null ? '' : num(u.active30) + ' in 30 days', { go: 'users' })}
        ${tile('Households', num(hh.live), '+' + hh.last7 + ' this week', { go: 'households' })}
        ${tile('Premium now', num(p.states.premium), p.unlimited ? p.unlimited + ' with no end date' : num(p.states.trial) + ' on trial', { go: 'premium' })}
        ${tile('Revenue this month', money(r.thisMonth), 'Last month ' + money(r.lastMonth), { go: 'payments' })}
        ${tile('Expiring in 7 days', num(p.expiring7), num(p.expiring30) + ' in 30 days', { go: 'premium', warn: p.expiring7 > 0 })}
        ${tile('Paying households', num(p.payingHouseholds), num(p.repeatPayers) + ' paid more than once', { go: 'reports' })}
        ${tile('Needs attention', num(o.attention.total), o.attention.high + ' urgent', { go: 'attention', warn: o.attention.total > 0 })}
      </div>
      <div class="grid two" style="margin-top:12px">
        ${o.signupsByDay ? columnCard('New users', 'Last 30 days', o.signupsByDay.map(x => ({ k: x.d, v: x.n })), { label: dayLabel, unit: ' new', head: 'Day', valueHead: 'New users' }) : columnCard('New households', 'Last 30 days', o.newHouseholdsByDay.map(x => ({ k: x.d, v: x.n })), { label: dayLabel, unit: ' new', head: 'Day', valueHead: 'New households' })}
        ${columnCard('Revenue', 'Last 12 months, in kwacha', r.byMonth.map(x => ({ k: x.m, v: x.amount })), { label: monthName, fmt: money, head: 'Month', valueHead: 'Revenue' })}
      </div>
      <div class="grid two" style="margin-top:12px">
        <article class="card"><div class="card-head"><div><h3>Households by plan</h3><p class="muted small">${num(hh.live)} households, not counting deleted ones</p></div></div>${segmented(mixParts(p.states))}</article>
        <article class="card"><div class="card-head"><div><h3>How people move through</h3><p class="muted small">Rates use the records available today</p></div></div>
          <dl class="kv">
            <dt>Trial to paid</dt><dd>${p.conversionRate === null ? DASH : p.conversionRate + '%'} <span class="muted">(${p.converted} of ${p.trialed} who tried it)</span></dd>
            <dt>Paid again</dt><dd>${num(p.repeatPayers)} of ${num(p.payingHouseholds)} paying households</dd>
            <dt>30-day return</dt><dd>${u.retention30 === null ? DASH : u.retention30 + '%'} <span class="muted">${u.retentionCohort ? '(of ' + u.retentionCohort + ' users older than 30 days)' : ''}</span></dd>
            <dt>Not seen in 30 days</dt><dd>${num(u.inactive30)} users</dd>
            <dt>Average month</dt><dd>${money(r.avgMonthly3)} <span class="muted">over the last 3 full months</span></dd>
          </dl></article>
      </div>
      <div class="grid two" style="margin-top:12px">
        <article class="card"><div class="card-head"><h3>Newest users</h3></div>${o.recentSignups.length ? `<div class="list">${o.recentSignups.map(x => `<div class="li"><div class="t">${esc(x.name)}</div><div class="s">${esc(ago(x.created))}</div></div>`).join('')}</div>` : '<p class="muted">Not available until the sign-in list is connected.</p>'}</article>
        <article class="card"><div class="card-head"><h3>Latest admin activity</h3><button class="btn ghost sm" type="button" data-a="go" data-id="activity">All</button></div>${o.recentLog.length ? `<div class="list">${o.recentLog.map(x => `<div class="li"><div><div class="t">${esc(actionLabel(x.action))}</div><div class="s">${esc(x.by || '')}${x.target ? ' · ' + esc(x.target) : ''}</div></div><div class="s">${esc(ago(x.atMs))}</div></div>`).join('')}</div>` : '<p class="muted">Nothing yet. Every change made here shows up in this list.</p>'}</article>
      </div>${noteTrunc(r.truncated)}`;
  };

  PAGES.attention = async force => {
    const d = await get('attention', {}, force);
    S.attention = d.items.length; drawNav();
    const rows = d.items.map(x => {
      const btns = [];
      if (x.kind === 'payment') {
        if (x.canRecheck && canRecheck()) btns.push(`<button class="btn primary sm" type="button" data-a="recheck" data-id="${esc(x.ref.id)}">Re-check with PayChangu</button>`);
        btns.push(`<button class="btn ghost sm" type="button" data-a="open-pay" data-id="${esc(x.ref.id)}">Payment</button>`);
        if (x.ref.householdId) btns.push(`<button class="btn ghost sm" type="button" data-a="open-hh" data-id="${esc(x.ref.householdId)}">Household</button>`);
      } else btns.push(`<button class="btn primary sm" type="button" data-a="open-hh" data-id="${esc(x.ref.id)}">Open household</button>`);
      return `<article class="card"><div class="card-head"><div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${badge(x.severity, x.severity === 'high' ? 'Urgent' : x.severity === 'medium' ? 'Check' : 'Tidy up')}<h3>${esc(x.title)}</h3></div><p class="muted" style="margin-top:6px">${esc(x.detail)}</p></div></div><div class="actions">${btns.join('')}</div></article>`;
    }).join('');
    return `${header('Needs attention', 'Payments and Premium dates that a person should look at, worst first.')}${rows || '<div class="banner good">Nothing needs attention. Payments and Premium dates look consistent.</div>'}${noteTrunc(d.truncated)}`;
  };

  PAGES.premium = async force => {
    const d = await get('premium', {}, force);
    const row = r => `<div class="li"><div><div class="t">${esc(r.id)}${r.name ? ' · ' + esc(r.name) : ''}</div><div class="s">${esc(r.ownerName || 'no owner')} · ${r.paid} payment${r.paid === 1 ? '' : 's'}</div></div><div style="text-align:right"><div class="s">${r.state === 'trial' ? esc(r.trialDaysLeft + ' trial days left') : r.unlimited ? 'No end date' : esc(fmtYmd(r.expiry)) + (r.daysLeft !== null ? ' (' + r.daysLeft + ' d)' : '')}</div><button class="btn ghost sm" type="button" data-a="open-hh" data-id="${esc(r.id)}">Open</button></div></div>`;
    const sec = (title, sub, rows) => `<article class="card"><div class="card-head"><div><h3>${esc(title)}</h3><p class="muted small">${esc(sub)}</p></div><span class="badge">${rows.length}</span></div>${rows.length ? `<div class="list">${rows.map(row).join('')}</div>` : '<p class="muted">None right now.</p>'}</article>`;
    return `${header('Premium', 'Who to follow up with, and a way to find any household.')}
      <article class="card"><h3>Find a household</h3><p class="muted small" style="margin:4px 0 10px">Search by household code, owner email or phone number, then change Premium from its page.</p><input class="search" style="width:100%" type="search" id="finder" placeholder="Code, email or phone" data-a="finder" aria-label="Find a household"><div id="finderOut" style="margin-top:8px"></div></article>
      <div style="margin-top:12px">${sec('Expiring in 14 days', 'Ask them to renew before it ends.', d.expiring)}</div>
      <div class="grid two" style="margin-top:12px">${sec('On trial', 'Fewest days left first.', d.trials)}${sec('Premium ended recently', 'The 50 most recent. Possible renewals.', d.expired)}</div>
      <div class="grid two" style="margin-top:12px">${sec('No end date', 'Given by hand or older activations.', d.unlimited)}${sec('Premium in the old field', 'Works, but should be moved to the new fields.', d.legacy)}</div>`;
  };

  const hhFilter = (rows) => {
    const q = fq('hh'), c = fc('hh');
    return rows.filter(r => {
      if (c === 'deleted' ? !r.deleted : r.deleted) return false;
      if (c !== 'all' && c !== 'deleted' && c !== 'legacy' && r.state !== c) return false;
      if (c === 'legacy' && !r.legacy) return false;
      return !q || [r.id, r.name, r.ownerName].some(x => x && String(x).toLowerCase().includes(q));
    });
  };
  const hhTable = rows => `<div class="table-wrap"><table><thead><tr><th>Household</th><th>Owner</th><th class="r">Members</th><th>Plan</th><th class="r">Paid</th><th>Created</th></tr></thead><tbody>${rows.slice(0, ROW_CAP).map(r => `<tr class="row" data-a="open-hh" data-id="${esc(r.id)}"><td><b>${esc(r.id)}</b>${r.name ? `<div class="s muted small">${esc(r.name)}</div>` : ''}</td><td>${esc(r.ownerName || DASH)}</td><td class="r num">${r.members}</td><td>${stateBadge(r)}${r.legacy ? ' ' + badge('warn', 'old field') : ''}<div class="small muted">${r.unlimited ? 'No end date' : r.state === 'trial' ? r.trialDaysLeft + ' days left' : r.expiry ? 'Ends ' + esc(fmtYmd(r.expiry)) : ''}</div></td><td class="r num">${r.paid || DASH}</td><td>${esc(fmtDate(r.created))}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No households match.</td></tr>'}</tbody></table></div>${cap(rows, rows.length)}`;
  PAGES.households = async force => {
    const d = await get('households', {}, force), all = d.rows;
    const live = all.filter(r => !r.deleted), counts = { all: live.length, premium: 0, trial: 0, premium_expired: 0, free: 0, legacy: 0, deleted: all.length - live.length };
    live.forEach(r => { if (counts[r.state] !== undefined) counts[r.state]++; if (r.legacy) counts.legacy++; });
    return `${header('Households', 'Subscription details only. Budgets and purchases are never loaded.', '<button class="btn ghost sm" type="button" data-a="csv-hh">' + icon('down') + 'Export</button>')}${authBanner(d.auth)}
      <div class="toolbar">${searchBox('hh', 'Search code, name or owner')}</div>
      <div class="toolbar">${chips('hh', [['all', 'All'], ['premium', 'Premium'], ['trial', 'Trial'], ['premium_expired', 'Ended'], ['free', 'Free'], ['legacy', 'Old field'], ['deleted', 'Deleted']], counts)}</div>
      <div class="card" style="padding:6px"><div id="list">${hhTable(hhFilter(all))}</div></div>`;
  };

  const userFilter = rows => {
    const q = fq('us'), c = fc('us'), now = Date.now();
    return rows.filter(r => {
      if (c === 'active' && !(r.lastSignIn && now - r.lastSignIn < 7 * 864e5)) return false;
      if (c === 'inactive' && r.lastSignIn && now - r.lastSignIn < 30 * 864e5) return false;
      if (c === 'disabled' && !r.disabled) return false;
      if (c === 'nohh' && r.householdCount) return false;
      if (c === 'pending' && !r.pendingDeletion) return false;
      return !q || [r.name, r.uid].some(x => x && String(x).toLowerCase().includes(q));
    });
  };
  const provName = p => ({ 'google.com': 'Google', password: 'Email', phone: 'Phone' }[p] || p);
  const usersTable = rows => `<div class="table-wrap"><table><thead><tr><th>User</th><th>Signed up</th><th>Last seen</th><th class="r">Households</th><th>Status</th></tr></thead><tbody>${rows.slice(0, ROW_CAP).map(r => `<tr class="row" data-a="open-user" data-id="${esc(r.uid)}"><td><b>${esc(r.name)}</b><div class="small muted">${esc((r.providers || []).map(provName).join(', '))}</div></td><td>${esc(fmtDate(r.created))}</td><td>${esc(ago(r.lastSignIn))}</td><td class="r num">${r.householdCount || DASH}</td><td>${r.disabled ? badge('disabled', 'Disabled') : ''} ${r.pendingDeletion ? badge('warn', 'Deleting') : ''} ${r.verified === false ? badge('low', 'Unverified') : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No users match.</td></tr>'}</tbody></table></div>${cap(rows, rows.length)}`;
  PAGES.users = async force => {
    const d = await get('users', {}, force), all = d.rows, now = Date.now();
    const counts = { all: all.length, active: all.filter(r => r.lastSignIn && now - r.lastSignIn < 7 * 864e5).length, inactive: all.filter(r => !r.lastSignIn || now - r.lastSignIn >= 30 * 864e5).length, disabled: all.filter(r => r.disabled).length, nohh: all.filter(r => !r.householdCount).length, pending: all.filter(r => r.pendingDeletion).length };
    return `${header('Users', 'Accounts from Firebase sign-in. Budgets and entries are never shown.', '<button class="btn ghost sm" type="button" data-a="csv-users">' + icon('down') + 'Export</button>')}${authBanner(d.auth)}
      <div class="toolbar">${searchBox('us', 'Search email, phone or ID')}</div>
      <div class="toolbar">${chips('us', [['all', 'All'], ['active', 'Active this week'], ['inactive', 'Not seen in 30 days'], ['nohh', 'No household'], ['disabled', 'Disabled'], ['pending', 'Deleting']], counts)}</div>
      <div class="card" style="padding:6px"><div id="list">${usersTable(userFilter(all))}</div></div>`;
  };

  const payFilter = rows => {
    const q = fq('pay'), c = fc('pay');
    return rows.filter(r => {
      if (c === 'look' ? !r.look : c === 'manual' ? r.source !== 'manual' : c !== 'all' && r.status !== c) return false;
      return !q || [r.id, r.who, r.householdId, r.note].some(x => x && String(x).toLowerCase().includes(q));
    });
  };
  const payTable = rows => `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Customer</th><th class="r">Amount</th><th>Plan</th><th>Status</th><th>Ends</th></tr></thead><tbody>${rows.slice(0, ROW_CAP).map(r => `<tr class="row" data-a="open-pay" data-id="${esc(r.id)}"><td>${esc(fmtDateTime(r.paidAtMs || r.createdAtMs))}</td><td><b>${esc(r.who || DASH)}</b><div class="small muted">${esc(r.householdId || '')}</div></td><td class="r num">${esc(money(r.amount))}</td><td>${r.months ? r.months + ' mo' : DASH}${r.source === 'manual' ? ' ' + badge('info', 'manual') : ''}</td><td>${badge(r.status)}${r.look ? ' ' + badge('warn', 'look') : ''}</td><td>${esc(fmtYmd(r.premiumExpiry))}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No payments match.</td></tr>'}</tbody></table></div>${cap(rows, rows.length)}`;
  PAGES.payments = async force => {
    const d = await get('payments', { limit: 1000 }, force), all = d.rows;
    const counts = { all: all.length, look: all.filter(r => r.look).length, manual: all.filter(r => r.source === 'manual').length };
    ['paid', 'pending', 'failed', 'mismatch', 'expired'].forEach(s => { counts[s] = all.filter(r => r.status === s).length; });
    return `${header('Payments', 'Every payment, from PayChangu and recorded by hand.', '<button class="btn ghost sm" type="button" data-a="csv-pay">' + icon('down') + 'Export</button>')}
      <div class="toolbar">${searchBox('pay', 'Search reference, customer or household')}</div>
      <div class="toolbar">${chips('pay', [['all', 'All'], ['look', 'Needs a look'], ['paid', 'Paid'], ['pending', 'Pending'], ['failed', 'Failed'], ['mismatch', 'Mismatch'], ['expired', 'Expired'], ['manual', 'Recorded by hand']], counts)}</div>
      <div class="card" style="padding:6px"><div id="list">${payTable(payFilter(all))}</div></div><p id="paySum" class="small muted" style="margin-top:8px">${paySum(payFilter(all))}</p>${noteTrunc(d.truncated)}`;
  };
  const paySum = rows => { const p = rows.filter(r => r.status === 'paid'); return `${rows.length} shown. Paid in this view: ${p.length} payments, ${money(p.reduce((s, r) => s + r.amount, 0))}.`; };

  const chipFilter = rows => {
    const q = fq('chip'), c = fc('chip');
    return rows.filter(r => {
      if (c === 'overdue' ? !r.overdueDays : c === 'stuck' ? !r.stuck : c !== 'all' && r.status !== c) return false;
      return !q || [r.id, r.name, r.admin].some(x => x && String(x).toLowerCase().includes(q));
    });
  };
  const chipTable = rows => `<div class="table-wrap"><table><thead><tr><th>Circle</th><th>Admin</th><th class="r">Members</th><th>Status</th><th>Round</th><th>Due</th><th class="r">Paid</th><th class="r">Waiting</th></tr></thead><tbody>${rows.slice(0, ROW_CAP).map(r => `<tr><td><b>${esc(r.name)}</b><div class="small muted">${esc(r.id)} · ${esc(r.frequency || '')} · ${esc(money(r.amount))}</div></td><td>${esc(r.admin || DASH)}</td><td class="r num">${r.members}</td><td>${badge(r.status === 'active' ? 'ok' : r.status === 'gathering' ? 'info' : 'free', r.status)}</td><td>${r.cycle ? 'Round ' + r.cycle + (r.lap ? ', lap ' + r.lap : '') : DASH}</td><td>${r.dueDate ? esc(fmtYmd(r.dueDate)) : DASH}${r.overdueDays ? ' ' + badge('bad', r.overdueDays + ' d late') : ''}</td><td class="r num">${r.contributors ? r.paid + '/' + r.contributors : DASH}</td><td class="r num">${r.sentNotConfirmed || DASH}${r.stuck ? ' ' + badge('warn', r.stuck + ' over 3 d') : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">No circles match.</td></tr>'}</tbody></table></div>${cap(rows, rows.length)}`;
  PAGES.chipereganyu = async force => {
    const d = await get('chipereganyu', {}, force), all = d.rows, s = d.summary;
    const counts = { all: s.total, overdue: s.overdue, stuck: s.stuck }; ['active', 'gathering', 'completed', 'closed'].forEach(k => { counts[k] = s.byStatus[k] || 0; });
    return `${header('Chipereganyu', 'Counts only. No member names and no per-person amounts are shown.')}
      <div class="banner info">This console cannot change contributions or payouts. Those records belong to the circle, and changes would need a trail that this page does not provide. "Waiting" means a member said they sent money and the recipient has not confirmed yet.</div>
      <div class="grid tiles">${tile('Circles', num(s.total), (s.byStatus.active || 0) + ' active')}${tile('Overdue', num(s.overdue), 'Past the due date, not everyone paid', { warn: s.overdue > 0 })}${tile('Stuck confirmations', num(s.stuck), 'Waiting more than 3 days', { warn: s.stuck > 0 })}${tile('Gathering', num(s.byStatus.gathering || 0), 'Not started yet')}</div>
      <div class="toolbar" style="margin-top:12px">${searchBox('chip', 'Search code, name or admin')}</div>
      <div class="toolbar">${chips('chip', [['all', 'All'], ['overdue', 'Overdue'], ['stuck', 'Stuck'], ['active', 'Active'], ['gathering', 'Gathering'], ['completed', 'Completed'], ['closed', 'Closed']], counts)}</div>
      <div class="card" style="padding:6px"><div id="list">${chipTable(chipFilter(all))}</div></div>`;
  };

  const noticeStatus = n => { const now = Date.now(); return n.active === false ? ['Off', 'free'] : n.startsAtMs && n.startsAtMs > now ? ['Scheduled', 'info'] : n.endsAtMs && n.endsAtMs <= now ? ['Ended', 'warn'] : ['Live', 'ok']; };
  const toLocalInput = ms => { if (!ms) return ''; const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
  PAGES.announcements = async force => {
    const d = await get('announcements', {}, force), edit = S.editNotice ? d.rows.find(x => x.id === S.editNotice) : null;
    const form = canWrite() ? `<article class="card"><div class="card-head"><div><h3>${edit ? 'Edit notice' : 'New notice'}</h3><p class="muted small">Shown at the top of the app. Up to 3 at a time. People can dismiss them.</p></div>${edit ? '<button class="btn ghost sm" type="button" data-a="notice-cancel">Cancel</button>' : ''}</div>
        <div class="field"><label for="n-title">Title (up to 80 letters)</label><input id="n-title" maxlength="80" value="${esc(edit ? edit.title : '')}"></div>
        <div class="field"><label for="n-body">Message (up to 500 letters)</label><textarea id="n-body" maxlength="500">${esc(edit ? edit.body : '')}</textarea></div>
        <div class="row2"><div class="field"><label for="n-aud">Who sees it</label><select id="n-aud">${[['all', 'Everyone'], ['free', 'Free users'], ['premium', 'Premium users']].map(([v, l]) => `<option value="${v}"${edit && edit.audience === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="n-lang">Language</label><select id="n-lang">${[['all', 'Both'], ['en', 'English users'], ['cw', 'Chichewa users']].map(([v, l]) => `<option value="${v}"${edit && edit.lang === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
        <div class="row2"><div class="field"><label for="n-kind">Style</label><select id="n-kind"><option value="info">Information</option><option value="warning"${edit && edit.kind === 'warning' ? ' selected' : ''}>Important</option></select></div><div></div></div>
        <div class="row2"><div class="field"><label for="n-from">Show from (optional)</label><input id="n-from" type="datetime-local" value="${toLocalInput(edit && edit.startsAtMs)}"></div><div class="field"><label for="n-to">Hide after (optional)</label><input id="n-to" type="datetime-local" value="${toLocalInput(edit && edit.endsAtMs)}"></div></div>
        <label class="check"><input id="n-active" type="checkbox"${!edit || edit.active !== false ? ' checked' : ''}><span>Switched on</span></label>
        <button class="btn primary" type="button" data-a="notice-save">${edit ? 'Save changes' : 'Publish notice'}</button></article>` : '<div class="banner info">Only the owner can publish notices.</div>';
    const list = d.rows.map(n => { const [st, cls] = noticeStatus(n); return `<article class="card"><div class="card-head"><div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><h3>${esc(n.title)}</h3>${badge(cls, st)}${badge('low', n.audience === 'all' ? 'Everyone' : n.audience === 'free' ? 'Free' : 'Premium')}${badge('low', n.lang === 'all' ? 'Both languages' : n.lang === 'en' ? 'English' : 'Chichewa')}${n.kind === 'warning' ? badge('warn', 'Important') : ''}</div><p style="margin-top:6px;white-space:pre-wrap">${esc(n.body)}</p><p class="small muted" style="margin-top:6px">${n.startsAtMs ? 'From ' + esc(fmtDateTime(n.startsAtMs)) + '. ' : ''}${n.endsAtMs ? 'Until ' + esc(fmtDateTime(n.endsAtMs)) + '. ' : ''}By ${esc(n.createdBy || DASH)}, ${esc(fmtDate(n.createdAtMs))}</p></div></div>${canWrite() ? `<div class="actions"><button class="btn ghost sm" type="button" data-a="notice-edit" data-id="${esc(n.id)}">Edit</button><button class="btn ghost sm" type="button" data-a="notice-toggle" data-id="${esc(n.id)}">${n.active === false ? 'Switch on' : 'Switch off'}</button><button class="btn danger sm" type="button" data-a="notice-delete" data-id="${esc(n.id)}">Delete</button></div>` : ''}</article>`; }).join('');
    return `${header('Notices', 'Announcements shown inside the app.')}${form}<h3 style="margin:18px 0 10px">Published</h3>${list || '<p class="muted">No notices yet.</p>'}`;
  };

  PAGES.reports = async force => {
    const o = await get('overview', {}, force), p = o.premium, r = o.revenue, u = o.users, hh = o.households;
    const plan = [{ label: '1 month', v: r.byPlan.one, c: '--c1' }, { label: '3 months', v: r.byPlan.three, c: '--c2' }, { label: 'Recorded by hand', v: r.byPlan.manual, c: '--c3' }];
    return `${header('Reports', 'Growth, revenue and how people stay.')}${authBanner(o.auth)}
      <div class="grid two">
        ${o.signupsByDay ? columnCard('New users per day', 'Last 30 days, from Firebase sign-in', o.signupsByDay.map(x => ({ k: x.d, v: x.n })), { label: dayLabel, unit: ' new', head: 'Day', valueHead: 'New users' }) : ''}
        ${columnCard('New households per day', 'Last 30 days', o.newHouseholdsByDay.map(x => ({ k: x.d, v: x.n })), { label: dayLabel, unit: ' new', head: 'Day', valueHead: 'New households' })}
        ${columnCard('Revenue per month', 'Last 12 months, in kwacha', r.byMonth.map(x => ({ k: x.m, v: x.amount })), { label: monthName, fmt: money, head: 'Month', valueHead: 'Revenue' })}
        ${columnCard('Payments per month', 'Number of paid payments', r.byMonth.map(x => ({ k: x.m, v: x.count })), { label: monthName, head: 'Month', valueHead: 'Payments' })}
      </div>
      <div class="grid two" style="margin-top:12px">
        <article class="card"><div class="card-head"><h3>Households by plan</h3></div>${segmented(mixParts(p.states))}</article>
        <article class="card"><div class="card-head"><h3>What people buy</h3></div>${segmented(plan)}<p class="small muted" style="margin-top:8px">Paid payments in the records loaded.</p></article>
      </div>
      <article class="card" style="margin-top:12px"><div class="card-head"><h3>Key numbers</h3></div><dl class="kv">
        <dt>Revenue, all time</dt><dd>${money(r.total)}</dd><dt>This month</dt><dd>${money(r.thisMonth)}</dd><dt>Average month</dt><dd>${money(r.avgMonthly3)} (last 3 full months)</dd>
        <dt>Paying households</dt><dd>${num(p.payingHouseholds)} of ${num(hh.live)}</dd><dt>Paid more than once</dt><dd>${num(p.repeatPayers)}${p.payingHouseholds ? ' (' + Math.round(p.repeatPayers / p.payingHouseholds * 100) + '%)' : ''}</dd>
        <dt>Trial to paid</dt><dd>${p.conversionRate === null ? DASH : p.conversionRate + '% (' + p.converted + ' of ' + p.trialed + ')'}</dd>
        <dt>Active this week</dt><dd>${num(u.active7)} of ${num(u.total)} users</dd><dt>Active in 30 days</dt><dd>${num(u.active30)}</dd><dt>30-day return</dt><dd>${u.retention30 === null ? DASH : u.retention30 + '%'}</dd>
      </dl>${noteTrunc(r.truncated)}</article>
      <div class="banner info" style="margin-top:12px"><b>Not included: most-used features.</b> The app does not record which screens people use, so there is nothing to report yet. Adding it means adding usage counters to the app first.</div>`;
  };

  const ACTION = { premium_extend: 'Gave or extended Premium', premium_set_expiry: 'Set Premium end date', premium_unlimited: 'Premium with no end date', premium_revoke: 'Removed Premium', premium_tidy: 'Moved Premium to new fields',
    payment_recheck: 'Re-checked a payment', payment_note: 'Payment note', user_disable: 'Disabled an account', user_enable: 'Enabled an account', announcement_create: 'Published a notice', announcement_edit: 'Edited a notice', announcement_delete: 'Deleted a notice', settings_save: 'Changed maintenance mode', denied: 'Blocked sign-in attempt' };
  function actionLabel(a) { return ACTION[a] || String(a || '').replace(/_/g, ' '); }
  const prem = x => (x ? (STATE[x.state] || x.state) + (x.expiry ? ' to ' + x.expiry : x.unlimited ? ', no end date' : '') : DASH);
  function logDetail(r) {
    const bits = [];
    if (r.action && r.action.startsWith('premium_') && r.before && r.after) bits.push(prem(r.before) + '  >  ' + prem(r.after));
    if (r.action === 'payment_recheck' && r.before) bits.push(r.before.status + '  >  ' + (r.after ? r.after.status : '') + (r.reopened ? ' (reopened)' : ''));
    if ((r.action === 'user_disable' || r.action === 'user_enable') && r.who) bits.push(r.who);
    if (r.action === 'payment_note' && r.after) bits.push((r.after.resolved ? 'Reviewed. ' : '') + (r.after.note || ''));
    if (r.action === 'settings_save' && r.after) bits.push(r.after.on ? 'On: ' + r.after.message : 'Off');
    if (r.after && r.after.title) bits.push(r.after.title);
    if (r.reason) bits.push('Reason: ' + r.reason);
    if (r.paymentId) bits.push('Payment recorded');
    return bits.map(esc).join('<br>');
  }
  const logFilter = rows => {
    const q = fq('log'), c = fc('log');
    return rows.filter(r => {
      const a = r.action || '';
      if (c === 'premium' && !a.startsWith('premium_')) return false;
      if (c === 'payments' && !a.startsWith('payment_')) return false;
      if (c === 'accounts' && !a.startsWith('user_')) return false;
      if (c === 'notices' && !(a.startsWith('announcement_') || a === 'settings_save')) return false;
      if (c === 'denied' && a !== 'denied') return false;
      return !q || [r.by, r.target, r.reason, actionLabel(a)].some(x => x && String(x).toLowerCase().includes(q));
    });
  };
  const logTable = rows => `<div class="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Target</th><th>Details</th></tr></thead><tbody>${rows.slice(0, ROW_CAP).map(r => `<tr><td>${esc(fmtDateTime(r.atMs))}</td><td>${esc(r.by || DASH)}<div class="small muted">${esc(r.role || '')}</div></td><td>${r.action === 'denied' ? badge('bad', actionLabel(r.action)) : esc(actionLabel(r.action))}</td><td>${r.target && /^(premium_|payment_note|payment_recheck)/.test(r.action || '') ? `<a href="#" data-a="${r.action.startsWith('premium_') ? 'open-hh' : 'open-pay'}" data-id="${esc(r.target)}">${esc(r.target)}</a>` : esc(r.target || DASH)}</td><td class="small">${logDetail(r) || DASH}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nothing here yet.</td></tr>'}</tbody></table></div>`;
  PAGES.activity = async force => {
    const d = await get('log', { limit: 300 }, force), all = d.rows;
    const counts = { all: all.length }; ['premium', 'payments', 'accounts', 'notices', 'denied'].forEach(c => { counts[c] = logFilter.call(null, all.filter(() => true)).length; });
    const keep = S.f.log; ['premium', 'payments', 'accounts', 'notices', 'denied'].forEach(c => { S.f.log = { chip: c }; counts[c] = logFilter(all).length; }); S.f.log = keep;
    return `${header('Activity log', 'Every change made here, and anyone who tried to get in. It cannot be edited.')}
      <div class="toolbar">${searchBox('log', 'Search person, target or reason')}</div>
      <div class="toolbar">${chips('log', [['all', 'All'], ['premium', 'Premium'], ['payments', 'Payments'], ['accounts', 'Accounts'], ['notices', 'Notices'], ['denied', 'Blocked attempts']], counts)}</div>
      <div class="card" style="padding:6px"><div id="list">${logTable(logFilter(all))}</div></div>`;
  };

  PAGES.settings = async force => {
    const s = await get('settings', {}, force);
    let ver = { live: DASH, min: DASH };
    try { const [a, b] = await Promise.all([fetch('../version.json', { cache: 'no-store' }).then(r => r.json()), fetch('../sw.js', { cache: 'no-store' }).then(r => r.text())]); ver = { min: a.min || DASH, live: (/const V = "bajeti-v([^"]+)"/.exec(b) || [])[1] || DASH }; } catch (_) {}
    const mt = canWrite() ? `<label class="check"><input id="m-on" type="checkbox"${s.maintenanceOn ? ' checked' : ''}><span>Show a maintenance notice in the app</span></label><div class="field"><label for="m-msg">Message people will see</label><input id="m-msg" maxlength="300" value="${esc(s.maintenanceMessage)}" placeholder="We are updating the app. Back at 14:00."></div><button class="btn primary" type="button" data-a="maint-save">Save</button>` : `<p>${s.maintenanceOn ? 'On: ' + esc(s.maintenanceMessage) : 'Off'}</p><p class="muted small">Only the owner can change this.</p>`;
    const admins = s.admins ? `<table><thead><tr><th>Role</th><th>Google accounts</th></tr></thead><tbody>${[['owner', 'Owner'], ['support', 'Support'], ['analyst', 'Read-only']].map(([k, l]) => `<tr><td>${l}</td><td>${s.admins[k].length ? s.admins[k].map(esc).join('<br>') : DASH}</td></tr>`).join('')}</tbody></table><p class="small muted" style="margin-top:8px">The list lives in Cloudflare (ADMIN_OWNERS, ADMIN_SUPPORT, ADMIN_ANALYSTS). Changing it needs no code change.</p>` : '<p class="muted">Only the owner can see the admin list.</p>';
    const matrix = [['Look at everything', 1, 1, 1], ['Re-check a payment with PayChangu', 1, 1, 0], ['Add a note to a payment', 1, 1, 0], ['Give, extend or remove Premium', 1, 0, 0], ['Disable or enable an account', 1, 0, 0], ['Publish notices, maintenance mode', 1, 0, 0]];
    return `${header('Settings', 'Maintenance, app version, who has access.')}
      <div class="grid two">
        <article class="card"><div class="card-head"><h3>Maintenance notice</h3>${badge(s.maintenanceOn ? 'warn' : 'ok', s.maintenanceOn ? 'On' : 'Off')}</div>${mt}${s.updatedAtMs ? `<p class="small muted" style="margin-top:8px">Last changed by ${esc(s.updatedBy || DASH)}, ${esc(ago(s.updatedAtMs))}</p>` : ''}</article>
        <article class="card"><div class="card-head"><h3>App version</h3></div><dl class="kv"><dt>Live version</dt><dd>${esc(ver.live)}</dd><dt>Lowest allowed</dt><dd>${esc(ver.min)}</dd></dl><p class="small muted" style="margin-top:8px">The lowest allowed version is set in version.json on GitHub. Phones older than it are told to update.</p></article>
      </div>
      <article class="card" style="margin-top:12px"><div class="card-head"><h3>Who can do what</h3></div><div class="table-wrap"><table><thead><tr><th></th><th>Owner</th><th>Support</th><th>Read-only</th></tr></thead><tbody>${matrix.map(r => `<tr><td>${esc(r[0])}</td>${r.slice(1).map(x => `<td>${x ? badge('ok', 'Yes') : badge('low', 'No')}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="small muted" style="margin-top:8px">You are signed in as ${esc(S.me.email)} (${esc(roleName(S.me.role))}). Changes that touch money, accounts or what users see also need a Google sign-in from the last 30 minutes.</p></article>
      <div class="grid two" style="margin-top:12px"><article class="card"><div class="card-head"><h3>Admin accounts</h3></div>${admins}</article>
        <article class="card"><div class="card-head"><h3>Firebase sign-in access</h3>${badge(s.auth.ok ? 'ok' : 'warn', s.auth.ok ? 'Connected' : 'Not connected')}</div>${s.auth.ok ? '<p>The sign-in list is readable, so signup dates, last-seen and account disabling work.</p>' : `<p>${esc(s.auth.note)}</p><ol class="small" style="padding-left:18px;margin:10px 0 0"><li>Open Google Cloud console, project bajeti-yanga, IAM.</li><li>Find the service account used by the Worker (the client_email in your key file).</li><li>Add the role "Firebase Authentication Admin" and save.</li><li>Come back here and press Refresh.</li></ol>`}</article></div>
      <div class="banner info" style="margin-top:12px"><b>Not included:</b> feature switches and error reports. Neither is recorded by the app today. Failed Google sign-ins are handled by Google and cannot be listed here, but anyone with a real Google account who tries this page without being on the list appears in the Activity log under "Blocked attempts".</div>`;
  };
  const roleName = r => ({ owner: 'Owner', support: 'Support', analyst: 'Read-only' }[r] || r);

  // ── drawer: household, payment, user ───────────────────────────────────────
  let lastFocus = null;
  function openDrawer(eyebrow, title, html) {
    lastFocus = document.activeElement;
    $('drawerEyebrow').textContent = eyebrow; $('drawerTitle').textContent = title; $('drawerBody').innerHTML = html;
    $('drawer').hidden = false; $('drawerScrim').hidden = false; $('drawerClose').focus(); $('drawerBody').scrollTop = 0;
    freshNote();
  }
  function closeDrawer() { $('drawer').hidden = true; $('drawerScrim').hidden = true; if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (_) {} } }
  const drawerLoading = () => { $('drawerBody').innerHTML = '<div class="skeleton"></div>'; };
  // If the sign-in is older than the Worker allows for changes, say so before the person fills in a form.
  async function freshNote() {
    const slot = $('drawerBody').querySelector('[data-fresh]'); if (!slot || !auth.currentUser) return;
    try { const t = await auth.currentUser.getIdTokenResult(); if (Date.now() / 1000 - Number(t.claims.auth_time || 0) > ((S.me && S.me.freshSeconds) || 1800) - 120) slot.innerHTML = '<div class="banner warn">Your sign-in is a bit old. Sign in again before making changes.<br><button class="btn sm" type="button" data-a="resign">Sign in again</button></div>'; } catch (_) {}
  }

  async function openHousehold(id, force) {
    openDrawer('Household', id, ''); drawerLoading();
    let h; try { h = await get('household', { id }, force); } catch (e) { $('drawerBody').innerHTML = errorBox(e); return; }
    const p = h.premium, pays = h.payments, expiryLine = p.unlimited ? 'No end date' : p.expiry ? fmtYmd(p.expiry) + (p.daysLeft !== null ? ' (' + p.daysLeft + ' days left)' : '') : DASH;
    const warns = [];
    if (p.legacyOnly) warns.push('Premium is stored only in the old config field. It works, but "Move to the new fields" tidies it up.');
    if (p.rootExpiry && p.configExpiry && p.rootExpiry !== p.configExpiry) warns.push('Two different end dates: new field ' + fmtYmd(p.rootExpiry) + ', old field ' + fmtYmd(p.configExpiry) + '. The later one is used.');
    if (p.lastPaymentRanTo && !p.unlimited && (p.state !== 'premium' || (p.expiry && p.expiry < p.lastPaymentRanTo)) && !(p.adminAt && p.adminAt >= Math.max(0, ...pays.filter(x => x.status === 'paid').map(x => x.paidAtMs || 0)))) warns.push('The last payment ran to ' + fmtYmd(p.lastPaymentRanTo) + ' but this household shows ' + (p.expiry ? fmtYmd(p.expiry) : 'no Premium') + '. Days may have been lost.');
    const modes = [['extend', 'Give or extend Premium'], ['set_expiry', 'Set an exact end date'], ['unlimited', 'Premium with no end date'], ['revoke', 'Remove Premium']];
    if (p.legacyOnly) modes.push(['tidy', 'Move to the new fields (same end date)']);
    const form = canWrite() && !h.deleted ? `<article class="card"><h3>Change Premium</h3><div data-fresh></div>
        <div class="field" style="margin-top:10px"><label for="pf-mode">What to do</label><select id="pf-mode" data-a="pf-mode">${modes.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
        <div class="field" id="pf-months-w"><label for="pf-months">For how long</label><select id="pf-months" data-a="pf-months">${[1, 2, 3, 4, 6, 12].map(m => `<option value="${m}">${m} month${m > 1 ? 's' : ''}</option>`).join('')}</select></div>
        <div class="field" id="pf-date-w" hidden><label for="pf-date">Ends on (the whole of that day)</label><input id="pf-date" type="date"></div>
        <div id="pf-pay-w"><label class="check"><input id="pf-rec" type="checkbox" data-a="pf-rec"><span>They paid me outside PayChangu (cash, mobile money, WhatsApp). Record it as a payment so revenue is right.</span></label>
          <div class="field" id="pf-amt-w" hidden><label for="pf-amt">Amount received (MK)</label><input id="pf-amt" type="number" min="0" step="100" inputmode="numeric" value="${PRICES[1]}"></div></div>
        <div class="field"><label for="pf-reason">Reason (goes in the activity log)</label><input id="pf-reason" maxlength="300" placeholder="e.g. Paid MK1,500 by WhatsApp on 8 Nov"></div>
        <button class="btn primary" type="button" data-a="pf-apply" data-id="${esc(h.id)}">Apply</button></article>` : `<div class="banner info">${h.deleted ? 'This household is deleted.' : 'Only the owner role can change Premium.'}</div>`;
    $('drawerTitle').textContent = h.id + (h.name ? ' · ' + h.name : '');
    $('drawerBody').innerHTML = `${warns.map(w => `<div class="banner warn">${esc(w)}</div>`).join('')}
      <article class="card"><div class="card-head"><h3>Premium</h3>${stateBadge(p)}</div><dl class="kv">
        <dt>Ends</dt><dd>${esc(expiryLine)}</dd>${p.trialStarted ? `<dt>Trial</dt><dd>${p.state === 'trial' ? p.trialDaysLeft + ' days left' : 'Started ' + esc(fmtDate(p.trialStarted))}</dd>` : ''}
        <dt>New fields</dt><dd>${p.rootActive ? 'On' : 'Off'}${p.rootExpiry ? ', ends ' + esc(fmtYmd(p.rootExpiry)) : ''}</dd><dt>Old fields</dt><dd>${p.configActive ? 'On' : 'Off'}${p.configExpiry ? ', ends ' + esc(fmtYmd(p.configExpiry)) : ''}</dd>
        ${p.lastPaymentRanTo ? `<dt>Last payment ran to</dt><dd>${esc(fmtYmd(p.lastPaymentRanTo))}</dd>` : ''}${p.adminBy ? `<dt>Last changed here</dt><dd>${esc(p.adminBy)}, ${esc(fmtDate(p.adminAt))}</dd>` : ''}
        <dt>Owner</dt><dd>${esc(h.ownerName || DASH)}</dd><dt>Created</dt><dd>${esc(fmtDate(h.created))}</dd></dl></article>
      <div style="margin-top:12px">${form}</div>
      <article class="card" style="margin-top:12px"><h3>Members (${h.members.length})</h3><div class="list" style="margin-top:6px">${h.members.map(m => `<div class="li"><div><div class="t">${esc(m.name)}</div><div class="s">Last seen ${esc(ago(m.lastSignIn))}</div></div><div>${m.owner ? badge('info', 'owner') : ''} ${m.disabled ? badge('disabled', 'Disabled') : ''}</div></div>`).join('')}</div></article>
      <article class="card" style="margin-top:12px"><h3>Payments</h3>${pays.length ? `<div class="list" style="margin-top:6px">${pays.map(x => `<div class="li" style="cursor:pointer" data-a="open-pay" data-id="${esc(x.id)}"><div><div class="t">${esc(money(x.amount))} · ${x.months ? x.months + ' mo' : DASH} ${badge(x.status)}</div><div class="s">${esc(fmtDateTime(x.paidAtMs || x.createdAtMs))}${x.source === 'manual' ? ' · recorded by hand' : ''}</div></div><div class="s">${x.premiumExpiry ? 'to ' + esc(fmtYmd(x.premiumExpiry)) : ''}</div></div>`).join('')}</div>` : '<p class="muted" style="margin-top:6px">No payments.</p>'}</article>
      <article class="card" style="margin-top:12px"><h3>History of changes here</h3>${h.history.length ? `<div class="list" style="margin-top:6px">${h.history.map(x => `<div class="li"><div><div class="t">${esc(actionLabel(x.action))}</div><div class="s">${esc(x.by)} · ${esc(fmtDateTime(x.atMs))}</div><div class="s">${logDetail(x)}</div></div></div>`).join('')}</div>` : '<p class="muted" style="margin-top:6px">No changes made from this console.</p>'}</article>`;
    freshNote(); syncPf();
  }
  function syncPf() {
    const m = $('pf-mode'); if (!m) return;
    const mode = m.value, months = Number($('pf-months').value);
    $('pf-months-w').hidden = mode !== 'extend'; $('pf-date-w').hidden = mode !== 'set_expiry';
    $('pf-pay-w').hidden = !(mode === 'extend' || mode === 'set_expiry');
    $('pf-amt-w').hidden = !$('pf-rec').checked;
    if (mode === 'extend' && !$('pf-amt').dataset.touched) $('pf-amt').value = PRICES[months] || 1500 * months;
  }
  async function applyPremium(id, btn) {
    const mode = $('pf-mode').value, reason = $('pf-reason').value.trim(), params = { householdId: id, mode, reason };
    if (reason.length < 3) { toast('Please give a reason (at least 3 letters).', true); $('pf-reason').focus(); return; }
    if (mode === 'extend') params.months = Number($('pf-months').value);
    if (mode === 'set_expiry') { params.expiry = $('pf-date').value; if (!params.expiry) { toast('Pick the end date.', true); return; } }
    if ((mode === 'extend' || mode === 'set_expiry') && $('pf-rec').checked) params.recordPayment = { amount: Number($('pf-amt').value) };
    const msg = { revoke: 'Remove Premium from this household now?', unlimited: 'Give this household Premium with no end date?', set_expiry: 'Set the end date to ' + params.expiry + '?', extend: 'Add ' + params.months + ' month(s) of Premium?', tidy: 'Move Premium to the new fields?' }[mode];
    if (!confirm(msg)) return;
    btn.disabled = true;
    const r = await act('premium_set', params);
    btn.disabled = false;
    if (!r) return;
    toast('Done. Now: ' + prem(r.after) + (r.paymentId ? '. Payment recorded.' : ''));
    forget(); openHousehold(id, true); if (['households', 'premium', 'attention', 'overview', 'payments'].includes(S.page)) render(true);
  }

  async function openPayment(id) {
    openDrawer('Payment', id, ''); drawerLoading();
    let r; try { r = (await get('payments', { limit: 1000 })).rows.find(x => x.id === id); } catch (e) { $('drawerBody').innerHTML = errorBox(e); return; }
    if (!r) { $('drawerBody').innerHTML = '<div class="banner warn">That payment is not in the 1,000 most recent. Open it from the household instead.</div>'; return; }
    const reopen = canWrite() && ['expired', 'failed'].includes(r.status);
    $('drawerBody').innerHTML = `${r.look ? `<div class="banner warn"><b>${esc(r.look)}</b></div>` : ''}
      <article class="card"><div class="card-head"><h3>${esc(money(r.amount))}</h3>${badge(r.status)}</div><dl class="kv">
        <dt>Reference</dt><dd class="mono">${esc(r.id)}</dd><dt>Customer</dt><dd>${esc(r.who || DASH)}</dd><dt>Household</dt><dd>${r.householdId ? `<a href="#" data-a="open-hh" data-id="${esc(r.householdId)}">${esc(r.householdId)}</a>` : DASH}</dd>
        <dt>Plan</dt><dd>${r.months ? r.months + ' month' + (r.months > 1 ? 's' : '') : DASH}${r.source === 'manual' ? ' (recorded by hand)' : ''}</dd><dt>Started</dt><dd>${esc(fmtDateTime(r.createdAtMs))}</dd><dt>Paid</dt><dd>${esc(fmtDateTime(r.paidAtMs))}</dd><dt>Premium ran to</dt><dd>${esc(fmtYmd(r.premiumExpiry))}</dd>
        ${r.note ? `<dt>Note</dt><dd>${esc(r.note)}</dd>` : ''}${r.adminNote ? `<dt>Admin note</dt><dd>${esc(r.adminNote)}${r.resolved ? ' ' + badge('ok', 'Reviewed') : ''}</dd>` : ''}</dl></article>
      ${canRecheck() && r.source !== 'manual' ? `<article class="card" style="margin-top:12px"><h3>Check with PayChangu</h3><p class="muted small" style="margin:4px 0 10px">Asks PayChangu whether this payment went through. Premium is only switched on if PayChangu confirms it and the amount is right.</p><div class="actions"><button class="btn primary" type="button" data-a="recheck" data-id="${esc(r.id)}">Re-check now</button>${reopen ? `<button class="btn ghost" type="button" data-a="reopen" data-id="${esc(r.id)}">Reopen and re-check</button>` : ''}</div>${reopen ? '<p class="small muted" style="margin-top:8px">Reopen is for a payment the app gave up on (after 3 days) but the customer did pay.</p>' : ''}</article>` : ''}
      ${canRecheck() ? `<article class="card" style="margin-top:12px"><h3>Note</h3><div class="field" style="margin-top:8px"><label for="pn-note">What was done about it</label><input id="pn-note" maxlength="300" value="${esc(r.adminNote || '')}" placeholder="e.g. Refunded MK500 by hand"></div><label class="check"><input id="pn-res" type="checkbox"${r.resolved ? ' checked' : ''}><span>Mark as reviewed (removes it from Needs attention)</span></label><button class="btn primary" type="button" data-a="pn-save" data-id="${esc(r.id)}">Save note</button></article>` : ''}`;
  }
  async function recheck(id, force) {
    if (force && !confirm('Reopen this closed payment and ask PayChangu again?')) return;
    const r = await act('recheck_payment', { txRef: id, force: force || undefined }); if (!r) return;
    toast(r.status === 'paid' ? 'PayChangu confirmed it. Premium is on until ' + (r.premiumExpiry || DASH) + '.' : 'PayChangu says it is still ' + r.status + '.');
    forget(); if (!$('drawer').hidden) openPayment(id); render(true);
  }

  async function openUser(uid) {
    openDrawer('Account', '', ''); drawerLoading();
    let r; try { r = (await get('users')).rows.find(x => x.uid === uid); } catch (e) { $('drawerBody').innerHTML = errorBox(e); return; }
    if (!r) { $('drawerBody').innerHTML = '<div class="banner warn">Account not found.</div>'; return; }
    $('drawerTitle').textContent = r.name;
    $('drawerBody').innerHTML = `<article class="card"><div class="card-head"><h3>Account</h3>${r.disabled ? badge('disabled', 'Disabled') : badge('ok', 'Active')}</div><dl class="kv"><dt>Sign-in</dt><dd>${esc((r.providers || []).map(provName).join(', ') || DASH)}</dd><dt>Signed up</dt><dd>${esc(fmtDate(r.created))}</dd><dt>Last seen</dt><dd>${esc(ago(r.lastSignIn))}</dd><dt>Premium until</dt><dd>${r.premiumUntil ? esc(fmtDate(r.premiumUntil)) : DASH}</dd><dt>ID</dt><dd class="mono">${esc(r.uid)}</dd>${r.pendingDeletion ? '<dt>Status</dt><dd>Asked to delete their account</dd>' : ''}</dl></article>
      <article class="card" style="margin-top:12px"><h3>Households (${r.householdCount})</h3>${r.households.length ? `<div class="list" style="margin-top:6px">${r.households.map(h => `<div class="li"><div class="t">${esc(h)}</div><button class="btn ghost sm" type="button" data-a="open-hh" data-id="${esc(h)}">Open</button></div>`).join('')}</div>` : '<p class="muted" style="margin-top:6px">Not in any household.</p>'}</article>
      ${canWrite() ? `<article class="card" style="margin-top:12px"><h3>${r.disabled ? 'Enable this account' : 'Disable this account'}</h3><div data-fresh></div><p class="muted small" style="margin:4px 0 10px">${r.disabled ? 'They will be able to sign in again.' : 'They will not be able to sign in. Anyone already signed in stays signed in for up to an hour. Their data is not touched.'}</p><div class="field"><label for="ud-reason">Reason (goes in the activity log)</label><input id="ud-reason" maxlength="300"></div><button class="btn ${r.disabled ? 'primary' : 'danger'}" type="button" data-a="ud-apply" data-id="${esc(r.uid)}" data-on="${r.disabled ? '1' : ''}">${r.disabled ? 'Enable account' : 'Disable account'}</button></article>` : ''}`;
    freshNote();
  }

  // ── events ─────────────────────────────────────────────────────────────────
  const redraw = key => {
    const l = $('list'); if (!l) return;
    const d = key === 'hh' ? S.data['households{}'] : key === 'us' ? S.data['users{}'] : key === 'pay' ? S.data['payments{"limit":1000}'] : key === 'chip' ? S.data['chipereganyu{}'] : S.data['log{"limit":300}'];
    if (!d) return;
    if (key === 'hh') l.innerHTML = hhTable(hhFilter(d.rows)); else if (key === 'us') l.innerHTML = usersTable(userFilter(d.rows));
    else if (key === 'pay') { const rows = payFilter(d.rows); l.innerHTML = payTable(rows); const ps = $('paySum'); if (ps) ps.textContent = paySum(rows); }
    else if (key === 'chip') l.innerHTML = chipTable(chipFilter(d.rows)); else l.innerHTML = logTable(logFilter(d.rows));
  };
  const CLICK = {
    go: el => go(el.dataset.id), reload: () => { forget(); render(true); }, resign: async () => { if (await reauth()) { toast('Signed in again.'); const n = document.querySelector('#drawerBody [data-fresh]'); if (n) n.innerHTML = ''; } },
    chip: el => { const k = el.dataset.key; S.f[k] = { ...(S.f[k] || {}), chip: el.dataset.id }; el.closest('.chips').querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); redraw(k); },
    'open-hh': el => openHousehold(el.dataset.id), 'open-pay': el => openPayment(el.dataset.id), 'open-user': el => openUser(el.dataset.id),
    recheck: el => recheck(el.dataset.id, false), reopen: el => recheck(el.dataset.id, true),
    'pf-apply': el => applyPremium(el.dataset.id, el),
    'pn-save': async el => { const r = await act('payment_note', { txRef: el.dataset.id, note: $('pn-note').value, resolved: $('pn-res').checked }); if (r) { toast('Saved.'); forget(); openPayment(el.dataset.id); } },
    'ud-apply': async el => { const reason = $('ud-reason').value.trim(); if (reason.length < 3) { toast('Please give a reason.', true); return; } if (!el.dataset.on && !confirm('Disable this account?')) return; const r = await act('user_disable', { uid: el.dataset.id, disabled: !el.dataset.on, reason }); if (r) { toast(r.disabled ? 'Account disabled.' : 'Account enabled.'); forget(); openUser(el.dataset.id); if (S.page === 'users') render(true); } },
    'maint-save': async () => { const r = await act('settings_save', { maintenanceOn: $('m-on').checked, maintenanceMessage: $('m-msg').value }); if (r) { toast('Saved.'); forget(); render(true); } },
    'notice-save': async () => {
      const ms = id => { const v = $(id).value; return v ? new Date(v).getTime() : null; };
      const r = await act('announcement_save', { id: S.editNotice || undefined, title: $('n-title').value, body: $('n-body').value, audience: $('n-aud').value, lang: $('n-lang').value, kind: $('n-kind').value, startsAtMs: ms('n-from'), endsAtMs: ms('n-to'), active: $('n-active').checked });
      if (r) { toast('Published.'); S.editNotice = null; forget(); render(true); }
    },
    'notice-edit': el => { S.editNotice = el.dataset.id; render(); window.scrollTo(0, 0); }, 'notice-cancel': () => { S.editNotice = null; render(); },
    'notice-toggle': async el => { const n = S.data['announcements{}'].rows.find(x => x.id === el.dataset.id); const r = await act('announcement_save', { ...n, active: n.active === false }); if (r) { forget(); render(true); } },
    'notice-delete': async el => { if (!confirm('Delete this notice for good?')) return; const r = await act('announcement_delete', { id: el.dataset.id }); if (r) { toast('Deleted.'); forget(); render(true); } },
    'csv-hh': () => csvDownload('households-' + stamp() + '.csv', [['Code', 'Name', 'Owner', 'Members', 'Plan', 'Ends', 'Payments', 'Created']].concat(hhFilter(S.data['households{}'].rows).map(r => [r.id, r.name, r.ownerName, r.members, STATE[r.state], r.unlimited ? 'no end date' : r.expiry, r.paid, r.created ? new Date(r.created).toISOString().slice(0, 10) : '']))),
    'csv-users': () => csvDownload('users-' + stamp() + '.csv', [['Account', 'Signed up', 'Last seen', 'Households', 'Disabled']].concat(userFilter(S.data['users{}'].rows).map(r => [r.name, r.created ? new Date(r.created).toISOString().slice(0, 10) : '', r.lastSignIn ? new Date(r.lastSignIn).toISOString().slice(0, 10) : '', r.householdCount, r.disabled ? 'yes' : '']))),
    'csv-pay': () => csvDownload('payments-' + stamp() + '.csv', [['Reference', 'Date', 'Customer', 'Household', 'Months', 'Amount (MK)', 'Status', 'Source', 'Premium ran to']].concat(payFilter(S.data['payments{"limit":1000}'].rows).map(r => [r.id, new Date(r.paidAtMs || r.createdAtMs || 0).toISOString().slice(0, 10), r.who, r.householdId, r.months, r.amount, r.status, r.source, r.premiumExpiry]))),
  };
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]'); if (!el || !CLICK[el.dataset.a]) return;
    if (el.tagName === 'A') e.preventDefault();
    CLICK[el.dataset.a](el, e);
  });
  let searchTimer;
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.a === 'search') { const k = el.dataset.key; S.f[k] = { ...(S.f[k] || {}), q: el.value }; clearTimeout(searchTimer); searchTimer = setTimeout(() => redraw(k), 120); }
    else if (el.dataset.a === 'finder') { clearTimeout(searchTimer); searchTimer = setTimeout(() => finder(el.value), 150); }
    else if (el.dataset.a === 'pf-amt' || el.id === 'pf-amt') { el.dataset.touched = '1'; }
  });
  document.addEventListener('change', e => { if (['pf-mode', 'pf-months', 'pf-rec'].includes(e.target.dataset.a)) syncPf(); });
  async function finder(q) {
    q = q.trim().toLowerCase(); const out = $('finderOut'); if (!out) return;
    if (q.length < 2) { out.innerHTML = ''; return; }
    const d = await get('households'), hits = d.rows.filter(r => [r.id, r.name, r.ownerName].some(x => x && String(x).toLowerCase().includes(q))).slice(0, 8);
    out.innerHTML = hits.length ? `<div class="list">${hits.map(r => `<div class="li"><div><div class="t">${esc(r.id)}${r.name ? ' · ' + esc(r.name) : ''}</div><div class="s">${esc(r.ownerName || 'no owner')}</div></div><div style="display:flex;gap:8px;align-items:center">${stateBadge(r)}<button class="btn ghost sm" type="button" data-a="open-hh" data-id="${esc(r.id)}">Open</button></div></div>`).join('')}</div>` : '<p class="muted">No household found. Phone numbers only match if the person signed up with that number.</p>';
  }

  // tooltips for charts (hover on a computer, tap on a phone)
  let tipTimer;
  const tip = $('tip');
  function showTip(el, e) { tip.textContent = el.dataset.tip; tip.hidden = false; placeTip(e); }
  function placeTip(e) { const w = tip.offsetWidth, h = tip.offsetHeight; let x = Math.min(e.clientX + 12, innerWidth - w - 8), y = e.clientY - h - 12; if (y < 8) y = e.clientY + 16; tip.style.left = Math.max(8, x) + 'px'; tip.style.top = y + 'px'; }
  document.addEventListener('pointerover', e => { const t = e.target.closest('[data-tip]'); if (t) showTip(t, e); else tip.hidden = true; });
  document.addEventListener('pointermove', e => { if (!tip.hidden) placeTip(e); });
  document.addEventListener('pointerdown', e => { const t = e.target.closest('[data-tip]'); if (t) { showTip(t, e); clearTimeout(tipTimer); tipTimer = setTimeout(() => { tip.hidden = true; }, 2500); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('drawer').hidden) closeDrawer(); closeMenu(); } });
  const after = () => { $('view').focus({ preventScroll: true }); };

  function openMenu() { $('sidebar').classList.add('open'); $('scrim').hidden = false; }
  function closeMenu() { $('sidebar').classList.remove('open'); $('scrim').hidden = true; }

  // ── start ──────────────────────────────────────────────────────────────────
  function showLogin(msg) { $('appView').hidden = true; $('loginView').hidden = false; $('loginError').textContent = msg || ''; }
  async function start() {
    if (!window.firebase) { showLogin('Firebase could not load. Check your internet connection and reload.'); return; }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE);
    auth = firebase.auth(); auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
    $('googleLogin').addEventListener('click', signIn);
    $('signOut').addEventListener('click', () => auth.signOut());
    $('menuBtn').addEventListener('click', openMenu); $('scrim').addEventListener('click', closeMenu);
    $('drawerClose').addEventListener('click', closeDrawer); $('drawerScrim').addEventListener('click', closeDrawer);
    window.addEventListener('hashchange', () => { if (!$('drawer').hidden) closeDrawer(); render(); });
    auth.onAuthStateChanged(user => { if (!user) { S.me = null; showLogin(); return; } enter(user); });
  }
  // Ask the Worker who this is. Only a clear "no" signs the person out; a slow or failed connection keeps them signed in.
  async function enter(user) {
    $('loginError').textContent = ''; $('googleLogin').disabled = true;
    try { S.me = await api('whoami'); }
    catch (e) {
      $('googleLogin').disabled = false;
      if (e.status === 403 || e.status === 503) { await auth.signOut(); showLogin(e.status === 503 ? 'The admin console is not switched on yet. Add the admin email in Cloudflare (see docs/ADMIN-SETUP.md).' : 'This Google account (' + (user.email || '') + ') is not on the admin list.'); return; }
      showLogin((e.status === 0 ? 'Cannot reach the server.' : e.message) + ' You are still signed in. Tap the button to try again.'); return;
    }
    $('googleLogin').disabled = false;
    $('loginView').hidden = true; $('appView').hidden = false;
    $('whoEmail').textContent = S.me.email; $('whoRole').textContent = roleName(S.me.role); $('roleChip').textContent = roleName(S.me.role);
    render();
  }
  start();
})();
