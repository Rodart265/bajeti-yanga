// Stage 2 of the move to one-document-per-record (docs/DATA-MODEL-PLAN.md).
// Checks: recMirrorOps() (js/02-helpers.js) picks exactly the records that changed, mirrorRecs() (js/05-household.js)
// writes them in batches and never throws, saveCfg() and markBillPaid() call it, and the rules have a block for each list.
// Run with:  node tests/subcol.test.js      (no packages needed)
const fs = require('fs'), path = require('path'), assert = require('assert');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let passed = 0;
function test(name, fn) {
  const ok = () => { passed++; console.log('PASS ' + name); };
  const bad = (e) => { console.log('FAIL ' + name + ' :: ' + (e && e.message)); process.exitCode = 1; };
  try { const r = fn(); if (r && typeof r.then === 'function') pending.push(r.then(ok, bad)); else ok(); } catch (e) { bad(e); }
}
const pending = [];

// ---- load recMirrorOps from js/02-helpers.js
const h = read('js/02-helpers.js');
const hs = h.indexOf('function recMirrorOps');
const he = h.indexOf('\n}\n', hs) + 3;
assert(hs > -1 && he > hs, 'could not find recMirrorOps in js/02-helpers.js');
const recMirrorOps = new Function(h.slice(hs, he) + '\nreturn recMirrorOps;')();

const I = (id, name, budget) => ({ id, name, budget });
const base = { items: [I('a', 'Rice', 100), I('b', 'Oil', 200), I('c', 'Sugar', 300)], bills: [], goals: [] };
const clone = (o) => JSON.parse(JSON.stringify(o));

test('no change means nothing to write', () => {
  const o = recMirrorOps(base, clone(base));
  assert.deepStrictEqual([o.set.length, o.del.length], [0, 0]);
});
test('a new record is written with its list position as order', () => {
  const n = clone(base); n.items.push(I('d', 'Salt', 50));
  const o = recMirrorOps(base, n);
  assert.strictEqual(o.set.length, 1); assert.strictEqual(o.del.length, 0);
  assert.deepStrictEqual(o.set[0], { col: 'items', id: 'd', data: { id: 'd', name: 'Salt', budget: 50, order: 3 } });
});
test('an edited record is written, the others are not', () => {
  const n = clone(base); n.items[1].budget = 999;
  const o = recMirrorOps(base, n);
  assert.deepStrictEqual(o.set.map((x) => x.id), ['b']); assert.strictEqual(o.set[0].data.budget, 999);
});
test('a removed record is deleted, and the records after it get their new order', () => {
  const n = clone(base); n.items.splice(0, 1);
  const o = recMirrorOps(base, n);
  assert.deepStrictEqual(o.del, [{ col: 'items', id: 'a' }]);
  assert.deepStrictEqual(o.set.map((x) => [x.id, x.data.order]), [['b', 0], ['c', 1]]);
});
test('a re-ordered list writes the records that moved', () => {
  const n = clone(base); n.items.reverse();
  const o = recMirrorOps(base, n);
  assert.deepStrictEqual(o.set.map((x) => x.id).sort(), ['a', 'c']);
});
test('items, bills and goals are each handled, under their own collection name', () => {
  const p = { items: [], bills: [], goals: [] };
  const n = { items: [I('i1', 'Rice', 1)], bills: [{ id: 'b1', name: 'ESCOM', amount: 5, dueDate: '2026-12-01', icon: 'zap' }], goals: [{ id: 'g1', name: 'Phone', target: 9, saved: 1 }] };
  const o = recMirrorOps(p, n);
  assert.deepStrictEqual(o.set.map((x) => x.col).sort(), ['bills', 'goals', 'items']);
});
test('a list that is missing from the new settings is left alone, never wiped', () => {
  const o = recMirrorOps(base, { bills: [{ id: 'b1', name: 'x', amount: 1, dueDate: '2026-12-01' }] });
  assert.strictEqual(o.del.length, 0);
  assert.deepStrictEqual(o.set.map((x) => x.col), ['bills']);
});
test('records with no id, or an id that is not plain, are skipped', () => {
  const n = { items: [{ name: 'No id', budget: 1 }, { id: 'a/b', name: 'Slash', budget: 1 }, { id: 'ok_1', name: 'Fine', budget: 1 }] };
  const o = recMirrorOps({ items: [] }, n);
  assert.deepStrictEqual(o.set.map((x) => x.id), ['ok_1']);
});
test('nothing written contains undefined (Firestore rejects it)', () => {
  const o = recMirrorOps({ items: [] }, { items: [{ id: 'z', name: 'Z', budget: 1, cat: undefined }] });
  assert(!('cat' in o.set[0].data));
});
test('missing or odd input does not throw', () => {
  recMirrorOps(null, null); recMirrorOps(undefined, { items: 'nope' }); recMirrorOps({ items: [null, 5] }, { items: [null, 7] });
});

