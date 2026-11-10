// Every text the screens read with tx().name must exist in BOTH languages (TX.en and TX.cw in js/01-constants.js).
// A missing one is undefined, and using it (tx().name.something) stops the screen from drawing at all.
// Run: node tests/translations.test.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const consts = fs.readFileSync(path.join(root, 'js/01-constants.js'), 'utf8');
const start = consts.indexOf('const TX = {');
let depth = 0, end = -1;
for (let i = consts.indexOf('{', start); i < consts.length; i++) {
  if (consts[i] === '{') depth++;
  else if (consts[i] === '}' && --depth === 0) { end = i + 1; break; }
}
const TX = new Function('return ' + consts.slice(consts.indexOf('{', start), end))();
const used = new Map();
for (const f of fs.readdirSync(path.join(root, 'js')).filter((n) => n.endsWith('.js'))) {
  const s = fs.readFileSync(path.join(root, 'js', f), 'utf8');
  for (const m of s.matchAll(/\btx\(\)\.([A-Za-z_]\w*)/g)) if (!used.has(m[1])) used.set(m[1], f);
}
let bad = 0;
for (const [key, file] of used) {
  for (const lang of Object.keys(TX)) {
    if (TX[lang][key] === undefined) { bad++; console.log('FAIL tx().' + key + ' (' + file + ') is missing from TX.' + lang); }
  }
}
if (!bad) console.log('PASS all ' + used.size + ' tx().<name> texts exist in ' + Object.keys(TX).join(' and '));
process.exit(bad ? 1 : 0);
