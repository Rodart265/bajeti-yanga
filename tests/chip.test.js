// Checks the pure Chipereganyu helpers in js/06-chipereganyu.js: due dates, overdue days, laps, the next recipient and the
// money maths of a round. (The screens and Firestore calls are not covered here.)
// Run with:  node tests/chip.test.js      (no packages needed)
const fs = require('fs'), path = require('path'), assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', '06-chipereganyu.js'), 'utf8');
const start = src.indexOf('// >>> chip pure helpers');
const end = src.indexOf('// <<< end chip pure helpers <<<');
assert(start > -1 && end > start, 'could not find the pure helper block in js/06-chipereganyu.js');
const H = new Function(src.slice(start, end) + '\nreturn {chipDaysBetween,chipAddDays,chipMonthDate,chipFirstDue,chipNextDue,chipOverdueDays,chipLapInfo,chipNextRecipient,chipRoundSummary};')();

let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS ' + name); } catch (e) { console.log('FAIL ' + name + ' :: ' + e.message); process.exitCode = 1; } }

// ── dates ──
test('chipDaysBetween counts whole days, including across months and leap years', () => {
  assert.strictEqual(H.chipDaysBetween('2026-11-01', '2026-11-04'), 3);
  assert.strictEqual(H.chipDaysBetween('2028-02-28', '2028-03-01'), 2);
  assert.strictEqual(H.chipDaysBetween('2026-11-04', '2026-11-01'), -3);
});
test('chipMonthDate clamps the day to the end of a short month', () => {
  assert.strictEqual(H.chipMonthDate(2026, 1, 31), '2026-02-28');
  assert.strictEqual(H.chipMonthDate(2028, 1, 31), '2028-02-29');
  assert.strictEqual(H.chipMonthDate(2026, 12, 15), '2027-01-15');
});
test('chipFirstDue monthly: this month if the pay day is still ahead, today included, else next month', () => {
  assert.strictEqual(H.chipFirstDue('monthly', 25, '2026-11-04'), '2026-11-25');
  assert.strictEqual(H.chipFirstDue('monthly', 4, '2026-11-04'), '2026-11-04');
  assert.strictEqual(H.chipFirstDue('monthly', 3, '2026-11-04'), '2026-12-03');
  assert.strictEqual(H.chipFirstDue('monthly', 31, '2026-02-10'), '2026-02-28');
});
test('chipFirstDue weekly lands on the chosen weekday (0=Sunday)', () => {
  // 2026-11-04 is a Wednesday
  assert.strictEqual(H.chipFirstDue('weekly', 5, '2026-11-04'), '2026-11-06');
  assert.strictEqual(H.chipFirstDue('weekly', 3, '2026-11-04'), '2026-11-04');
  assert.strictEqual(H.chipFirstDue('weekly', 1, '2026-11-04'), '2026-11-09');
});
test('chipFirstDue without a pay day keeps the old behaviour (a month or a week from today)', () => {
  assert.strictEqual(H.chipFirstDue('monthly', null, '2026-01-31'), '2026-02-28');
  assert.strictEqual(H.chipFirstDue('weekly', undefined, '2026-11-04'), '2026-11-11');
});
test('chipNextDue steps from the previous due date, not from the day it was confirmed', () => {
  assert.strictEqual(H.chipNextDue('monthly', '2026-11-25', 25, '2026-11-27'), '2026-12-25');
  assert.strictEqual(H.chipNextDue('weekly', '2026-11-06', 5, '2026-11-08'), '2026-11-13');
});
test('chipNextDue keeps the pay day after a short month', () => {
  assert.strictEqual(H.chipNextDue('monthly', '2026-02-28', 31, '2026-03-01'), '2026-03-31');
});
test('chipNextDue skips dates already in the past after a very late confirmation', () => {
  assert.strictEqual(H.chipNextDue('monthly', '2026-09-25', 25, '2026-11-27'), '2026-12-25');
  assert.strictEqual(H.chipNextDue('weekly', '2026-10-02', 5, '2026-11-04'), '2026-11-06');
});
test('chipNextDue for an older circle without a pay day uses the previous due date’s day', () => {
  assert.strictEqual(H.chipNextDue('monthly', '2026-11-17', null, '2026-11-18'), '2026-12-17');
});
test('chipOverdueDays is 0 on the due date and counts days after it', () => {
  assert.strictEqual(H.chipOverdueDays('2026-11-04', '2026-11-04'), 0);
  assert.strictEqual(H.chipOverdueDays('2026-11-04', '2026-11-03'), 0);
  assert.strictEqual(H.chipOverdueDays('2026-11-04', '2026-11-09'), 5);
  assert.strictEqual(H.chipOverdueDays(null, '2026-11-09'), 0);
});