// ---- mirrorRecs() in js/05-household.js, run against a pretend database
const hh = read('js/05-household.js');
const ms = hh.indexOf('function mirrorRecs');
const me = hh.indexOf('\nfunction saveCfg', ms);
assert(ms > -1 && me > ms, 'could not find mirrorRecs in js/05-household.js');
function runMirror(opts) {
  const log = { batches: [], docs: [] };
  const db = {
    collection: (c) => ({ doc: (id) => ({ collection: (cc) => ({ doc: (iid) => ({ path: c + '/' + id + '/' + cc + '/' + iid }) }) }) }),
    batch: () => { const ops = []; log.batches.push(ops); return { set: (r, d) => ops.push(['set', r.path, d]), delete: (r) => ops.push(['del', r.path]), commit: () => opts.fail ? Promise.reject({ code: 'permission-denied', message: 'x' }) : Promise.resolve() }; },
  };
  const firebase = { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } };
  const fn = new Function('hhId', 'db', 'firebase', 'recMirrorOps', 'window', 'console', hh.slice(ms, me) + '\nreturn mirrorRecs;');
  const quiet = { warn: () => { log.warned = true; } };
  return { run: fn(opts.hhId === undefined ? 'hh1' : opts.hhId, db, firebase, recMirrorOps, {}, quiet), log };
}
test('mirrorRecs writes each changed record to households/{code}/{list}/{id}, stamped with updatedAt', async () => {
  const { run, log } = runMirror({}); const n = clone(base); n.items.push(I('d', 'Salt', 50));
  await run(base, n);
  assert.strictEqual(log.batches.length, 1);
  assert.deepStrictEqual(log.batches[0][0].slice(0, 2), ['set', 'households/hh1/items/d']);
  assert.strictEqual(log.batches[0][0][2].updatedAt, 'TS');
});
test('mirrorRecs does nothing when there is no household or nothing changed', async () => {
  let r = runMirror({ hhId: null }); await r.run(base, base); assert.strictEqual(r.log.batches.length, 0);
  r = runMirror({}); await r.run(base, clone(base)); assert.strictEqual(r.log.batches.length, 0);
});
test('mirrorRecs splits big changes into batches of at most 400', async () => {
  const { run, log } = runMirror({}); const n = { items: [] };
  for (let i = 0; i < 900; i++) n.items.push(I('r' + i, 'N' + i, i));
  await run({ items: [] }, n);
  assert.deepStrictEqual(log.batches.map((b) => b.length), [400, 400, 100]);
});
test('mirrorRecs swallows a failed write (logs it, never throws)', async () => {
  const { run, log } = runMirror({ fail: true }); const n = clone(base); n.items.push(I('d', 'Salt', 50));
  await run(base, n); assert(log.warned);
});

// ---- the two places that change the lists must call it
test('saveCfg copies the changes only after the main save worked', () => {
  const s = hh.slice(hh.indexOf('function saveCfg')); const upd = s.indexOf(".update(upd).then(");
  assert(upd > -1 && s.slice(upd, upd + 160).includes('mirrorRecs(prev,cfg)'), 'saveCfg must call mirrorRecs(prev,cfg) inside the success branch');
});
test('markBillPaid copies the changed bills (online and offline paths)', () => {
  const s = read('js/08-history-summary.js'); const f = s.slice(s.indexOf('function markBillPaid'), s.indexOf('function markBillPaid') + 7000);
  assert(f.includes('mirrorRecs(_prevCfg,{bills:bills})'), 'online path'); assert(f.includes('mirrorRecs(prevCfg,cfg)'), 'offline path');
});

// ---- rules
const rules = read('firestore.rules');
test('rules have a members-only block for items, bills and goals, each with its own validator', () => {
  ['items', 'bills', 'goals'].forEach((c) => { assert(rules.includes('match /' + c + '/{recId}'), c); });
  ['validItemDoc(recId)', 'validBillDoc(recId)', 'validGoalDoc(recId)'].forEach((v) => assert(rules.includes(v), v));
  assert(!/match \/items\/\{recId\}[^}]*allow [a-z, ]*: if true/.test(rules));
});
test('rules braces and parentheses balance', () => {
  const t = rules.replace(/\/\/[^\n]*/g, '').replace(/'[^']*'/g, "''");
  assert.strictEqual((t.match(/\{/g) || []).length, (t.match(/\}/g) || []).length);
  assert.strictEqual((t.match(/\(/g) || []).length, (t.match(/\)/g) || []).length);
});

Promise.all(pending).then(() => console.log('\n' + passed + ' passed' + (process.exitCode ? ' (SOME FAILED)' : '')));
