// Checks the 9.19.7 clean-up: removed functions stay gone, the new icon classes exist, the new icons are in the bundle.
// Run: node tests/cleanup.test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const files = ['index.html'].concat(fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f));
const code = files.map(read).join('\n');
const css = read('styles.css') + '\n' + read('glass.css');
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + ' :: ' + e.message); process.exitCode = 1; } }

test('removed functions are gone and nothing calls them', () => {
  ['chatSuggest', 'clearChat', 'confirmPaymentWA', 'openWithdraw', 'delBillD', 'swUD', 'openPxMD', 'viewItemD', 'openEUd', 'delItd', 'delMemberd', 'openEBd', 'topUpGoald', 'delGoald']
    .forEach((n) => assert(!new RegExp('\\b' + n + '\\b').test(code), n + ' is still in the code'));
});
test('every icon-size class used in the app has a CSS rule', () => {
  const used = new Set((code.match(/\bic(?:11|12|13|14|16|13m4|14m4|14m5)\b/g) || []));
  assert(used.size > 0, 'no ic* classes used');
  used.forEach((c) => assert(new RegExp('\\.' + c + '\\{').test(css), '.' + c + ' has no rule in styles.css'));
});
test('the replaced inline icon styles are gone', () => {
  ['width:11px;height:11px', 'width:12px;height:12px', 'width:13px;height:13px', 'width:14px;height:14px', 'width:16px;height:16px',
   'width:13px;height:13px;margin-right:4px;vertical-align:middle', 'width:14px;height:14px;margin-right:4px;vertical-align:middle',
   'width:14px;height:14px;margin-right:5px;vertical-align:middle']
    .forEach((v) => assert(!code.includes('style="' + v + '"'), 'still inline: ' + v));
});
test('new icons exist in the icon bundle', () => {
  const b = read('vendor/icons.min.js');
  ['scan-line', 'party-popper'].forEach((n) => assert(b.includes('"' + n + '"'), n + ' missing from vendor/icons.min.js'));
});
test('Magic Log no longer uses the sparkles icon', () => {
  assert(!/data-lucide="sparkles"/.test(code), 'a sparkles icon is still used');
});
test('stylesheets are balanced', () => {
  [read('styles.css'), read('glass.css')].forEach((s) => assert.strictEqual(s.split('{').length, s.split('}').length));
});
console.log(passed + ' passed');
