// pay-worker/dist/worker.js is the file that gets pasted into Cloudflare, so it has to match the source in pay-worker/src.
// Rebuild it from the source (never patch it by hand). This catches a stale or hand-edited bundle.
//   - fetch must be called without a `this` ("(0, this.fetchImpl)(...)"). Called as a method, Cloudflare throws
//     "Illegal invocation" and no payment can start.
//   - the bundle must carry the current Premium logic from src/logic.js.
const fs = require('fs');
const dist = fs.readFileSync(__dirname + '/../pay-worker/dist/worker.js', 'utf8');
const src = fs.readFileSync(__dirname + '/../pay-worker/src/firestore.js', 'utf8');
let failed = 0;
function check(name, ok) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failed++; }
check('source calls fetch without a this', src.includes('(0, this.fetchImpl)(url'));
check('dist never calls fetch as a method (this.fetchImpl(url)', !/this\.fetchImpl\(url/.test(dist));
check('dist calls fetch without a this', dist.includes('(0, this.fetchImpl)(url'));
check('dist has the current Premium logic (currentPremium)', dist.includes('function currentPremium('));
process.exit(failed ? 1 : 0);
