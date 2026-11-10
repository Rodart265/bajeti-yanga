// Every icon the app asks for must exist in vendor/icons.min.js, which is a small hand-picked subset of Lucide.
// An icon that is not in the file draws nothing (an empty gap in the screen). Run: node tests/icons.test.js
// To add an icon, take its drawing from the same Lucide version (0.441.0) and add it to the file's ICONS list.
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + ' :: ' + e.message); process.exitCode = 1; } }

const bundle = fs.readFileSync(path.join(root, 'vendor', 'icons.min.js'), 'utf8');
const have = new Set([...bundle.matchAll(/"([a-z0-9-]+)":\[\[/g)].map((m) => m[1]));
test('the icon file lists its icons (sanity)', () => assert(have.size > 100 && have.has('check') && have.has('trash-2'), 'found ' + have.size));

const files = fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f).concat(['index.html', 'admin/index.html', 'admin/admin.js'].filter((f) => fs.existsSync(path.join(root, f))));
const used = new Map();
files.forEach((f) => {
  const s = fs.readFileSync(path.join(root, f), 'utf8');
  for (const m of s.matchAll(/data-lucide=\\?"([a-z0-9-]+)\\?"/g)) { if (!used.has(m[1])) used.set(m[1], f); }
  // Item icons are built with _ic('name', colour) in js/01-constants.js, so the name is not next to data-lucide there.
  for (const m of s.matchAll(/\b_ic\(\s*'([a-z0-9-]+)'/g)) { if (!used.has(m[1])) used.set(m[1], f); }
});
test('every icon named in the app exists in vendor/icons.min.js (' + used.size + ' names)', () => {
  const missing = [...used].filter(([n]) => !have.has(n)).map(([n, f]) => n + ' (' + f + ')');
  assert.strictEqual(missing.length, 0, 'missing: ' + missing.join(', '));
});

const constants = fs.readFileSync(path.join(root, 'js', '01-constants.js'), 'utf8');
test('item icons are line icons, not emoji', () => {
  const start = constants.indexOf('const ITEM_ICONS'); const end = constants.indexOf('\n};', start);
  const block = constants.slice(start, end);
  assert(!/&#\d{4,6};/.test(block), 'an emoji entity is still in ITEM_ICONS');
  assert(!/[\u{1F300}-\u{1FAFF}]/u.test(block), 'a literal emoji is still in ITEM_ICONS');
});

console.log(passed + ' passed');
