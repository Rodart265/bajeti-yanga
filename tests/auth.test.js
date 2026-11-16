// Checks the sign-in cleanup: phone sign-in is gone, Google and email stay, and the reset / verification emails
// send people back to the app, with a plain fallback if Firebase does not accept the address.
// Run: node tests/auth.test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html'), auth = read('js/04-auth.js'), consts = read('js/01-constants.js'),
  legal = read('js/10-legal.js'), settings = read('js/09-settings.js');

let passed = 0;
const pending = [];
function test(name, fn) {
  const ok = () => { passed++; console.log('PASS ' + name); };
  const bad = (e) => { console.log('FAIL ' + name + ' :: ' + e.message); process.exitCode = 1; };
  try { const r = fn(); if (r && typeof r.then === 'function') pending.push(r.then(ok, bad)); else ok(); } catch (e) { bad(e); }
}

test('no phone sign-in left in the page', () => {
  ['mt-ph', 'a-ph-p', 'a-ph-s1', 'a-ph-s2', 'recaptcha-container', 'sendOTP', 'vfyOTP', 'backPh', 'ob0', 'method-tabs'].forEach((k) =>
    assert(!html.includes(k), 'index.html still mentions ' + k));
});
test('no phone sign-in left in the code', () => {
  ['sendOTP', 'vfyOTP', 'backPh', 'otpN', 'aMethod', 'signInWithPhoneNumber', 'RecaptchaVerifier'].forEach((k) =>
    assert(!auth.includes(k), 'js/04-auth.js still mentions ' + k));
  assert(!/rcapV|confResult/.test(consts), 'unused phone globals remain in js/01-constants.js');
});
test('email form and Google button are still on the sign-in screen', () => {
  assert(html.includes('id="a-em-btn"') && html.includes('onclick="doGoogle()"') && html.includes('id="a-em-p"'));
});
test('Privacy policy no longer says phone number', () => assert(!/phone number or email/i.test(legal)));

// Pull the helper out and run it against stand-ins.
const a0 = auth.indexOf('function _authEmailSettings(){'), a1 = auth.indexOf('function showFgt(s){');
assert(a0 > -1 && a1 > a0, 'could not find the email helper in js/04-auth.js');
const helper = auth.slice(a0, a1);

function run(failWith) {
  const calls = [];
  const send = (kind) => (arg, opts) => { calls.push({ kind, opts: kind === 'reset' ? opts : arg }); const o = kind === 'reset' ? opts : arg; return (o && failWith) ? Promise.reject({ code: failWith }) : Promise.resolve('ok'); };
  const env = { APP_BASE_URL: 'https://app.example/', auth: { sendPasswordResetEmail: send('reset') }, console: { error() {} } };
  const user = { sendEmailVerification: send('verify') };
  const fn = new Function(...Object.keys(env), helper + '; return _sendAuthEmail;');
  return { go: fn(...Object.values(env)), calls, user };
}

test('reset email asks Firebase to return people to the app', async () => {
  const r = run(null); await r.go('reset', null, 'a@b.c');
  assert.strictEqual(r.calls.length, 1);
  assert.strictEqual(r.calls[0].opts.url, 'https://app.example/');
});
test('verification email asks Firebase to return people to the app', async () => {
  const r = run(null); await r.go('verify', r.user);
  assert.strictEqual(r.calls[0].opts.url, 'https://app.example/');
});
test('an address Firebase does not accept falls back to the plain email', async () => {
  const r = run('auth/unauthorized-continue-uri'); await r.go('reset', null, 'a@b.c');
  assert.strictEqual(r.calls.length, 2);
  assert.strictEqual(r.calls[1].opts, undefined);
});
test('any other error is passed on, not hidden', async () => {
  const r = run('auth/too-many-requests');
  await assert.rejects(r.go('verify', r.user), (e) => e.code === 'auth/too-many-requests');
  assert.strictEqual(r.calls.length, 1);
});

test('the verify screen says so when the first email failed', () => {
  assert(/function showVerifyScreen\(email, sendErr\)/.test(auth) && auth.includes('could not send the verification email'));
  assert(auth.includes('showVerifyScreen(email, r.sendErr)'));
});
test('reset message mentions the 1 hour limit, in English and Chichewa', () => {
  assert(auth.includes('The link works for about 1 hour') && auth.includes('ola limodzi'));
  assert(settings.includes('about 1 hour') && settings.includes('fmtAErr(e.code,e)'));
});

Promise.all(pending).then(() => console.log(passed + ' passed' + (process.exitCode ? ' (with failures)' : '')));