// ── laps ──
const hist = (...r) => r.map((u, i) => ({ cycleNumber: i + 1, recipientUid: u, amount: 100, date: '2026-01-01' }));
test('chipLapInfo: a fresh circle is lap 1 with nobody received yet', () => {
  const i = H.chipLapInfo({ history: [], currentCycle: { cycleNumber: 1, recipientUid: 'A' } });
  assert.strictEqual(i.lap, 1); assert.deepStrictEqual(i.receivedThisLap, []);
});
test('chipLapInfo: older entries without a lap are split into laps when a recipient comes round again', () => {
  const g = { history: hist('A', 'B', 'C', 'D', 'A'), currentCycle: { cycleNumber: 6, recipientUid: 'B' } };
  const i = H.chipLapInfo(g);
  assert.deepStrictEqual(i.entries.map(e => e.lap), [1, 1, 1, 1, 2]);
  assert.strictEqual(i.lap, 2);
  assert.deepStrictEqual(i.receivedThisLap, ['A']);
});
test('chipLapInfo: the current recipient already seen in the last lap means a new lap has begun', () => {
  const g = { history: hist('A', 'B', 'C'), currentCycle: { cycleNumber: 4, recipientUid: 'A' } };
  assert.strictEqual(H.chipLapInfo(g).lap, 2);
  assert.deepStrictEqual(H.chipLapInfo(g).receivedThisLap, []);
});
test('chipLapInfo trusts an explicit lap on entries and on the current round', () => {
  const g = { history: [{ cycleNumber: 1, lap: 1, recipientUid: 'A' }, { cycleNumber: 2, lap: 1, recipientUid: 'B' }, { cycleNumber: 3, lap: 2, recipientUid: 'A' }], currentCycle: { cycleNumber: 4, lap: 2, recipientUid: 'B' } };
  const i = H.chipLapInfo(g);
  assert.strictEqual(i.lap, 2); assert.deepStrictEqual(i.receivedThisLap, ['A']);
});
test('chipLapInfo: a completed circle (no current round) reports its last lap', () => {
  const g = { history: [{ cycleNumber: 1, lap: 1, recipientUid: 'A' }, { cycleNumber: 2, lap: 1, recipientUid: 'B' }], currentCycle: null };
  const i = H.chipLapInfo(g);
  assert.strictEqual(i.lap, 1); assert.deepStrictEqual(i.receivedThisLap, ['A', 'B']);
});
test('chipNextRecipient follows the rotation order and skips anyone who has received this lap', () => {
  const g = { rotationOrder: ['A', 'B', 'C'], history: hist('A'), currentCycle: { cycleNumber: 2, recipientUid: 'B' } };
  assert.strictEqual(H.chipNextRecipient(g, H.chipLapInfo(g)), 'C');
});
test('chipNextRecipient respects a reordered rotation', () => {
  const g = { rotationOrder: ['A', 'C', 'B'], history: hist('A'), currentCycle: { cycleNumber: 2, recipientUid: 'C' } };
  assert.strictEqual(H.chipNextRecipient(g, H.chipLapInfo(g)), 'B');
});
test('chipNextRecipient is null on the last turn of a lap (the lap is complete)', () => {
  const g = { rotationOrder: ['A', 'B', 'C'], history: hist('A', 'B'), currentCycle: { cycleNumber: 3, recipientUid: 'C' } };
  assert.strictEqual(H.chipNextRecipient(g, H.chipLapInfo(g)), null);
});
test('chipNextRecipient ignores someone who received and then left', () => {
  const g = { rotationOrder: ['B', 'C'], history: hist('A'), currentCycle: { cycleNumber: 2, recipientUid: 'B' } };
  assert.strictEqual(H.chipNextRecipient(g, H.chipLapInfo(g)), 'C');
});

