// Checks a release is consistent before you deploy it. Run: node tests/release.test.js
// If a check fails, the message says what to do. The usual fix is:  node tools/release.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const { expected } = require(path.join(root, 'tools/release.js'));
let bad = 0;
const ok = (msg) => console.log('PASS', msg);
const no = (msg) => { bad++; console.log('FAIL', msg); };
const check = (cond, good, fail) => (cond ? ok(good) : no(fail));

const { sw, files, version, build } = expected();

// 1. sw.js carries this release's version and fingerprint. A forgotten bump is the one mistake that would
//    leave phones on the old release without any error, so this is the check that matters most.
const V = (/const V = "([^"]*)"/.exec(sw) || [])[1];
const BUILD = (/const BUILD = "([^"]*)"/.exec(sw) || [])[1];
check(V === 'bajeti-v' + version, 'sw.js V matches APP_VERSION (' + version + ')',
  'sw.js V is "' + V + '" but APP_VERSION is ' + version + '. Run: node tools/release.js');
check(BUILD === build, 'sw.js BUILD matches the files (' + build + ')',
  'sw.js BUILD is "' + BUILD + '" but the shipped files give ' + build + ' (a file changed since the last stamp). Run: node tools/release.js');

// 2. Every file the worker saves exists. A typo here would make every install fail, so nobody could update.
const missing = files.filter((f) => f !== './' && !fs.existsSync(path.join(root, f.replace(/^\.\//, ''))));
check(!missing.length, 'every APP_SHELL file exists (' + files.length + ' entries)', 'APP_SHELL lists files that do not exist: ' + missing.join(', '));

// 3. index.html and sw.js agree on the app scripts, in the same order (they share one global scope).
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tags = [...html.matchAll(/<script[^>]*\ssrc="(\.\/js\/[^"]+)"/g)].map((m) => m[1]);
const shellJs = files.filter((f) => /^\.\/js\//.test(f));
check(JSON.stringify(tags) === JSON.stringify(shellJs), 'index.html script tags match APP_SHELL, same order',
  'index.html loads ' + JSON.stringify(tags) + ' but APP_SHELL has ' + JSON.stringify(shellJs));

// 4. Anything else index.html loads from this site is in the worker's list, or it would not work offline.
const local = [...html.matchAll(/(?:href|src)="(\.\/[^"#?]+)"/g)].map((m) => m[1]).filter((u) => !u.endsWith('/'));
const notSaved = [...new Set(local)].filter((u) => !files.includes(u));
check(!notSaved.length, 'every local file index.html loads is in APP_SHELL', 'index.html loads files that are not in APP_SHELL (they will not work offline): ' + notSaved.join(', '));

// 5. version.json: valid, and never ahead of this version (that would lock everyone out of the app).
const num = (s) => String(s).split('.').map((n) => parseInt(n, 10) || 0);
const less = (a, b) => { a = num(a); b = num(b); for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0); return false; };
let vj = null;
try { vj = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8')); } catch (e) { /* reported below */ }
check(vj && /^\d+\.\d+\.\d+$/.test(vj.min || ''), 'version.json is valid ({"min":"' + (vj && vj.min) + '"})', 'version.json is missing or is not {"min":"x.y.z"}');
if (vj && vj.min) check(!less(version, vj.min), 'version.json min (' + vj.min + ') is not ahead of this version (' + version + ')',
  'version.json min ' + vj.min + ' is AHEAD of APP_VERSION ' + version + ': every phone would be told to update to a version that is not there');

// 6. Syntax of the worker (a syntax error means no phone can ever update).
try { new (require('vm').Script)(sw, { filename: 'sw.js' }); ok('sw.js has no syntax errors'); } catch (e) { no('sw.js has a syntax error: ' + e.message); }

// 7. The admin console lives at /admin/ inside this worker's scope. The worker must leave it alone, or it serves
//    the app's index.html there and the console never opens (the app's "didn't finish loading" screen shows instead).
check(/pathname\)\)\s*return;/.test(sw) && /\\\/admin/.test(sw), 'sw.js lets /admin/ through to the network',
  'sw.js does not bypass /admin/: the admin console would show the app boot screen. Keep the /admin/ early return in the fetch handler.');

process.exit(bad ? 1 : 0);
