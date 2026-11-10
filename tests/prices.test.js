// Checks that the Premium prices shown in the app (PLANS in js/01-constants.js) are the ones the payments function
// charges (PRICES in functions/lib.js). Run: node tests/prices.test.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const consts = fs.readFileSync(path.join(root, 'js/01-constants.js'), 'utf8');
const m = /const PLANS\s*=\s*(\{[\s\S]*?\});/.exec(consts);
if (!m) { console.error('FAIL could not find PLANS in js/01-constants.js'); process.exit(1); }
const PLANS = new Function('return ' + m[1])();
const { PRICES } = require(path.join(root, 'functions/lib.js'));
let bad = 0;
for (const months of new Set([...Object.keys(PLANS), ...Object.keys(PRICES)])) {
  const a = PLANS[months] && PLANS[months].price, b = PRICES[months];
  if (a !== b) { bad++; console.log('FAIL', months + ' month(s): app shows', a, 'but the server charges', b); }
  else console.log('PASS', months + ' month(s): MK', a);
}
// No price literals should be left behind in the premium screens.
const prem = fs.readFileSync(path.join(root, 'js/11-premium.js'), 'utf8');
// Looks for the old prices written as money ("MK 2,500", "2500 kwacha", price: 7000), not for any 2500 (a 2.5 s timer is fine).
const OLD_PRICE = /MK\s*(2,?500|7,?000)\b|\b(2,?500|7,?000)\s*(MK|kwacha)\b|price\s*[:=]\s*(2500|7000)\b/i;
if (OLD_PRICE.test(prem.replace(/\/\/.*$/gm, ''))) { bad++; console.log('FAIL js/11-premium.js still has a hard-coded price'); }
else console.log('PASS no hard-coded prices in js/11-premium.js');
process.exit(bad ? 1 : 0);