// ── round money ──
const mk = (extra) => Object.assign({ contributionAmount: 5000, rotationOrder: ['R', 'A', 'B', 'C'],
  currentCycle: { cycleNumber: 1, recipientUid: 'R', amount: 15000, dueDate: '2026-11-25',
    contributions: { A: { paid: false }, B: { paid: false }, C: { paid: false } } } }, extra || {});
test('chipRoundSummary: nothing confirmed yet', () => {
  const s = H.chipRoundSummary(mk());
  assert.strictEqual(s.collected, 0); assert.strictEqual(s.expected, 15000);
  assert.strictEqual(s.pending.length, 3); assert.strictEqual(s.allReceived, false); assert.strictEqual(s.pct, 0);
});
test('chipRoundSummary: "sent" is not money collected until the receiver confirms', () => {
  const g = mk(); g.currentCycle.contributions.A = { paid: false, sent: true }; g.currentCycle.contributions.B = { paid: true };
  const s = H.chipRoundSummary(g);
  assert.strictEqual(s.collected, 5000); assert.deepStrictEqual(s.sent, ['A']); assert.deepStrictEqual(s.received, ['B']); assert.deepStrictEqual(s.pending, ['C']);
  assert.strictEqual(s.outstanding, 10000);
});
test('chipRoundSummary: everyone confirmed', () => {
  const g = mk(); ['A', 'B', 'C'].forEach(u => g.currentCycle.contributions[u] = { paid: true });
  const s = H.chipRoundSummary(g);
  assert.strictEqual(s.allReceived, true); assert.strictEqual(s.collected, 15000); assert.strictEqual(s.pct, 1); assert.strictEqual(s.goneUnpaid, 0);
});
test('chipRoundSummary: a member who left before paying makes the round short for good', () => {
  const g = mk({ rotationOrder: ['R', 'A', 'B'] }); delete g.currentCycle.contributions.C;
  g.currentCycle.contributions.A = { paid: true }; g.currentCycle.contributions.B = { paid: true };
  const s = H.chipRoundSummary(g);
  assert.strictEqual(s.allReceived, true);            // the remaining members have all paid, so the round can be confirmed...
  assert.strictEqual(s.collected, 10000);              // ...but only MK10,000 of MK15,000 was collected
  assert.strictEqual(s.goneUnpaid, 1); assert.strictEqual(s.shortAmount, 5000);
  assert.strictEqual(s.pct, 10000 / 15000);
});
test('chipRoundSummary: a member who paid and then left still counts toward the money collected', () => {
  const g = mk({ rotationOrder: ['R', 'A', 'B'] }); delete g.currentCycle.contributions.C;
  g.currentCycle.contributions.A = { paid: true }; g.currentCycle.contributions.B = { paid: true };
  g.currentCycle.departedPaid = { C: { name: 'Chikondi', paid: true } };
  const s = H.chipRoundSummary(g);
  assert.strictEqual(s.collected, 15000); assert.strictEqual(s.goneUnpaid, 0); assert.strictEqual(s.shortAmount, 0);
});
test('chipRoundSummary returns null when there is no current round', () => assert.strictEqual(H.chipRoundSummary({ currentCycle: null }), null));

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
