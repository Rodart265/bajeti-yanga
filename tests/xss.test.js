// Guards against text injection through stored data (categories and record ids). Run: node tests/xss.test.js
// Added in 9.18.1 after a review found that a household member could save a purchase whose category (or a
// bill/goal/item id) held script, and it would run in other members' screens.
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const helpers = fs.readFileSync(path.join(root, 'js', '02-helpers.js'), 'utf8');

let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + ' :: ' + e.message); process.exitCode = 1; } }

// Pull catOf() out of the helpers file and run it with the two globals it reads.
const s0 = helpers.indexOf('const catOf = ');
const s1 = helpers.indexOf('\n};', s0) + 3;
assert(s0 > -1 && s1 > s0, 'could not find catOf in js/02-helpers.js');
const catOf = new Function('lCfg', 'ITEM_CATS', helpers.slice(s0, s1) + '\nreturn catOf;')({ items: [] }, { Food: ['Rice'], Household: [], Personal: [], Transport: [], Other: [] });

const BAD = '<img src=x onerror=alert(1)>';
test('catOf returns a known category unchanged', () => assert.strictEqual(catOf('zzz', 'Transport'), 'Transport'));
test('catOf turns an unknown category into Other', () => assert.strictEqual(catOf('zzz', BAD), 'Other'));
test('catOf never returns script, whatever the item name is', () => {
  ['zzz', 'Rice', 'unknown thing', ''].forEach((n) => assert(['Food','Household','Personal','Transport','Other'].includes(catOf(n, BAD))));
});
test('catOf copes with no category at all', () => assert.strictEqual(catOf('zzz'), 'Other'));

// recKey / recIdx / ensureRecIds: an id that is not plain letters, digits, - or _ must never reach an onclick.
const r0 = helpers.indexOf('function recKey');
const r1 = helpers.indexOf('\n}\n', helpers.indexOf('function recIdx')) + 3;
const e0 = helpers.indexOf('function newRecId');
const e1 = helpers.indexOf('function recKey');
const { recKey, recIdx, ensureRecIds, cfgNeedsRecIds } = new Function(helpers.slice(e0, e1) + helpers.slice(r0, r1) + '\nreturn {recKey, recIdx, ensureRecIds, cfgNeedsRecIds};')();
const EVIL = "x');alert(document.cookie);//";
test('recKey hands out a plain id as it is', () => assert.strictEqual(recKey({ id: 'b1abc' }, 0), 'b1abc'));
test('recKey will not hand out an id with quotes or brackets', () => assert.strictEqual(recKey({ id: EVIL }, 2), '~2'));
test('recIdx still finds a record whose id is not plain, by position', () => assert.strictEqual(recIdx([{ id: EVIL }], '~0'), 0));
test('recIdx does not match a plain-id record by position', () => assert.strictEqual(recIdx([{ id: 'a1' }], '~0'), -1));
test('ensureRecIds replaces a bad id with a plain one', () => {
  const cfg = { bills: [{ id: EVIL, name: 'Rent' }], items: [], goals: [] };
  assert.strictEqual(cfgNeedsRecIds(cfg), true);
  assert.strictEqual(ensureRecIds(cfg), true);
  assert(/^[A-Za-z0-9_-]{1,40}$/.test(cfg.bills[0].id));
  assert.strictEqual(cfgNeedsRecIds(cfg), false);
});

// The two screens that print a category must escape it.
const hist = fs.readFileSync(path.join(root, 'js', '08-history-summary.js'), 'utf8');
test('History prints the category through esc()', () => assert(!/\+catLabel\+/.test(hist) && /esc\(catLabel\)/.test(hist)));
test('Summary prints the category through esc()', () => assert(/\$\{esc\(t\.cats\[cat\]\|\|cat\)\}/.test(hist)));

console.log(passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
