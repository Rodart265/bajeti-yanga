// Guards the two growth stamps the app writes for the admin console (lastActiveAt, firstEntryAt) and the console's new display code.
// Run: node tests/growth.test.js
const fs = require('fs'), path = require('path'), assert = require('assert'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const hh = read('js/05-household.js'), admin = read('admin/admin.js');
let passed = 0, failed = 0;
const queue = [];
const test = (name, fn) => queue.push({ name, fn });
function body(src, name) {
  const m = new RegExp('^(?:async )?function ' + name + '\\b[^\\n]*', 'm').exec(src);
  assert(m, 'function ' + name + ' not found');
  const rest = src.slice(m.index + 1), next = rest.search(/\n(?:async )?function \w+|\n\/\/ Returns a Promise/);
  return src.slice(m.index, next < 0 ? src.length : m.index + 1 + next);
}

// A tiny pretend app: one signed-in person, a pretend profile write that can succeed, fail, or wait.
function world(over = {}) {
  const w = { writes: [], store: {}, guest: false, user: { uid: 'u1' }, mode: 'ok', pending: [] };
  Object.assign(w, over);
  const sandbox = {
    get isGuestMode() { return w.guest; }, get curUser() { return w.user; },
    localStorage: { getItem: (k) => (k in w.store ? w.store[k] : null), setItem: (k, v) => { w.store[k] = v; } },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TS' } } },
    db: { collection: (c) => ({ doc: (id) => ({ set: (data, opts) => { w.writes.push({ c, id, data, opts }); if (w.mode === 'fail') return Promise.reject(new Error('offline')); if (w.mode === 'wait') return new Promise((r) => w.pending.push(r)); return Promise.resolve(); } }) }) },
    Date, Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(['_growthDay', 'growthStampActive', 'growthStampFirstEntry'].map((n) => body(hh, n)).join('\n'), sandbox);
  w.run = (fn) => vm.runInContext(fn + '()', sandbox);
  return w;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('last active: one write to the person\'s own profile, with the server time, merged', async () => {
  const w = world(); w.run('growthStampActive'); await tick();
  assert.strictEqual(w.writes.length, 1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(w.writes[0])), { c: 'users', id: 'u1', data: { lastActiveAt: 'SERVER_TS' }, opts: { merge: true } });
});
test('last active: at most once a day on a phone, and again the next day', async () => {
  const w = world(); w.run('growthStampActive'); await tick(); w.run('growthStampActive'); await tick();
  assert.strictEqual(w.writes.length, 1, 'second open the same day writes nothing');
  w.store.nb_lastact = 'u1:2000-01-01'; w.run('growthStampActive'); await tick();
  assert.strictEqual(w.writes.length, 2, 'a different day writes again');
});
test('last active: two people sharing a phone each get their own stamp', async () => {
  const w = world(); w.run('growthStampActive'); await tick(); w.user = { uid: 'u2' }; w.run('growthStampActive'); await tick();
  assert.deepStrictEqual(w.writes.map((x) => x.id), ['u1', 'u2']);
});
test('last active: never in the demo, and never without a signed-in person', async () => {
  let w = world({ guest: true }); w.run('growthStampActive'); await tick(); assert.strictEqual(w.writes.length, 0);
  w = world({ user: null }); w.run('growthStampActive'); await tick(); assert.strictEqual(w.writes.length, 0);
});
test('last active: a failed write is silent, and is tried again next time (the day is only remembered after it worked)', async () => {
  const w = world({ mode: 'fail' }); w.run('growthStampActive'); await tick(); await tick();
  assert.strictEqual(w.store.nb_lastact, undefined);
  w.mode = 'ok'; w.run('growthStampActive'); await tick();
  assert.strictEqual(w.writes.length, 2); assert(w.store.nb_lastact);
});
test('first entry: written once, with the server time, on the person\'s own profile', async () => {
  const w = world(); w.run('growthStampFirstEntry'); await tick(); w.run('growthStampFirstEntry'); await tick();
  assert.strictEqual(w.writes.length, 1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(w.writes[0])), { c: 'users', id: 'u1', data: { firstEntryAt: 'SERVER_TS' }, opts: { merge: true } });
});
test('first entry: never in the demo, silent on failure', async () => {
  let w = world({ guest: true }); w.run('growthStampFirstEntry'); await tick(); assert.strictEqual(w.writes.length, 0);
  w = world({ mode: 'fail' }); w.run('growthStampFirstEntry'); await tick(); await tick(); assert.strictEqual(w.store.nb_fe, undefined);
});
test('the first-entry stamp runs only after a saved entry, and never for automatic recurring entries (they carry a docId)', () => {
  const add = body(hh, 'addPx');
  const ok = add.split('.catch(')[0], bad = add.split('.catch(').slice(1).join('.catch(');
  assert(ok.includes('if(!opts.docId) growthStampFirstEntry(); return true;'), 'stamp sits in the success branch, guarded by !opts.docId');
  assert(!/growthStampFirstEntry/.test(bad), 'not in the failure branch');
  assert(ok.indexOf('growthStampFirstEntry') > ok.indexOf('op.then('), 'only after the write resolved');
  const rec = read('js/07-render.js');
  assert(/docId:'recur_'/.test(rec), 'recurring entries are still written with a docId');
});
test('start-up stamps last-active right after the signed-in person is known', () => {
  assert(/curUser=user;\n\s*growthStampActive\(\);/.test(hh));
});
test('neither stamp touches Premium, trial or any other field', () => {
  for (const n of ['growthStampActive', 'growthStampFirstEntry']) {
    const b = body(hh, n);
    assert(!/premium|trial|household|hhId|userId|amount/i.test(b.replace(/\/\/.*$/gm, '')), n + ' only writes its own timestamp');
  }
});
test('the daily history collection is not open to browsers: no rule mentions it, and there is no catch-all', () => {
  for (const f of ['firestore.rules', 'firestore.phase-b.rules']) {
    const r = read(f);
    assert(!/growthDaily/.test(r), f + ' must not open growthDaily (unmatched paths are denied)');
    assert(!/match \/\{document=\*\*\}/.test(r), f + ' must not have a catch-all rule');
    assert(!/lastActiveAt|firstEntryAt/.test(r), f + ' does not need to change for the stamps');
  }
});
test('the rules still let a person update their own profile with these fields (only Premium and trial fields are blocked)', () => {
  const r = read('firestore.rules'), i = r.indexOf('match /users/{uid}'), seg = r.slice(i, i + 1500);
  assert(/allow update/.test(seg) && /request\.auth\.uid == uid/.test(seg));
  assert(/affectedKeys\(\)\s*\.hasAny\(\[?\s*'isPremium'/.test(seg), 'update only blocks the Premium and trial fields');
  assert(!/hasOnly/.test(seg), 'no allow-list of fields that would reject a new one');
});

// ── the console's display code, run with small stand-ins ──
function consoleFns() {
  const start = admin.indexOf('  // "Activated" = added a first real entry by hand.'), end = admin.indexOf('  PAGES.reports = async force =>');
  assert(start > 0 && end > start, 'display helpers found');
  const sb = { DASH: '-', esc: (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;'), num: (n) => (n === null || n === undefined ? '-' : String(n)),
    fmtDate: (ms) => 'D' + ms, dayLabel: (d) => d, columnCard: (t, s, items) => '[card ' + t + ' ' + items.map((x) => x.k + '=' + x.v).join(',') + ']' };
  vm.createContext(sb); vm.runInContext(admin.slice(start, end) + '\nthis.activationText = activationText; this.historySection = historySection;', sb);
  return sb;
}
test('console: first-entry row says what it is measuring, never a made-up zero', () => {
  const c = consoleFns();
  assert(/Worker has not been updated/.test(c.activationText(undefined)));
  assert(/starts counting when the new app version reaches phones/.test(c.activationText({ trackingStartMs: null, registered: null })));
  assert(/sign-in dates are not available/.test(c.activationText({ trackingStartMs: 5, registered: null })));
  assert(/nobody has registered/.test(c.activationText({ trackingStartMs: 5, registered: 0, activated: 0 })));
  assert(/^33% .*1 of 3 registered since D5/.test(c.activationText({ trackingStartMs: 5, registered: 3, activated: 1 })));
});
test('console: daily history handles an old Worker, no data yet, and real rows', () => {
  const c = consoleFns();
  assert(/not available yet/.test(c.historySection(null)));
  assert(/starts tonight/.test(c.historySection({ rows: [] })));
  const html = c.historySection({ rows: [{ day: '2026-11-24', users: { total: 5, active7: 3, active7Signin: 2, withFirstEntry: 2 }, households: { live: 2 }, premium: { premium: 1 } }, { day: '2026-11-25', users: { total: 6 }, households: {}, premium: {} }] });
  assert(/\[card Users in total 2026-11-24=5,2026-11-25=6\]/.test(html));
  assert(/starts on 2026-11-24/.test(html) && /not filled in for earlier days/.test(html));
  assert(/<td>2026-11-25<\/td><td class="r num">6<\/td><td class="r num">-<\/td>/.test(html), 'missing numbers show a dash, newest day first');
});
test('console: the Reports page survives an older Worker (history failure is caught)', () => {
  assert(/get\('growth_history', \{ days: 30 \}, force\)\.catch\(\(\) => null\)/.test(admin));
});

(async () => {
  for (const t of queue) { try { await t.fn(); passed++; console.log('PASS ' + t.name); } catch (e) { failed++; process.exitCode = 1; console.log('FAIL ' + t.name + ' :: ' + (e && e.message)); } }
  console.log(passed + ' passed of ' + (passed + failed));
})();
