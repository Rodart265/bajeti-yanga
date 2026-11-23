// Guards guest mode (js/12a-guest.js). The demo runs the REAL app screens on made-up data kept in memory, so these tests make
// sure that data can never reach Firebase, the Worker or a real account. Run: node tests/guest.test.js
const fs = require('fs'), path = require('path'), assert = require('assert'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const guest = read('js/12a-guest.js'), html = read('index.html'), hh = read('js/05-household.js'), sw = read('sw.js');
const jsFiles = fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js') && f !== '12a-guest.js');
// Tests are collected first and run one at a time at the bottom of the file. Each is AWAITED before its result is recorded, so an
// async test that fails later cannot be reported as passing, and any failure (sync, async or an unhandled rejection) sets a non-zero exit code.
let passed = 0, failed = 0;
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }
function markFailed(label, e) { failed++; process.exitCode = 1; console.log('FAIL ' + label + ' :: ' + (e && e.message ? e.message : e)); }
process.on('unhandledRejection', (e) => markFailed('(unhandled promise rejection)', e));
process.on('uncaughtException', (e) => markFailed('(uncaught exception)', e));

// Code only: drop comments so the notes at the top of the file do not trip the checks.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"])\/\/[^\n]*$/gm, '$1');
const code = strip(guest);
// Body of a top-level function, from its "function name(" line to the next top-level "function".
function body(src, name) {
  const m = new RegExp('^(?:async )?function ' + name + '\\b[^\\n]*', 'm').exec(src);
  assert(m, 'function ' + name + ' not found');
  const rest = src.slice(m.index + 1), next = rest.search(/\n(?:async )?function \w+/);
  return src.slice(m.index, next < 0 ? src.length : m.index + 1 + next);
}

