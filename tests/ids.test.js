// Checks recKey() and recIdx() from js/02-helpers.js: the helpers that find a budget item, bill or goal
// by its id (or, for old records without one, by position) when someone taps Edit or Delete.
// Run with:  node tests/ids.test.js      (no packages needed)
const fs = require('fs'), path = require('path'), assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', '02-helpers.js'), 'utf8');
const start = src.indexOf('function recKey');
const end = src.indexOf('\n}\n', src.indexOf('function recIdx')) + 3;
assert(start > -1 && end > start, 'could not find recKey/recIdx in js/02-helpers.js');
const { recKey, recIdx } = new Function(src.slice(start, end) + '\nreturn {recKey, recIdx};')();

let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + ' :: ' + e.message); process.exitCode = 1; } }

const items = [{ id: 'a1', name: 'Rice' }, { id: 'b2', name: 'Oil' }, { name: 'Old item' }, { id: 'c3', name: 'Sugar' }];

test('recKey uses the id when there is one', () => assert.strictEqual(recKey(items[1], 1), 'b2'));
test('recKey falls back to ~position for records without an id', () => assert.strictEqual(recKey(items[2], 2), '~2'));
test('recKey turns a numeric id into a string', () => assert.strictEqual(recKey({ id: 7 }, 0), '7'));
test('recKey copes with a missing record', () => assert.strictEqual(recKey(null, 3), '~3'));

test('recIdx finds a record by id, wherever it sits', () => assert.strictEqual(recIdx(items, 'c3'), 3));
test('recIdx still finds the right record after the list is reordered', () => {
  const reordered = [items[3], items[0], items[2], items[1]];
  assert.strictEqual(recIdx(reordered, 'b2'), 3);
  assert.strictEqual(recIdx(reordered, 'a1'), 1);
});
test('recIdx finds an id-less record by its ~position', () => assert.strictEqual(recIdx(items, '~2'), 2));
test('recIdx refuses a ~position that now points at a record that has an id', () => assert.strictEqual(recIdx(items, '~0'), -1));
test('recIdx refuses a ~position beyond the end of the list', () => assert.strictEqual(recIdx(items, '~9'), -1));
test('recIdx returns -1 for an unknown id', () => assert.strictEqual(recIdx(items, 'zzz'), -1));
test('recIdx returns -1 for empty, null or undefined keys', () => {
  assert.strictEqual(recIdx(items, ''), -1);
  assert.strictEqual(recIdx(items, null), -1);
  assert.strictEqual(recIdx(items, undefined), -1);
});
test('recIdx returns -1 when the list is not an array', () => { assert.strictEqual(recIdx(undefined, 'a1'), -1); assert.strictEqual(recIdx({}, 'a1'), -1); });
test('recIdx ignores empty slots in the list', () => assert.strictEqual(recIdx([null, { id: 'x' }], 'x'), 1));
test('recKey and recIdx agree: the key of a record finds that same record', () => {
  items.forEach((r, i) => assert.strictEqual(recIdx(items, recKey(r, i)), i));
});

console.log(passed + ' passed' + (process.exitCode ? ', some failed' : ''));
 
