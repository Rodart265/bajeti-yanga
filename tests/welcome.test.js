// Checks the 9.19.6 startup: a signed-in person goes straight to Home (or the PIN screen), with no "Welcome back" tap.
// Run: node tests/welcome.test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const consts = read('js/01-constants.js'), house = read('js/05-household.js'), html = read('index.html');

let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + ' :: ' + e.message); process.exitCode = 1; } }

test('WELCOME_SCREEN switch exists and is off', () => assert(/const WELCOME_SCREEN = false;/.test(consts)));
test('the Welcome screen code is still there (switch it on to bring it back)', () =>
  assert(house.includes('function showWelcome(') && house.includes('function welcomeContinue(') && house.includes('function welcomeSwitch(')));
test('splash has no forced minimum wait', () => assert(/var MIN_DISPLAY_MS = 0;/.test(html)));

// Pull the skip block out of the sign-in handler and run it against stand-ins.
const s0 = house.indexOf('if(!WELCOME_SCREEN){');
const s1 = house.indexOf('              return;\n            }\n', s0);
assert(s0 > -1 && s1 > s0, 'could not find the WELCOME_SCREEN block in js/05-household.js');
const block = house.slice(s0, s1 + '              return;\n            }\n'.length);
const before = house.indexOf('showWelcome(', s1);
test('the skip block comes before the old Welcome code runs', () => assert(before > s1));

function run(WELCOME_SCREEN, pin) {
  const log = [];
  const app = { classList: { add: (c) => log.push('app+' + c), remove: (c) => log.push('app-' + c) } };
  const env = {
    WELCOME_SCREEN, hid: 'h1', _pendingHid: 'old', pinMode: 'x',
    hasPIN: () => pin, hide: (id) => log.push('hide ' + id), g: () => app,
    showPIN: () => log.push('showPIN'), connectHH: (h) => log.push('connectHH ' + h),
  };
  const fn = new Function(...Object.keys(env), 'return (function(){' + block + ' return "fell-through"; })() + "|" + _pendingHid + "|" + pinMode;');
  const out = fn(...Object.values(env));
  return { log, out };
}

test('no PIN: connects the household and shows the app, nothing else', () => {
  const r = run(false, false);
  assert(r.log.includes('connectHH h1') && r.log.includes('app-hide') && !r.log.includes('showPIN'));
  assert(r.out.startsWith('undefined'), 'must return without falling through to the Welcome screen');
});
test('PIN set: shows the PIN screen with the household waiting, app stays hidden', () => {
  const r = run(false, true);
  assert(r.log.includes('showPIN') && r.log.includes('app+hide') && !r.log.some((l) => l.startsWith('connectHH')));
  assert(r.out === 'undefined|h1|check', 'got ' + r.out);
});
test('switch on: falls through to the old Welcome screen untouched', () => {
  const r = run(true, true);
  assert(r.out.startsWith('fell-through') && r.log.length === 0);
});

console.log(passed + ' passed');
