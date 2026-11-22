// Guards guest mode (js/12a-guest.js): a first-time visitor can try the app with sample data, and guest mode can
// never reach Firebase, the Worker, or a real account. Run: node tests/guest.test.js
const fs = require('fs'), path = require('path'), assert = require('assert'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const guest = read('js/12a-guest.js'), html = read('index.html'), hh = read('js/05-household.js'), sw = read('sw.js');
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + ' :: ' + e.message); process.exitCode = 1; } }

// Code only: drop comments so the notes at the top of the file do not trip the checks.
const code = guest.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"])\/\/[^\n]*$/gm, '$1');

// ── Isolation ───────────────────────────────────────────────────────────────
test('guest code never touches Firebase, Firestore, the Worker or the real app startup', () => {
  const banned = [/\bdb\b/, /\bfirebase\b/, /\bauth\./, /\.collection\(/, /\.doc\(/, /\bfetch\(/, /XMLHttpRequest/, /\bAI_URL\b/,
    /\baddPx\b/, /\bconnectHH\b/, /\bbootApp\b/, /\bcurUser\b/, /\bhhId\b/, /\blPx\b/, /\blCfg\b/, /sessionStorage/, /indexedDB/, /sendBeacon/];
  const hit = banned.filter((r) => r.test(code)).map(String);
  assert.deepStrictEqual(hit, [], 'js/12a-guest.js uses: ' + hit.join(', '));
});
test('the only things guest mode stores on the phone are nb_seen_auth and the language', () => {
  const keys = [...code.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*([^,)]+)/g)].map((m) => m[1].trim());
  const allowed = ['GUEST_SEEN_KEY', "'nb_household'", "'nb_lang'"];
  const bad = keys.filter((k) => !allowed.includes(k));
  assert.deepStrictEqual(bad, [], 'unexpected storage keys: ' + bad.join(', '));
  assert(/const GUEST_SEEN_KEY = 'nb_seen_auth'/.test(code));
});
test('guest mode never writes the demo entries anywhere', () => {
  assert(!/localStorage\.setItem\(\s*'nb_(?!lang)/.test(code), 'only nb_lang may be written by name');
  assert(!/guestEntries[^;\n]*localStorage|localStorage[^;\n]*guestEntries/.test(code));
});

// ── Wiring ──────────────────────────────────────────────────────────────────
test('both guest screens exist and the splash script knows about them', () => {
  assert(html.includes('id="scr-guest-entry"') && html.includes('id="scr-guest"'));
  const ids = /var ids = \[([^\]]*)\]/.exec(html);
  assert(ids && ids[1].includes("'scr-guest-entry'") && ids[1].includes("'scr-guest'"), 'splash id list is missing a guest screen');
});
test('the guest script is in APP_SHELL and loads before the boot script', () => {
  assert(sw.includes('"./js/12a-guest.js"'));
  assert(html.indexOf('./js/12a-guest.js') > html.indexOf('./js/12-chat.js') && html.indexOf('./js/12a-guest.js') < html.indexOf('./js/13-actions-boot.js'));
});
test('bootApp asks guestRoute() before showing sign-in, and tells guest mode when someone signs in', () => {
  const sign = hh.indexOf("if(typeof guestNoteSignedIn==='function') guestNoteSignedIn();");
  const user = hh.indexOf('curUser=user;');
  assert(sign > user && sign - user < 200, 'guestNoteSignedIn must be the first thing the signed-in branch does');
  const route = hh.indexOf("guestRoute()) return;"), authShow = hh.indexOf("hide('scr-pin');\n      // First-time visitors");
  assert(route > -1 && authShow > -1 && hh.indexOf("show('scr-auth');", route) > route, 'sign-in must stay as the fallback after guestRoute()');
});
test('the other places that show sign-in directly are untouched (sign-out, deletion, back-to-login)', () => {
  assert(!/guestRoute/.test(read('js/03-pin.js')) && !/guestRoute/.test(read('js/04-auth.js')) && !/guestRoute/.test(read('js/11-premium.js')));
});
test('every icon the account gates name exists in the icon file', () => {
  const have = new Set([...read('vendor/icons.min.js').matchAll(/"([a-z0-9-]+)":\[\[/g)].map((m) => m[1]));
  const names = [...code.matchAll(/icon:'([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert(names.length >= 5);
  const miss = names.filter((n) => !have.has(n));
  assert.deepStrictEqual(miss, [], 'missing icons: ' + miss.join(', '));
});

// ── Behaviour, run against stand-ins for the page ───────────────────────────
function world(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.ls || {});
  const els = {};
  const el = (id, hidden) => (els[id] = els[id] || { id, innerHTML: '', textContent: '', value: '', querySelector: () => null, classList: {
    _h: !!hidden, contains(c) { return c === 'hide' && this._h; }, add(c) { if (c === 'hide') this._h = true; }, remove(c) { if (c === 'hide') this._h = false; } } });
  ['scr-guest-entry', 'scr-guest', 'scr-auth', 'gs-sheet'].forEach((id) => el(id, true));
  ['gs-body', 'gs-nav', 'gs-desc', 'gs-amt', 'gs-err', 'gs-cat', 'a-guest-back'].forEach((id) => el(id, id === 'a-guest-back'));
  const calls = [];
  const ctx = {
    g: (id) => els[id] || null, hide: (id) => els[id] && els[id].classList.add('hide'), show: (id) => els[id] && els[id].classList.remove('hide'),
    L: (en) => en, esc: (s) => String(s).replace(/[&<>"']/g, '_'), MK: (n) => 'MK ' + n.toLocaleString('en-US'), _ic: (n) => '<i data-lucide="' + n + '"></i>',
    tx: () => ({ income: 'Income', expense: 'Expense', spent: 'Spent', left: 'Left', home: 'Home', log: 'Log', cancel: 'Cancel' }),
    CAT_COLORS: {}, aTab: (m) => calls.push('aTab:' + m), applyStaticLang() {}, applyLang() {}, toast: (m) => calls.push('toast'),
    lang: 'en', _pendingJoinCode: opts.join || null, window: {}, console,
    document: { querySelectorAll: () => [], addEventListener() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
  };
  if (opts.brokenStorage) ctx.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  vm.createContext(ctx);
  vm.runInContext(guest + '\n;this.__x={guestRoute,guestNoteSignedIn,guestIsReturning,guestTotals,guestSaveEntry,guestOpenAdd,guestOpenDemo,guestGoAuth,guestBackFromAuth,GUEST_BUDGET,entries:()=>guestEntries};', ctx);
  return { x: ctx.__x, els, store, calls, vis: (id) => !els[id].classList.contains('hide') };
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
test('guestRoute leaves a screen that is already up alone', () => {
  const w = world(FRESH); w.x.guestOpenDemo(); assert.strictEqual(w.x.guestRoute(), true); assert(w.vis('scr-guest'));
});
test('signing in remembers the phone, closes the demo and throws the demo entries away', () => {
  const w = world(FRESH); w.x.guestOpenDemo(); w.els['gs-amt'].value = '5000'; w.x.guestOpenAdd('expense'); w.els['gs-amt'].value = '5000'; w.x.guestSaveEntry();
  assert.strictEqual(w.x.entries().length, 1);
  w.x.guestNoteSignedIn();
  assert.strictEqual(w.store.nb_seen_auth, '1'); assert(!w.vis('scr-guest') && !w.vis('scr-guest-entry')); assert.strictEqual(w.x.entries().length, 0);
});
test('Create account and Sign in use the existing sign-in screen', () => {
  const w = world(FRESH); w.x.guestOpenDemo(); w.x.guestGoAuth('register');
  assert(w.vis('scr-auth') && !w.vis('scr-guest') && w.vis('a-guest-back')); assert(w.calls.includes('aTab:register'));
  w.x.guestBackFromAuth(); assert(w.vis('scr-guest') && !w.vis('scr-auth'));
});
test('sample totals add up (income, spending, balance)', () => {
  const t = world(FRESH).x.guestTotals();
  assert.strictEqual(t.income, 250000); assert.strictEqual(t.spent, 173000); assert.strictEqual(t.balance, 77000);
});
test('a demo entry needs an amount above zero, and is capped', () => {
  const w = world(FRESH); w.x.guestOpenAdd('expense');
  ['', '0', '-5', 'abc', '1000000000'].forEach((v) => { w.els['gs-amt'].value = v; assert.strictEqual(w.x.guestSaveEntry(), false, v); });
  assert.strictEqual(w.x.entries().length, 0);
  for (let i = 0; i < 30; i++) { w.els['gs-amt'].value = '100'; assert.strictEqual(w.x.guestSaveEntry(), true); }
  w.els['gs-amt'].value = '100'; assert.strictEqual(w.x.guestSaveEntry(), false);
});
test('text typed into the demo is escaped before it is drawn', () => {
  const w = world(FRESH); w.x.guestOpenDemo(); w.x.guestOpenAdd('expense');
  w.els['gs-desc'].value = '<img src=x onerror=alert(1)>'; w.els['gs-amt'].value = '100'; w.els['gs-cat'].value = 'Food'; w.x.guestSaveEntry();
  assert(!/<img/.test(w.els['gs-body'].innerHTML), 'unescaped markup reached the screen');
});

console.log(passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
