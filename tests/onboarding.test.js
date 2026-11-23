// Guards the first-visit experience (v9.21.7): the welcome screen is not blocked by the boot splash, a saved session still
// restores, password hints stay quiet until someone types, and the trial wording matches the real offer.
// Run: node tests/onboarding.test.js
const fs = require('fs'), path = require('path'), assert = require('assert'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html'), auth = read('js/04-auth.js'), guest = read('js/12a-guest.js'), hh = read('js/05-household.js'),
  boot = read('js/13-actions-boot.js'), chat = read('js/12-chat.js'), premium = read('js/11-premium.js'), legal = read('js/10-legal.js'),
  worker = read('pay-worker/src/households.js');
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + ' :: ' + e.message); process.exitCode = 1; } }

test('the boot splash watches the whole page (it starts before the screens exist, so a fixed element list stays empty and it would only leave after 9 s)', () => {
  assert(/observer\.observe\(document\.body,\s*\{[^}]*subtree:\s*true/.test(html), 'splash observer must observe document.body with subtree:true');
  assert(!/els\(\)\.forEach\(function\(el\)\{ observer\.observe/.test(html), 'the old element-list observer is back');
});
test('a first-time visitor gets the welcome screen straight away, with a small note instead of a blocking splash', () => {
  const m = /EARLY WELCOME[\s\S]*?<\/script>/.exec(html); assert(m, 'early-welcome script missing');
  const s = m[0];
  assert(/nb_seen_auth/.test(s) && /nb_household/.test(s) && /join=/.test(s), 'must skip returning visitors and invite links');
  assert(/scr-guest-entry/.test(s) && /classList\.remove\('hide'\)/.test(s) && /boot-splash/.test(s));
  assert(/id="lp-checking"/.test(html) && /role="status"/.test(html.match(/<p[^>]*id="lp-checking"[^>]*>/)[0]));
  assert(html.indexOf('EARLY WELCOME') > html.indexOf('id="scr-guest-entry"'), 'script must come after the screen it reveals');
});
test('taps before the app has loaded are remembered and run once it is ready', () => {
  assert(/_runQueuedTap/.test(html) && /_runQueuedTap/.test(boot));
  assert(boot.indexOf('bootApp();') < boot.indexOf('_runQueuedTap'), 'queued tap must run after bootApp()');
  ['guestOpenDemo', 'guestGoAuth', 'guestToggleLang'].forEach((n) => assert(new RegExp('function ' + n + '\\(').test(guest), n + ' must still be a real function in js/12a-guest.js'));
});
test('session restore is untouched and the demo is not closed by the "nobody is signed in" answer', () => {
  assert(/auth\.onAuthStateChanged/.test(hh) && /guestNoteSignedIn\(\)/.test(hh) && /guestRoute\(\)/.test(hh));
  assert(/isGuestMode/.test(hh.slice(hh.indexOf('curUser=null;'), hh.indexOf('curUser=null;') + 400)), 'signed-out branch must keep an open demo on screen');
  assert(/lp-checking/.test(guest), 'the note must be hidden when the answer arrives');
});

// password hints, run for real against a tiny fake page
function world() {
  const els = {};
  const mk = (id, extra) => (els[id] = Object.assign({ id, style: {}, value: '', textContent: '', attrs: {}, dataset: {}, classList: { hide: false, toggle(c, on) { this.hide = !!on; }, add() { this.hide = true; }, remove() { this.hide = false; }, contains() { return this.hide; } }, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } }, extra));
  ['pw-reqs', 'a-pw', 'a-pw2', 'a-em-btn', 'req-len', 'req-space', 'req-match', 'req-len-ico', 'req-space-ico', 'req-match-ico', 'req-len-txt'].forEach((i) => mk(i));
  els['a-em-btn'].dataset.mode = 'register'; els['pw-reqs'].style.display = 'none';
  const sb = { g: (id) => els[id] || null, L: (en) => en, window: {}, console };
  vm.createContext(sb);
  const src = auth.slice(auth.indexOf('function pwProblems'), auth.indexOf('function aTab'));
  vm.runInContext(src, sb);
  return { els, sb };
}
test('password hints: nothing before typing, neutral while typing, marked only after a failed submit', () => {
  const w = world(), run = (a, b, c) => vm.runInContext('validatePwReqs(null,false,' + c + ')', w.sb);
  run(0, 0, false); assert.strictEqual(w.els['pw-reqs'].style.display, 'none', 'untouched: box must stay hidden');
  w.els['a-pw'].value = 'ab'; run(0, 0, false);
  assert.strictEqual(w.els['pw-reqs'].style.display, 'flex'); assert.strictEqual(w.els['req-len-ico'].attrs['data-lucide'], 'circle', 'typing: neutral icon, not a cross');
  assert(/4 more characters/.test(w.els['req-len-txt'].textContent));
  w.els['a-pw'].value = 'abcdef'; run(0, 0, false); assert.strictEqual(w.els['req-len-ico'].attrs['data-lucide'], 'check-circle');
  w.els['a-pw'].value = 'abc'; run(0, 0, true); assert.strictEqual(w.els['req-len-ico'].attrs['data-lucide'], 'x-circle', 'failed submit marks the unmet row');
});
test('password problems are specific and actionable, in the order a person fixes them', () => {
  const w = world(), p = (a, b, s) => JSON.parse(vm.runInContext('JSON.stringify(pwProblems(' + JSON.stringify(a) + ',' + JSON.stringify(b) + ',' + !!s + '))', w.sb));
  assert.deepStrictEqual(p('abcdef', 'abcdef', true), []);
  assert(/Add 3 more characters/.test(p('abc', 'abc', true)[0].en));
  assert(/Add 1 more character /.test(p('abcde', 'abcde', true)[0].en));
  assert(/space/.test(p(' abcdef', ' abcdef', true)[0].en));
  assert(/not the same/.test(p('abcdef', 'abcdeX', true)[0].en));
  assert(/Confirm box/.test(p('abcdef', '', true)[0].en), 'empty confirm on submit');
  assert.deepStrictEqual(p('abcdef', '', false), [], 'an empty confirm is not an error while typing');
  assert(p('abc', 'abc', true).every((x) => x.cw && x.en));
});
test('sign-up only: the trial note shows on the sign-up tab, hints and note are hidden on sign-in', () => {
  assert(/id="a-trial"[^>]*class="hide"/.test(html));
  assert(/classList\.toggle\('hide',!isReg\)/.test(auth.slice(auth.indexOf('Trial note'))));
  assert(/new-password/.test(auth));
});

// the trial wording must describe what the code really does
test('trial wording matches the real offer: 14 days, one per account, starts with the first household, no payment to start', () => {
  assert(/TRIAL_DAYS = 14/.test(premium), 'trial length changed in the app: update every "14 days" text');
  assert(/trialClaimedAt/.test(worker) && /trial = !ud\.trialClaimedAt/.test(worker), 'the Worker no longer gives one trial per account: update the wording');
  assert(/first household you create/.test(legal));
  const note = /id="a-trial"[^>]*>([^<]*)</.exec(html)[1];
  assert(/14 days of Premium free/.test(note) && /No payment needed to start/.test(note) && /nothing is charged automatically/.test(note));
  assert(/No payment needed/.test(guest) && !/Start free trial/.test(guest + html), 'tour/sheets must not promise a trial starts at signup');
  assert(/Create free account/.test(guest));
});
test('the Bajeti AI lock screen does not promise a free trial that may already be used', () => {
  const t = chat.slice(chat.indexOf('Free households do not get Bajeti AI'), chat.indexOf('Free households do not get Bajeti AI') + 1500);
  assert(!/free trial/i.test(t) && /Upgrade to Premium/.test(t));
});
console.log(passed + ' passed');
