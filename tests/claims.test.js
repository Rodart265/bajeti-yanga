// Checks the "make the claims true" changes on the app side: Premium-only AI, households made by the Worker, real push
// notifications (permission timing, registration, service worker), 30-day trash, slower polling, privacy wording.
// Run: node tests/claims.test.js
const fs = require('fs'), path = require('path'), assert = require('assert'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html'), consts = read('js/01-constants.js'), chat = read('js/12-chat.js'), boot = read('js/13-actions-boot.js'),
  prem = read('js/11-premium.js'), hh = read('js/05-household.js'), legal = read('js/10-legal.js'), sw = read('sw.js'),
  rules = read('firestore.rules'), render = read('js/07-render.js'), hist = read('js/08-history-summary.js');
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + ' :: ' + e.message); process.exitCode = 1; } }
const slice = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert(i > -1 && j > i, 'cannot find ' + a); return src.slice(i, j); };

test('Bajeti AI is called on the payments Worker, not the old nyumba-ai Worker', () => {
  assert(/const AI_URL = 'https:\/\/bajeti-pay\.kabangorodrick6\.workers\.dev\/chat'/.test(consts));
  assert(!/nyumba-ai/.test(consts + html + sw), 'the old Worker address is still referenced');
});
test('free AI limits are gone from the app (the server decides, Premium only)', () => {
  assert(!/FREE_DAILY_|incAiUsageTodayFS|getAiUsageTodayFS|msgCount|magicCount|scanCount|summCount/.test(chat), 'old free-tier counters remain in js/12-chat.js');
  ['sendChat', 'scanReceipt', 'generateAiSummary', 'openMagicLog', 'processMagicLog'].forEach((fn) => {
    const at = chat.indexOf('function ' + fn + '(');
    if (at < 0) return;   // a function that does not exist has nothing to guard
    assert(/aiPremiumGate\(/.test(chat.slice(at, at + 1200)), fn + ' does not check Premium first');
  });
  assert(/function rChat\(\)\{[\s\S]{0,200}!getPremiumStatus\(\)\.isPremium/.test(chat), 'the chat screen does not lock for free households');
});
test('a "Premium required" answer from the server becomes a clear message, not "sign in again"', () => {
  const code = slice(boot, 'function _aiHttpErr', 'function openPxM');
  const sb = { }; vm.createContext(sb); vm.runInContext(code + ';this._aiHttpErr=_aiHttpErr;this.aiFailMessage=aiFailMessage;', sb);
  const e = sb._aiHttpErr({ status: 403 }, { error: { code: 'premium_required', message: 'x' } });
  assert.strictEqual(e.aiCode, 'premium');
  assert(/Premium/.test(sb.aiFailMessage(e, false)) && /Premium/.test(sb.aiFailMessage(e, true)));
  assert.strictEqual(sb._aiHttpErr({ status: 403 }, { error: { code: 'other' } }).aiCode, 'auth');
  assert.strictEqual(sb._aiHttpErr({ status: 429 }, { error: { code: 'quota_exceeded' } }).aiCode, 'quota');
  assert.strictEqual(sb._aiHttpErr({ status: 503 }, { error: { code: 'busy' } }).aiCode, undefined);
});

test('households are created by the Worker, and the rules no longer allow the browser to', () => {
  const create = slice(hh, 'async function createHH()', '\n// Restores the waiting');
  assert(/_createHouseholdOnServer\(/.test(create) && !/collection\('households'\)\.doc\(code\)\s*\.set/.test(hh));
  assert(/action:'createHousehold'/.test(hh));
  assert(!/_newHouseholdDoc/.test(prem + hh), 'the old browser-side builder is still there');
  assert(/match \/households\/\{hhId\} \{[\s\S]*?allow create: if false;/.test(rules), 'firestore.rules still lets the browser create households');
});
test('household creation errors are explained (limit, verify e-mail, offline)', () => {
  const fn = slice(hh, 'function _createHHErr', 'function _householdCreated');
  const sb = { lang: 'en', HOUSEHOLD_LIMITS: { free: 3 }, setTimeout() {}, showPremiumPage() {} }; vm.createContext(sb);
  vm.runInContext(fn + ';this.f=_createHHErr;', sb);
  assert(/3 households/.test(sb.f({ message: 'household_limit', status: 403 })));
  assert(/verify/i.test(sb.f({ message: 'verify_email', status: 403 })));
  assert(/internet/i.test(sb.f({ message: 'Failed to fetch' })));
  sb.lang = 'cw'; assert(/nyumba/.test(sb.f({ message: 'household_limit' })));
});

test('push: public key set, messaging library loaded, service worker shows pushes and handles taps', () => {
  assert(prem.includes("const FCM_VAPID = 'BGcQxZ0Q7pQdvs5oordaGIVU-vsEmvYoXAg1Wyc5LRkQb2rpDCh5LWdPSwj6_-8-4X3dnpJTn7FFjflwpngcA7c'"));
  assert(html.includes('firebase-messaging-compat.js') && sw.includes('firebase-messaging-compat.js'));
  assert(/addEventListener\("push"/.test(sw) && /showNotification\(/.test(sw) && /addEventListener\("notificationclick"/.test(sw));
  assert(/Content-Security-Policy[^>]*connect-src[^>]*googleapis\.com/.test(html), 'CSP must allow *.googleapis.com for Firebase messaging');
});
test('push: permission is asked right after the first bill is saved (and never 8 seconds after start)', () => {
  assert(!/setTimeout\(requestPushPermission/.test(boot), 'startup still asks for permission');
  assert(/if\(!editing\) setTimeout\(offerBillReminders/.test(hist), 'saving a new bill does not offer reminders');
  assert(/Notification\.permission==='granted'\) setupFCMToken/.test(boot), 'an already-allowed phone is not kept registered');
});
test('push: every question has English and Chichewa wording, and asking happens once', () => {
  const m = prem.match(/const PUSH_ASK = (\{[\s\S]*?\n\});/); assert(m, 'PUSH_ASK missing');
  const ask = vm.runInNewContext('(' + m[1] + ')');
  ['bill', 'join-owner', 'join-reply'].forEach((k) => { assert(ask[k] && ask[k].length === 4 && ask[k].every((x) => x && x.length > 10), k + ' incomplete'); });
  const calls = [], store = {}; 
  const sb = { PUSH_ASK: ask, Notification: { permission: 'default' }, navigator: { serviceWorker: {} }, window: { }, localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    appConfirm: (...a) => calls.push(a), L: (e) => e, g: () => ({}), lucide: null, requestPushPermission() {} };
  sb.window.Notification = sb.Notification; vm.createContext(sb);
  vm.runInContext(slice(prem, 'function offerPush(kind){', 'function offerBillReminders') + ';this.offerPush=offerPush;', sb);
  sb.offerPush('bill'); sb.offerPush('bill'); sb.offerPush('join-owner');
  assert.strictEqual(calls.length, 1, 'asked ' + calls.length + ' times');
  sb.Notification.permission = 'granted'; store.nb_push_asked = ''; sb.offerPush('bill');
  assert.strictEqual(calls.length, 1, 'asks again although already allowed');
});
test('push: the Worker is told after a join request and after an approval; the phone is unregistered on sign-out', () => {
  assert(/notifyViaWorker\(\{type:'join-request', householdId:code\}\)/.test(hh));
  assert(/notifyViaWorker\(\{type:'join-approved', householdId:hhId, uid:uid\}\)/.test(prem));
  assert(/deleteToken\(\)/.test(read('js/06-chipereganyu.js')));
  assert(/offerPush\('join-owner'\)/.test(render) && /offerPush\('join-reply'\)/.test(hh));
});
test('push: registration saves tokens in the household and in the person\'s own document', () => {
  const body = slice(prem, 'async function setupFCMToken', '// Asks the Worker to send');
  assert(/pushTokens\.'\+uid/.test(body) && /collection\('users'\)\.doc\(uid\)/.test(body) && /pushLang/.test(body));
  assert(/slice\(-3\)/.test(body), 'tokens are not capped');
});

test('reads: Trash only reads the last 30 days, approval polling is every 15 seconds', () => {
  assert(/where\('deletedAt','>=',trashSince\)/.test(hh) && !/where\('deleted','==',true\)/.test(hh));
  assert(!/setTimeout\((_poll|pollForApproval), 5000\)/.test(hh));
  assert(/MAX_POLLS = 40/.test(hh) && /MAX_P = 40/.test(hh));
});

test('wording: privacy policy and FAQ say what the app now does', () => {
  assert(/Authorised Bajeti Yanga staff may view account and household information when needed to provide support and keep the service running\./.test(legal));
  assert(!/free accounts get 5 uses/i.test(legal) && !/Free accounts get 5 uses a day/.test(legal), 'the old free-AI limit text remains');
  assert(/Each account gets one 14-day free trial/.test(legal));
  assert(/permanently erased/.test(legal) && /Last updated: November 2026/.test(legal));
});

console.log('\n' + passed + ' passed');
