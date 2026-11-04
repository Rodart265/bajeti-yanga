// Stamps sw.js for a release. Run before every deploy:   node tools/release.js
//   - sets V in sw.js from APP_VERSION (js/01-constants.js)
//   - sets BUILD in sw.js to a fingerprint of every file listed in APP_SHELL
// Because BUILD changes whenever any shipped file changes, sw.js changes too, and that is what makes phones
// download the new release. tests/release.test.js fails if this step was forgotten.
//   node tools/release.js --check    only reports; exits 1 if sw.js is out of date (used by the test)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f));

function appVersion() {
  const m = /const APP_VERSION\s*=\s*'([^']+)'/.exec(read('js/01-constants.js').toString('utf8'));
  if (!m) throw new Error("Could not find APP_VERSION in js/01-constants.js");
  return m[1];
}
function shellList(sw) {
  const m = /const APP_SHELL\s*=\s*\[([\s\S]*?)\];/.exec(sw);
  if (!m) throw new Error("Could not find APP_SHELL in sw.js");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}
function fingerprint(files) {
  const h = crypto.createHash('sha256');
  for (const f of files) {
    if (f === './') continue; // the folder itself is index.html
    h.update(f + '\0'); h.update(read(f.replace(/^\.\//, ''))); h.update('\0');
  }
  return h.digest('hex').slice(0, 12);
}
function expected() {
  const sw = read('sw.js').toString('utf8');
  const files = shellList(sw);
  return { sw, files, version: appVersion(), build: fingerprint(files) };
}
module.exports = { expected, appVersion, shellList, fingerprint };

if (require.main === module) {
  const { sw, version, build } = expected();
  const next = sw
    .replace(/const V = "[^"]*";/, 'const V = "bajeti-v' + version + '";')
    .replace(/const BUILD = "[^"]*";/, 'const BUILD = "' + build + '";');
  if (process.argv.includes('--check')) {
    if (next !== sw) { console.log('sw.js is out of date: run  node tools/release.js'); process.exit(1); }
    console.log('sw.js is up to date (v' + version + ', build ' + build + ')');
  } else if (next === sw) {
    console.log('Nothing to change: sw.js already matches v' + version + ' (build ' + build + ')');
  } else {
    fs.writeFileSync(path.join(root, 'sw.js'), next);
    console.log('sw.js stamped: v' + version + ', build ' + build + '. Now run: node tests/release.test.js');
  }
}