// ── Isolation ───────────────────────────────────────────────────────────────
test('guest code never touches Firebase, Firestore, the Worker or the real app startup', () => {
  const banned = [/\bdb\b/, /\bfirebase\b/, /\bauth\./, /\.collection\(/, /\bfetch\(/, /fetchT\(/, /XMLHttpRequest/, /\bAI_URL\b/,
    /\baddPx\b/, /\bconnectHH\s*\(/, /\bjoinHH\s*\(/, /\bbootApp\s*\(/, /\bcurUser\b/, /\bhhId\b/, /sessionStorage/, /indexedDB/, /sendBeacon/, /\bsetupFCMToken\b/];
  const hit = banned.filter((r) => r.test(code)).map(String);
  assert.deepStrictEqual(hit, [], 'js/12a-guest.js uses: ' + hit.join(', '));
});
test('the only things guest mode stores on the phone by name are nb_seen_auth and the language', () => {
  const keys = [...code.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*([^,)]+)/g)].map((m) => m[1].trim());
  const bad = keys.filter((k) => !['GUEST_SEEN_KEY', "'nb_household'", "'nb_lang'"].includes(k));
  assert.deepStrictEqual(bad, [], 'unexpected storage keys: ' + bad.join(', '));
  assert(/const GUEST_SEEN_KEY = 'nb_seen_auth'/.test(code));
  assert(!/localStorage\.setItem\(\s*'nb_(?!lang)/.test(code));
});
test('switching person in the demo does not write nb_uid to the phone', () => {
  assert(/function setU\(id\)\s*\{\s*if\(isGuestMode\)/.test(read('js/07-render.js')), 'setU must check isGuestMode before writing nb_uid');
  assert(/function swU\(id\)\s*\{\s*if\(isGuestMode\)/.test(read('js/09-settings.js')), 'swU must check isGuestMode before writing nb_uid');
  assert(/function actU\(\)\s*\{\s*const id=isGuestMode\?_guestUid:/.test(read('js/02-helpers.js')));
});

const blockedSrc = /const GUEST_BLOCKED = \{([\s\S]*?)\n\};/.exec(guest)[1];
const blocked = [...blockedSrc.matchAll(/'(\w+)'/g)].map((m) => m[1]);

// ── Entries: the one door to the household's purchases ──────────────────────
test('_pxCol() hands out the in-memory stand-in in guest mode, before it can touch db', () => {
  const b = body(hh, '_pxCol');
  assert(b.indexOf('isGuestMode') > -1 && b.indexOf('guestPxCol()') > -1 && b.indexOf('isGuestMode') < b.indexOf('db.collection'));
});
test('the household purchases collection is only opened by _pxCol and the two live listeners', () => {
  const where = [];
  jsFiles.forEach((f) => { let cur = null; read('js/' + f).split('\n').forEach((l) => {
    const m = /^(?:async )?function (\w+)/.exec(l); if (m) cur = m[1];
    if (/collection\('purchases'\)/.test(l)) where.push(f + ':' + cur); }); });
  const allowed = ['05-household.js:_pxCol', '05-household.js:connectHH', '05-household.js:_pxStartWindow'];
  const extra = where.filter((w) => !allowed.includes(w) && !blocked.includes(w.split(':')[1]));   // blocked functions (markBillPaid) cannot run in the demo
  assert.deepStrictEqual(extra, [], 'a new direct purchases path needs a guest check: ' + extra.join(', '));
});
test('addPx, updPx and delPx let guest mode through, and saveCfg skips Firestore without a household', () => {
  assert(/isGuestMode/.test(body(hh, 'addPx')) && /isGuestMode/.test(body(hh, 'updPx')) && /isGuestMode/.test(body(hh, 'delPx')));
  const s = body(hh, 'saveCfg');
  assert(s.indexOf('if(!hhId) return Promise.resolve();') > -1 && s.indexOf('if(!hhId) return') < s.indexOf('db.collection'));
});

// ── Everything that can reach Firebase or the network is either blocked in the demo or reviewed ─
test('every function listed as blocked in the demo really exists', () => {
  const all = jsFiles.map((f) => read('js/' + f)).join('\n');
  const missing = blocked.filter((n) => !new RegExp('^(?:async )?function ' + n + '\\b', 'm').test(all));
  assert.deepStrictEqual(missing, [], 'GUEST_BLOCKED names that no longer exist: ' + missing.join(', '));
  assert(blocked.length >= 30);
});
// Functions that reach Firebase or the network but are NOT blocked, with why that is fine. A new one fails this test on purpose:
// decide whether a guest can reach it, then block it in GUEST_BLOCKED or add it here.
const REVIEWED = [
  // sign-in, sign-up, PIN and account flows: they must keep working while the demo is paused on the sign-in screen
  '_confirmDeleteAccount', '_reauthWithoutPassword', '_secPwVerifySubmit', 'pinFgtVerify', '_sendAuthEmail', 'backToLogin', 'checkVerification',
  'doEmailAuth', 'doGoogle', 'resendVerification', 'bootApp', 'restoreAccount', 'showAccountRestorePrompt', 'startFreshAfterDeletion',
  // household deletion: only reachable from household settings, which the demo cannot open (openDeleteHousehold is blocked)
  '_confirmDeleteHousehold',
  // household-only writes that already do nothing without a household id, which the demo never has
  'mirrorRecs',
  // the entry door itself: guest mode swaps in the in-memory stand-in (tested above)
  '_pxCol', 'addPx', 'saveCfg',
  // Chipereganyu actions: the circle screens cannot be opened in the demo (openChipView / openChipEntry / openChipCreate / openChipJoin are blocked)
  'chipCloseCircle', 'chipConfirmPayout', 'chipDeleteGroup', 'chipLeaveGroup', 'chipMakeAdmin', 'chipMoveUp', 'chipRemoveMember',
  'chipStartNewLap', 'joinChipGroup', 'saveChipCreate', 'startChipRotation',
  // Settings member list: its live listener only starts for a signed-in owner (needs curUser)
  'stgOpenSection',
  // the app's own same-site update check (version.json), which runs for everyone
  'openFAQ', 'fetchT',
  // Premium internals: only reached from the Premium screens (blocked); the sign-in token check below stops any request
  '_paymentsCall', '_authHeaders', 'setupFCMToken'
];
test('every function that can reach Firebase or the network is blocked in the demo or has been reviewed', () => {
  const found = new Set();
  jsFiles.forEach((f) => { let cur = null; read('js/' + f).split('\n').forEach((l) => {
    const m = /^(?:async )?function (\w+)/.exec(l); if (m) cur = m[1];
    if (cur && /\bdb\.(collection|batch|runTransaction)|\bfetch\(|fetchT\(|\bauth\.|firebase\.messaging\(\)|signOut|\.getIdToken/.test(strip(l))) found.add(cur); }); });
  const unknown = [...found].filter((n) => !blocked.includes(n) && !REVIEWED.includes(n));
  assert.deepStrictEqual(unknown, [], 'new function(s) can reach Firebase or the network: ' + unknown.join(', ') + '. Block them in GUEST_BLOCKED (js/12a-guest.js) or add them to REVIEWED in this test.');
});
test('AI and payment calls refuse to run without a real sign-in, so the demo cannot send them', () => {
  const b = body(read('js/13-actions-boot.js'), '_authHeaders');
  assert(/if\(!\(auth && auth\.currentUser\)\) throw/.test(b));
});

// ── Wiring ──────────────────────────────────────────────────────────────────
test('the guest entry screen exists, the old separate demo screen is gone, and the splash script knows the entry screen', () => {
  assert(html.includes('id="scr-guest-entry"'));
  assert(!html.includes('id="scr-guest"') && !html.includes('gs-nav') && !html.includes('gs-body'), 'the old demo screen must be gone');
  const ids = /var ids = \[([^\]]*)\]/.exec(html);
  assert(ids && ids[1].includes("'scr-guest-entry'") && !ids[1].includes("'scr-guest'"));
});
test('the demo strip is inside the real #app and the account sheet is at page level', () => {
  const app = html.indexOf('<div id="app"'), view = html.indexOf('<div id="view">'), strip = html.indexOf('id="guest-strip"');
  assert(app > -1 && strip > app && strip < view, 'guest-strip must sit between the top bar and the screen inside #app');
  assert(html.includes('id="gs-sheet"') && html.indexOf('id="gs-sheet"') > html.indexOf('id="toast"'));
});
test('the guest script is in APP_SHELL and loads before the boot script', () => {
  assert(sw.includes('"./js/12a-guest.js"'));
  assert(html.indexOf('./js/12a-guest.js') > html.indexOf('./js/12-chat.js') && html.indexOf('./js/12a-guest.js') < html.indexOf('./js/13-actions-boot.js'));
});
test('bootApp asks guestRoute() before showing sign-in, and tells guest mode when someone signs in', () => {
  const sign = hh.indexOf("if(typeof guestNoteSignedIn==='function') guestNoteSignedIn();");
  const user = hh.indexOf('curUser=user;');
  assert(sign > user && sign - user < 200, 'guestNoteSignedIn must be the first thing the signed-in branch does');
  const route = hh.indexOf('guestRoute()) return;'), authShow = hh.indexOf("hide('scr-pin');\n      // First-time visitors");
  assert(route > -1 && authShow > -1 && hh.indexOf("show('scr-auth');", route) > route, 'sign-in must stay as the fallback after guestRoute()');
});
test('the other places that show sign-in directly are untouched (sign-out, deletion, back-to-login)', () => {
  assert(!/guestRoute/.test(read('js/03-pin.js')) && !/guestRoute/.test(read('js/04-auth.js')) && !/guestRoute/.test(read('js/11-premium.js')));
});
test('every icon the account sheets name exists in the icon file', () => {
  const have = new Set([...read('vendor/icons.min.js').matchAll(/"([a-z0-9-]+)":\[\[/g)].map((m) => m[1]));
  const names = [...code.matchAll(/icon:'([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert(names.length >= 7);
  const miss = names.filter((n) => !have.has(n));
  assert.deepStrictEqual(miss, [], 'missing icons: ' + miss.join(', '));
});

// ── Behaviour, run against stand-ins for the page ───────────────────────────
const defItems = [...read('js/01-constants.js').matchAll(/\{name:'([^']+)'(?:,budget:\d+)?\}/g)].map((m) => m[1]);
const itemSrc = /const DEF_ITEMS = \[([\s\S]*?)\];/.exec(read('js/01-constants.js'))[1];
const DEF_ITEM_NAMES = [...itemSrc.matchAll(/name:'([^']+)'/g)].map((m) => m[1]);
function world(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.ls || {});
  const els = {};
  const el = (id, hidden) => (els[id] = els[id] || { id, innerHTML: '', textContent: '', value: '', querySelector: () => null, classList: {
    _h: !!hidden, contains(c) { return c === 'hide' && this._h; }, add(c) { if (c === 'hide') this._h = true; }, remove(c) { if (c === 'hide') this._h = false; } } });
  ['scr-guest-entry', 'scr-auth', 'app', 'guest-strip', 'gs-sheet', 'gs-tour'].forEach((id) => el(id, true));
  ['gs-tour-card', 'gs-tour-spot', 'view'].forEach((id) => { el(id, false); els[id].style = {}; });
  el('a-guest-back', true);
  const calls = [], timers = [];
  const ctx = {
    g: (id) => els[id] || null, hide: (id) => els[id] && els[id].classList.add('hide'), show: (id) => els[id] && els[id].classList.remove('hide'),
    L: (en) => en, esc: (s) => String(s).replace(/[&<>"']/g, '_'), _ic: (n) => '<i data-lucide="' + n + '"></i>',
    aTab: (m) => calls.push('aTab:' + m), applyStaticLang() {}, applyLang() {}, go: (t) => { vm.runInContext('tab=' + JSON.stringify(t), ctx); calls.push('go:' + t); }, renderLive() {},
    ensureRecIds: (cfg) => { ['items', 'goals', 'bills'].forEach((k) => (cfg[k] || []).forEach((r, i) => { r.id = r.id || k[0] + i; })); },
    localISO: (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
    DEF_CFG: { items: DEF_ITEM_NAMES.map((n) => ({ name: n, budget: 10000 })), users: [{ id: 'u1', name: 'Person 1' }], overallBudget: 400000, goals: [], salaryDay: 0 },
    _pendingJoinCode: opts.join || null, window: null, console,
    document: { querySelectorAll: () => [], querySelector: () => null, addEventListener() {} }, addEventListener() {}, innerHeight: 800, setTimeout: (f) => { timers.push(f); return 0; },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
  };
  if (opts.brokenStorage) ctx.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  vm.createContext(ctx);
  if (opts.now) vm.runInContext('(function(){ const R = Date, F = ' + opts.now.getTime() + '; class FD extends R { constructor(...a){ if(a.length===0) super(F); else super(...a); } static now(){ return F; } } this.Date = FD; }).call(this);', ctx);
  // The app's own state and a few real-app stand-ins (same names as js/01-constants.js and js/05-household.js).
  vm.runInContext(`this.window = this; let lang='en', isGuestMode=false, _guestUid=null, lCfg={}, lPx=[], lHHDoc={}, _pxMain=[], _pxOlder=[], _pxTrash=[], chipGroups=[],
    _pxFirst=false, _chipFirst=false, viewMonth=null, tab='home', _stgSection=null, selItem=null, selItemKey=null, fUser='all', logSrch='';
    function _setPx(){ lPx=[..._pxMain]; } function _invalidateMemo(){}
    function logout(){ __real.push('logout'); } function showPremiumPage(){ __real.push('premium'); } function sendChat(){ __real.push('chat'); }
    function connectHH(){ __real.push('connectHH'); } function joinHH(){ __real.push('joinHH'); }`, ctx);
  ctx.__real = [];
  vm.runInContext(guest + '\n;this.__x={guestRoute,guestNoteSignedIn,guestIsReturning,guestOpenDemo,guestGoAuth,guestBackFromAuth,guestGate,guestPxCol,guestPxFull,' +
    'guestBuildPx,guestBuildCfg,guestTourOffer,guestTourStart,guestTourShow,guestTourEnd,guestTourOn,GUEST_TOUR,GUEST_GATES,get:()=>({isGuestMode,lCfg,lPx,_pxMain,tab,lHHDoc,_pxFirst,_chipFirst,_guestUid}),setPx:(a)=>{_pxMain.length=0;a.forEach(x=>_pxMain.push(x));}};', ctx);
  return { x: ctx.__x, els, store, calls, ctx, timers, real: () => ctx.__real, vis: (id) => !els[id].classList.contains('hide') };
}
const FRESH = { ls: {} };
test('a first-time visitor is shown the guest entry screen', () => {
  const w = world(FRESH); assert.strictEqual(w.x.guestRoute(), true); assert(w.vis('scr-guest-entry'));
});
test('someone who has signed in before goes straight to sign-in', () => {
  const w = world({ ls: { nb_seen_auth: '1' } }); assert.strictEqual(w.x.guestRoute(), false); assert(!w.vis('scr-guest-entry'));
});
test('a phone with a household on it goes straight to sign-in', () => {
  const w = world({ ls: { nb_household: 'ABC123' } }); assert.strictEqual(w.x.guestRoute(), false);
});
test('an invite link goes straight to sign-in', () => {
  const w = world({ join: 'ABC123' }); assert.strictEqual(w.x.guestRoute(), false);
});
test('if storage cannot be read, the person gets sign-in, not a guess', () => {
  const w = world({ brokenStorage: true }); assert.strictEqual(w.x.guestRoute(), false);
});
test('the demo opens the real app on Home with sample data in the app\'s own lists', () => {
  const w = world(FRESH); w.x.guestOpenDemo(); const s = w.x.get();
  assert(s.isGuestMode && w.vis('app') && w.vis('guest-strip') && !w.vis('scr-guest-entry'));
  assert.deepStrictEqual(w.calls.filter((c) => c.startsWith('go:')), ['go:home']);
  assert(s.lPx.length > 40 && s._pxFirst && s._chipFirst && s.lHHDoc && !s.lHHDoc.isPremium);
  assert(s.lCfg.users.length === 2 && s.lCfg.goals.length === 2 && s.lCfg.items.length > 10);
});
test('guestRoute leaves a screen that is already up alone', () => {
  const w = world(FRESH); w.x.guestOpenDemo(); assert.strictEqual(w.x.guestRoute(), true); assert(w.vis('app') && !w.vis('scr-guest-entry'));
});
test('sample entries use real item names, never fall in the future, and this month has spending and income', () => {
  const w = world(FRESH), px = w.x.guestBuildPx(), todayStr = w.ctx.localISO(new Date()), ym = todayStr.slice(0, 7);
  const bad = Array.from(px.filter((p) => !DEF_ITEM_NAMES.includes(p.item) && p.item !== 'Salary/Income').map((p) => p.item));
  assert.strictEqual(bad.length, 0, 'unknown items: ' + bad.join(', '));
  assert(px.every((p) => p.date <= todayStr), 'an entry is dated in the future');
  const mine = px.filter((p) => p.date.startsWith(ym));
  assert(mine.some((p) => p.type === 'income') && mine.filter((p) => p.type === 'expense').length >= 8);
  assert(new Set(px.map((p) => p.date.slice(0, 7))).size >= 6, 'needs six months for the trend chart');
  assert(new Set(px.map((p) => p.id)).size === px.length, 'duplicate ids');
  assert(px.every((p) => p.amount > 0 && p.timestamp > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.date)));
});
test('the stand-in collection adds, edits and deletes entries in memory only', async () => {
  const w = world(FRESH); w.x.guestOpenDemo(); const col = w.x.guestPxCol(), n = w.x.get()._pxMain.length;
  const r = await col.add({ item: 'Sugar', amount: 500, createdAt: { _methodName: 'FieldValue.serverTimestamp' } });
  assert(r.id && w.x.get()._pxMain.length === n + 1);
  const e = w.x.get()._pxMain.find((p) => p.id === r.id); assert(typeof e.createdAt.toMillis() === 'number');
  await col.doc(r.id).update({ amount: 900, note: { _methodName: 'FieldValue.delete' } }); assert.strictEqual(e.amount, 900);
  await col.doc(r.id).update({ deleted: true, deletedAt: 'x' }); assert.strictEqual(e.deleted, true);
  await col.doc(r.id).delete(); assert.strictEqual(w.x.get()._pxMain.length, n);
  await assert.rejects(() => col.doc('nope').update({ a: 1 }), (er) => er.code === 'not-found');
});
test('the demo is capped, so it cannot grow without limit', async () => {
  const w = world(FRESH); w.x.guestOpenDemo(); const col = w.x.guestPxCol();
  for (let i = 0; i < 40; i++) { assert.strictEqual(w.x.guestPxFull(), false); await col.add({ item: 'Sugar', amount: 1 }); }
  assert.strictEqual(w.x.guestPxFull(), true);
});
test('account-only functions open the account sheet in the demo and run normally otherwise', () => {
  const w = world(FRESH);
  w.ctx.logout(); w.ctx.showPremiumPage(); w.ctx.sendChat();                 // not a guest: the real functions run
  assert.deepStrictEqual(w.real(), ['logout', 'premium', 'chat']); assert(!w.vis('gs-sheet'));
  w.x.guestOpenDemo(); w.ctx.logout(); assert(w.vis('gs-sheet') && /Create your account/.test(w.els['gs-sheet'].innerHTML));
  w.x.guestGate('premium'); w.ctx.showPremiumPage(); w.ctx.sendChat(); assert.deepStrictEqual(w.real(), ['logout', 'premium', 'chat'], 'a real function ran in guest mode');
});
test('Create account and Sign in use the existing sign-in screen, and Back returns to the demo', () => {
  const w = world(FRESH); w.x.guestOpenDemo(); w.x.guestGoAuth('register');
  assert(w.vis('scr-auth') && !w.vis('app') && w.vis('a-guest-back')); assert(w.calls.includes('aTab:register'));
  w.x.guestBackFromAuth(); assert(w.vis('app') && !w.vis('scr-auth') && w.x.get().isGuestMode);
});
test('signing in remembers the phone, closes the demo and throws the demo data away', () => {
  const w = world(FRESH); w.x.guestOpenDemo(); assert(w.x.get().lPx.length > 0);
  w.x.guestNoteSignedIn(); const s = w.x.get();
  assert.strictEqual(w.store.nb_seen_auth, '1'); assert(!s.isGuestMode && !w.vis('guest-strip') && !w.vis('scr-guest-entry'));
  assert.strictEqual(s.lPx.length, 0); assert.strictEqual(s._pxMain.length, 0); assert.strictEqual(s.lCfg.users.length, 1); assert(!s._pxFirst && !s._chipFirst);
});
test('for an ordinary sign-in (not a guest) guestNoteSignedIn leaves the real data alone', () => {
  const w = world(FRESH); w.ctx.lPx = [{ id: 'real1' }]; vm.runInContext("lPx=[{id:'real1'}]; _pxMain.push({id:'real1'});", w.ctx);
  w.x.guestNoteSignedIn(); assert.strictEqual(w.x.get()._pxMain.length, 1); assert.strictEqual(w.store.nb_seen_auth, '1');
});

test('sample entries land in their real months on any day of the year (month ends, year ends, leap day)', () => {
  // Expectations are written out here from the sample spec, independent of the code under test.
  const pastBase = [78000, 30000, 12000, 15000, 16000, 10000, 8000, 30000, 17000, 10000], scale = [0.94, 1.06, 0.91, 1.12, 0.97];
  const pastSpent = (k) => pastBase.filter((_, i) => !(i === 7 && k % 2 === 1)).reduce((s, b) => s + Math.round(b * scale[k] / 500) * 500, 0);
  const days = [[2026,11,1],[2026,11,2],[2026,11,23],[2026,11,30],[2026,12,31],[2027,1,1],[2027,1,31],[2027,3,1],[2027,3,31],[2028,2,29],[2026,5,31]];
  days.forEach(([y, m, d]) => {
    const now = new Date(y, m - 1, d, 12, 0, 0), w = world({ ls: {}, now }), px = Array.from(w.x.guestBuildPx()), tag = y + '-' + m + '-' + d;
    const ym = (back) => { const x = new Date(y, m - 1 - back, 1); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };
    const sum = (month, type) => px.filter((p) => p.date.startsWith(month) && p.type === type).reduce((s, p) => s + p.amount, 0);
    assert.strictEqual(sum(ym(0), 'expense'), 207000, tag + ': this month spending');
    assert.strictEqual(sum(ym(0), 'income'), 250000, tag + ': this month income');
    for (let k = 0; k < 5; k++) {
      assert.strictEqual(sum(ym(k + 1), 'expense'), pastSpent(k), tag + ': spending ' + (k + 1) + ' month(s) back');
      assert.strictEqual(sum(ym(k + 1), 'income'), 250000, tag + ': income ' + (k + 1) + ' month(s) back');
    }
    const months = new Set([0, 1, 2, 3, 4, 5].map(ym));
    assert(px.every((p) => months.has(p.date.slice(0, 7))), tag + ': an entry falls outside the six months');
    const iso = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    assert(px.every((p) => p.date <= iso(now)), tag + ': an entry is dated after today');
    assert(px.every((p) => p.timestamp <= now.getTime()), tag + ': an entry has a time later than now');
  });
});

test('the household-connection functions do nothing in the demo (no popup), and run normally for a real sign-in', () => {
  const w = world(FRESH);
  w.ctx.connectHH(); w.ctx.joinHH();                                           // not a guest: the real ones run
  assert.deepStrictEqual(w.real(), ['connectHH', 'joinHH']);
  w.x.guestOpenDemo(); w.els['gs-sheet'].classList._h = true;
  w.ctx.connectHH('ABC123'); w.ctx.joinHH('ABC123');                           // guest: nothing runs and nothing pops up
  assert.deepStrictEqual(w.real(), ['connectHH', 'joinHH'], 'a household function ran in guest mode');
  assert(!w.vis('gs-sheet'), 'session functions must not open a popup');
  w.x.guestNoteSignedIn(); w.ctx.connectHH('ABC123');                          // after sign-in the demo is off, so the real one runs again
  assert.deepStrictEqual(w.real(), ['connectHH', 'joinHH', 'connectHH']);
});

test('the tour card is moved back inside the screen on a short display, and left alone when it fits', () => {
  const place = (rect, cardH, vh) => {
    const w = world(FRESH); w.x.guestOpenDemo(); w.ctx.innerHeight = vh;
    w.ctx.document.querySelector = () => ({ getBoundingClientRect: () => rect });
    w.els['gs-tour-card'].offsetHeight = cardH; w.x.guestTourStart();
    return { top: w.els['gs-tour-card'].style.top, bottom: w.els['gs-tour-card'].style.bottom };
  };
  const px = (v) => parseFloat(v);
  // step 1 lights up something near the top, so the card goes under it
  let c = place({ top: 60, bottom: 300, left: 0, right: 300, width: 300, height: 240 }, 200, 800); assert.strictEqual(c.top, '316px');            // fits: untouched
  c = place({ top: 60, bottom: 300, left: 0, right: 300, width: 300, height: 240 }, 200, 400); assert.strictEqual(c.top, '192px');               // 316 + 200 > 392: pulled up
  assert(px(c.top) >= 8 && px(c.top) + 200 <= 400 - 8);
  c = place({ top: 60, bottom: 300, left: 0, right: 300, width: 300, height: 240 }, 600, 400); assert.strictEqual(c.top, '8px');                // taller than the screen: pinned to the top edge
});

// ── Tour and trial wording ──────────────────────────────────────────────────
test('the tour container and the Tour button exist, inside the right places', () => {
  assert(html.includes('id="gs-tour"') && html.includes('id="gs-tour-spot"') && html.includes('id="gs-tour-card"'));
  const stripAt = html.indexOf('id="guest-strip"'), viewAt = html.indexOf('<div id="view">');
  const btn = html.indexOf('guestTourOffer()');
  assert(btn > stripAt && btn < viewAt, 'the Tour button must be in the demo strip');
});
test('every tour step goes to a real tab and lights up something that exists', () => {
  const w = world(FRESH), steps = w.x.GUEST_TOUR, render = read('js/07-render.js');
  assert(steps.length >= 5);
  steps.forEach((s, i) => {
    assert(['home', 'log', 'insights', 'chat', 'stg'].includes(s.tab), 'step ' + (i + 1) + ' tab');
    assert(s.en.length === 2 && s.cw.length === 2 && s.en[0] && s.en[1] && s.cw[0] && s.cw[1], 'step ' + (i + 1) + ' needs English and Chichewa text');
    if (s.sel && s.sel[0] === '#') assert(html.includes('id="' + s.sel.slice(1) + '"'), 'step ' + (i + 1) + ' target ' + s.sel + ' is not in index.html');
    if (s.sel && s.sel[0] === '.') assert(render.includes(s.sel.slice(1)), 'step ' + (i + 1) + ' target ' + s.sel + ' is not drawn by the app');
  });
  assert(steps[steps.length - 1].last && !steps[steps.length - 1].sel);
});
test('the demo opens by ASKING about the tour (it never starts by itself) and Skip just closes the offer', () => {
  const w = world(FRESH); w.x.guestOpenDemo();
  assert(!w.x.guestTourOn() && !w.vis('gs-tour'));
  w.timers.forEach((f) => f());                                        // the short delay before the offer
  assert(w.vis('gs-sheet') && /Start tour/.test(w.els['gs-sheet'].innerHTML) && /Skip/.test(w.els['gs-sheet'].innerHTML));
  assert(!w.x.guestTourOn() && !w.vis('gs-tour'), 'the tour must wait for a tap');
  w.x.guestTourStart; vm.runInContext('guestCloseSheet()', w.ctx);   // what the Skip button does
  assert(!w.vis('gs-sheet') && !w.x.guestTourOn());
});
test('the tour walks through every step, switching tabs, and ends on the trial button', () => {
  const w = world(FRESH); w.x.guestOpenDemo(); w.calls.length = 0; w.x.guestTourStart();
  assert(w.vis('gs-tour') && w.x.guestTourOn() && /1 \/ \d/.test(w.els['gs-tour-card'].innerHTML) && !/Back/.test(w.els['gs-tour-card'].innerHTML));
  const n = w.x.GUEST_TOUR.length;
  for (let i = 1; i < n; i++) w.x.guestTourShow(i);
  const goes = w.calls.filter((c) => c.startsWith('go:')).map((c) => c.slice(3));
  assert(goes.includes('log') && goes.includes('insights') && goes.includes('chat') && goes.includes('stg'), 'tabs visited: ' + goes.join(','));
  assert(/Start free trial/.test(w.els['gs-tour-card'].innerHTML) && /Keep exploring/.test(w.els['gs-tour-card'].innerHTML) && /14-day/.test(w.els['gs-tour-card'].innerHTML));
  w.x.guestTourEnd(); assert(!w.vis('gs-tour') && !w.x.guestTourOn() && w.x.get().isGuestMode, 'ending the tour keeps the demo open');
});
test('going to sign-in, or ending the demo, closes the tour; the tour stores nothing on the phone', () => {
  const w = world(FRESH); w.x.guestOpenDemo(); w.x.guestTourStart(); assert(w.x.guestTourOn());
  w.x.guestGoAuth('register'); assert(!w.x.guestTourOn() && !w.vis('gs-tour'));
  w.x.guestBackFromAuth(); w.x.guestTourStart(); w.x.guestNoteSignedIn(); assert(!w.x.guestTourOn() && !w.vis('gs-tour'));
  assert.deepStrictEqual(Object.keys(w.store), ['nb_seen_auth']);
});
test('Premium prompts for a guest say "free for 14 days" and offer "Start free trial"', () => {
  const w = world(FRESH); w.x.guestOpenDemo();
  ['premium', 'ai', 'bills'].forEach((k) => {
    assert(w.x.GUEST_GATES[k].cta === true && /14/.test(w.x.GUEST_GATES[k].en[0]) && /14/.test(w.x.GUEST_GATES[k].cw[1] + w.x.GUEST_GATES[k].cw[0]), k);
    w.x.guestGate(k); assert(/Start free trial/.test(w.els['gs-sheet'].innerHTML), k + ' sheet has no trial button');
  });
  w.x.guestGate('household'); assert(/Create account/.test(w.els['gs-sheet'].innerHTML) && !/Start free trial/.test(w.els['gs-sheet'].innerHTML));
  assert(/the first household you create/.test(read('js/10-legal.js')), 'the app FAQ no longer says the trial starts with the first household: update the wording');
  assert(/TRIAL_DAYS = 14/.test(read('js/11-premium.js')), 'trial length changed: update the "14 days" wording');
});

(async function runAll() {
  for (const t of queue) {
    try { await t.fn(); passed++; console.log('PASS ' + t.name); }
    catch (e) { markFailed(t.name, e); }
  }
  console.log(passed + ' passed' + (failed ? ', ' + failed + ' FAILED' : '') + ' of ' + queue.length);
  process.exitCode = failed ? 1 : 0;
})();
