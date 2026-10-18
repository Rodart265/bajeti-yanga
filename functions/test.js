'use strict';
// Run with:  node functions/test.js   (from the repo root; needs `npm install` inside functions/ first only for index.js,
// lib.js itself has no dependencies). Uses a small in-memory stand-in for Firestore and a scripted PayChangu.
const crypto = require('crypto');
const lib = require('./lib');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => { if (cond) { passed++; console.log('  ok  ', name); } else { failed++; console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); } };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b });

// ── fake Firestore ───────────────────────────────────────────────────────────
const FV = {
  delete: () => ({ __op: 'del' }),
  serverTimestamp: () => ({ __op: 'ts' }),
  arrayRemove: (...a) => ({ __op: 'arrRem', a }),
};
const ts = ms => ({ toMillis: () => ms, _ms: ms });
function makeDb(clock) {
  const cols = {};
  const col = n => (cols[n] = cols[n] || new Map());
  const clone = o => JSON.parse(JSON.stringify(o, (k, v) => (v && v.toMillis ? { __ts: v._ms } : v)), (k, v) => (v && v.__ts !== undefined ? ts(v.__ts) : v));
  function applyOps(base, upd) {
    const out = { ...base };
    for (const k of Object.keys(upd)) {
      const v = upd[k];
      if (v && v.__op === 'del') delete out[k];
      else if (v && v.__op === 'ts') out[k] = ts(clock.t);
      else if (v && v.__op === 'arrRem') out[k] = (out[k] || []).filter(x => !v.a.includes(x));
      else out[k] = v;
    }
    return out;
  }
  const snapOf = (name, id) => {
    const rec = col(name).get(id);
    return { id, exists: !!rec, data: () => (rec ? clone(rec.data) : undefined), createTime: rec ? ts(rec.created) : undefined };
  };
  const ref = (name, id) => ({
    id, _name: name,
    get: async () => snapOf(name, id),
    set: async (d, opts) => { const rec = col(name).get(id); col(name).set(id, { data: applyOps(opts && opts.merge && rec ? rec.data : {}, d), created: rec ? rec.created : clock.t }); },
    update: async d => { const rec = col(name).get(id); if (!rec) throw new Error('no doc ' + name + '/' + id); rec.data = applyOps(rec.data, d); },
    delete: async () => { col(name).delete(id); },
  });
  const query = (name, filters, lim) => ({
    where: (f, op, v) => query(name, [...filters, [f, v]], lim),
    limit: n => query(name, filters, n),
    get: async () => {
      let ids = [...col(name).keys()].filter(id => filters.every(([f, v]) => col(name).get(id).data[f] === v));
      if (lim) ids = ids.slice(0, lim);
      const docs = ids.map(id => snapOf(name, id));
      return { docs, forEach: fn => docs.forEach(fn), size: docs.length };
    },
  });
  return {
    _cols: cols,
    collection: name => ({ doc: id => ref(name, id), where: (f, op, v) => query(name, [[f, v]], 0), limit: n => query(name, [], n), get: () => query(name, [], 0).get() }),
    runTransaction: async fn => {
      const writes = [];
      const tx = {
        get: async r => (r.get ? r.get() : r),
        set: (r, d, o) => writes.push(() => r.set(d, o)),
        update: (r, d) => writes.push(() => r.update(d)),
      };
      const res = await fn(tx);
      for (const w of writes) await w();
      return res;
    },
    seed: (name, id, data, created) => col(name).set(id, { data, created: created === undefined ? clock.t : created }),
    peek: (name, id) => (col(name).get(id) || {}).data,
  };
}

// ── scripted PayChangu ───────────────────────────────────────────────────────
function makePayChangu() {
  const s = { createCalls: [], verifyCalls: 0, createStatus: 200, verifyResult: { status: 'pending', amount: 0, currency: 'MWK' }, verifyHttp: 200 };
  s.fetch = async (url, init) => {
    url = String(url);
    if (url === 'https://api.paychangu.com/payment') {
      s.createCalls.push({ init, body: JSON.parse(init.body) });
      return s.createStatus === 200
        ? new Response(JSON.stringify({ status: 'success', data: { checkout_url: 'https://checkout.paychangu.com/abc', data: { status: 'pending' } } }), { status: 200 })
        : new Response(JSON.stringify({ status: 'failed', message: 'nope' }), { status: s.createStatus });
    }
    if (url.startsWith('https://api.paychangu.com/verify-payment/')) {
      s.verifyCalls++;
      return new Response(JSON.stringify({ status: 'success', data: s.verifyResult }), { status: s.verifyHttp });
    }
    throw new Error('unexpected fetch ' + url);
  };
  return s;
}

const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 18, 10, 0, 0);              // 18 Oct 2026, 12:00 in Malawi
function world() {
  const clock = { t: T0 };
  const db = makeDb(clock);
  const pc = makePayChangu();
  const deps = { db, fetchImpl: pc.fetch, secretKey: 'sk_test', now: () => clock.t, FV, tsFromMillis: ts };
  return { clock, db, pc, deps };
}

(async () => {
  console.log('\nDates');
  eq('extend from nothing: today + 1 month', lib.extendExpiry(null, 1, T0), '2026-11-18');
  eq('3 months from today', lib.extendExpiry(undefined, 3, T0), '2027-01-18');
  eq('extends from a FUTURE expiry, not from today', lib.extendExpiry('2026-12-31', 1, T0), '2027-01-31');
  eq('expired expiry restarts from today', lib.extendExpiry('2026-09-01', 1, T0), '2026-11-18');
  eq('end-of-month clamps (31 Jan + 1 month)', lib.extendExpiry('2027-01-31', 1, T0), '2027-02-28');
  eq('leap year clamp', lib.extendExpiry('2027-12-31', 2, T0), '2028-02-29');
  eq('expiry that is today still counts as active', lib.extendExpiry('2026-10-18', 1, T0), '2026-11-18');
  eq('ISO datetime expiry from the console is understood', lib.extendExpiry('2026-12-31T00:00:00Z', 1, T0), '2027-01-31');
  eq('garbage expiry falls back to today', lib.extendExpiry('soon', 1, T0), '2026-11-18');
  eq('Malawi date, not UTC date (23:00 UTC is already tomorrow)', lib.extendExpiry(null, 1, Date.UTC(2026, 9, 18, 23, 0, 0)), '2026-11-19');

  console.log('\nWebhook signature');
  const raw = Buffer.from('{"tx_ref":"by_abcdef_0123456789"}');
  const mac = crypto.createHmac('sha256', 'whsec').update(raw).digest();
  ok('valid hex signature', lib.signatureOk(raw, mac.toString('hex'), 'whsec'));
  ok('valid base64 signature', lib.signatureOk(raw, mac.toString('base64'), 'whsec'));
  ok('uppercase hex accepted', lib.signatureOk(raw, mac.toString('hex').toUpperCase(), 'whsec'));
  ok('wrong secret rejected', !lib.signatureOk(raw, mac.toString('hex'), 'other'));
  ok('tampered body rejected', !lib.signatureOk(Buffer.from('{"tx_ref":"by_zzzzzz_0123456789"}'), mac.toString('hex'), 'whsec'));
  ok('missing header rejected', !lib.signatureOk(raw, undefined, 'whsec'));
  ok('missing secret rejected', !lib.signatureOk(raw, mac.toString('hex'), ''));
  ok('garbage header rejected', !lib.signatureOk(raw, 'zzzz', 'whsec'));
  eq('reference extraction ignores things that are not our refs', lib.candidateRefs({ tx_ref: 'by_abcdef_0123456789', reference: '71308131545', charge_id: '5d676fg' }, { tx_ref: 'evil' }), ['by_abcdef_0123456789']);

  console.log('\nStarting a payment');
  {
    const w = world();
    w.db.seed('households', 'hh111111', { owner: 'own1', memberUids: ['own1', 'mem1'] });
    const base = { deps: w.deps, uid: 'mem1', email: 'a@b.co', householdId: 'hh111111', months: 3, selfUrl: 'https://fn.example/', appUrl: 'https://app.example/x/' };
    let r = await lib.createCheckout(base);
    ok('member can start a 3-month payment', r.code === 200 && r.body.checkout_url.startsWith('https://checkout.paychangu.com/') && lib.isTxRef(r.body.tx_ref), r);
    const sent = w.pc.createCalls[0];
    ok('price comes from the server table (7000), not from the browser', sent.body.amount === 7000 && sent.body.currency === 'MWK');
    ok('PayChangu told where to call back and where to return', sent.body.callback_url === 'https://fn.example/' && sent.body.return_url === 'https://app.example/x/?paid=1');
    ok('secret key only in the Authorization header', sent.init.headers.Authorization === 'Bearer sk_test' && !JSON.stringify(sent.body).includes('sk_test'));
    ok('payment record created as pending, owned by the payer', w.db.peek('payments', r.body.tx_ref).status === 'pending' && w.db.peek('payments', r.body.tx_ref).uid === 'mem1');
    ok('email passed on when valid', sent.body.email === 'a@b.co');

    r = await lib.createCheckout({ ...base, months: 2 });
    ok('unknown plan -> 400', r.code === 400);
    r = await lib.createCheckout({ ...base, months: 1, householdId: "x'y" });
    ok('bad household id -> 400', r.code === 400);
    r = await lib.createCheckout({ ...base, uid: 'stranger' });
    ok('non-member cannot pay for someone else\'s household -> 403', r.code === 403);
    w.db.seed('households', 'gone2222', { owner: 'own1', memberUids: ['mem1'], deletedAt: 'x' });
    r = await lib.createCheckout({ ...base, householdId: 'gone2222' });
    ok('household scheduled for deletion -> 403', r.code === 403);
    r = await lib.createCheckout({ ...base, householdId: 'nothere9' });
    ok('missing household -> 403', r.code === 403);
    r = await lib.createCheckout({ ...base, email: 'not-an-email' });
    ok('bad email is simply left out', r.code === 200 && !('email' in w.pc.createCalls[w.pc.createCalls.length - 1].body));
    for (let i = 0; i < 6; i++) r = await lib.createCheckout(base);
    ok('rate limit: too many attempts in 10 minutes -> 429', r.code === 429);
    w.clock.t += 11 * 60 * 1000;
    r = await lib.createCheckout(base);
    ok('...and allowed again later', r.code === 200);

    const w2 = world();
    w2.db.seed('households', 'hh111111', { owner: 'own1', memberUids: ['own1'] });
    w2.pc.createStatus = 400;
    r = await lib.createCheckout({ deps: w2.deps, uid: 'own1', householdId: 'hh111111', months: 1, selfUrl: 's', appUrl: 'https://app.example/' });
    ok('PayChangu refusing -> 502 and the attempt is marked failed', r.code === 502 && [...w2.db._cols.payments.values()][0].data.status === 'init_failed');
  }

  console.log('\nConfirming a payment');
  async function paidWorld(opts = {}) {
    const w = world();
    w.db.seed('households', 'hh111111', { owner: 'own1', memberUids: ['own1', 'mem1'], ...(opts.hh || {}) });
    w.db.seed('users', 'own1', { displayName: 'Owner', ...(opts.user || {}) });
    const c = await lib.createCheckout({ deps: w.deps, uid: 'mem1', householdId: 'hh111111', months: opts.months || 1, selfUrl: 's', appUrl: 'https://app.example/' });
    return { w, tx: c.body.tx_ref };
  }
  {
    let { w, tx } = await paidWorld();
    let r = await lib.settlePayment({ deps: w.deps, txRef: tx });
    ok('not paid yet -> pending, nothing granted', r.status === 'pending' && !w.db.peek('households', 'hh111111').isPremium);
    w.pc.verifyResult = { status: 'success', amount: 2500, currency: 'MWK' };
    r = await lib.settlePayment({ deps: w.deps, txRef: tx });
    const hh = w.db.peek('households', 'hh111111');
    ok('paid -> premium on, expiry one month out', r.status === 'paid' && hh.isPremium === true && hh.premiumExpiry === '2026-11-18', { r, hh });
    ok('activation time recorded', typeof hh.premiumActivatedAt === 'string');
    ok('owner gets premiumUntil (end of expiry day, Malawi time)', w.db.peek('users', 'own1').premiumUntil.toMillis() === lib.endOfDayMs('2026-11-18'));
    ok('payment marked paid', w.db.peek('payments', tx).status === 'paid');
    const calls = w.pc.verifyCalls;
    r = await lib.settlePayment({ deps: w.deps, txRef: tx });
    ok('settling again changes nothing (no double credit) and does not call PayChangu', r.status === 'paid' && w.db.peek('households', 'hh111111').premiumExpiry === '2026-11-18' && w.pc.verifyCalls === calls);
  }
  {
    let { w, tx } = await paidWorld({ hh: { isPremium: true, premiumExpiry: '2026-12-31' }, months: 3 });
    w.pc.verifyResult = { status: 'success', amount: 7000, currency: 'MWK' };
    await lib.settlePayment({ deps: w.deps, txRef: tx });
    eq('renewal extends from the existing future expiry', w.db.peek('households', 'hh111111').premiumExpiry, '2027-03-31');
  }
  {
    let { w, tx } = await paidWorld({ user: { premiumUntil: ts(lib.endOfDayMs('2030-01-01')) } });
    w.pc.verifyResult = { status: 'success', amount: 2500, currency: 'MWK' };
    await lib.settlePayment({ deps: w.deps, txRef: tx });
    ok('owner premiumUntil never moves backwards', w.db.peek('users', 'own1').premiumUntil.toMillis() === lib.endOfDayMs('2030-01-01'));
  }
  {
    let { w, tx } = await paidWorld({ hh: { isPremium: true } });                   // premium by hand, no end date
    w.pc.verifyResult = { status: 'success', amount: 2500, currency: 'MWK' };
    const r = await lib.settlePayment({ deps: w.deps, txRef: tx });
    ok('a household that is premium with no end date is not downgraded to a dated plan', r.status === 'paid' && !('premiumExpiry' in w.db.peek('households', 'hh111111')) );
  }
  {
    let { w, tx } = await paidWorld({ months: 3 });
    w.pc.verifyResult = { status: 'success', amount: 2500, currency: 'MWK' };       // paid the 1-month price for a 3-month plan
    const r = await lib.settlePayment({ deps: w.deps, txRef: tx });
    ok('underpayment grants nothing', r.status === 'failed' && !w.db.peek('households', 'hh111111').isPremium && w.db.peek('payments', tx).status === 'mismatch');
  }
  {
    let { w, tx } = await paidWorld();
    w.pc.verifyResult = { status: 'success', amount: 2500, currency: 'USD' };
    const r = await lib.settlePayment({ deps: w.deps, txRef: tx });
    ok('wrong currency grants nothing', r.status === 'failed' && !w.db.peek('households', 'hh111111').isPremium);
  }
  {
    let { w, tx } = await paidWorld();
    w.pc.verifyResult = { status: 'success', amount: 9999, currency: 'MWK' };
    const r = await lib.settlePayment({ deps: w.deps, txRef: tx });
    ok('overpayment is accepted (and still only buys what was chosen)', r.status === 'paid' && w.db.peek('households', 'hh111111').premiumExpiry === '2026-11-18');
  }
  {
    let { w, tx } = await paidWorld();
    w.pc.verifyResult = { status: 'failed', amount: 0, currency: 'MWK' };
    const r = await lib.settlePayment({ deps: w.deps, txRef: tx });
    ok('failed payment -> failed, nothing granted', r.status === 'failed' && !w.db.peek('households', 'hh111111').isPremium);
    const again = await lib.settlePayment({ deps: w.deps, txRef: tx });
    ok('...and stays failed', again.status === 'failed');
  }
  {
    let { w, tx } = await paidWorld();
    w.clock.t += 4 * DAY;
    const r = await lib.settlePayment({ deps: w.deps, txRef: tx });
    ok('pending for over 3 days is closed as expired', r.status === 'failed' && w.db.peek('payments', tx).status === 'expired');
  }
  {
    let { w, tx } = await paidWorld();
    w.pc.verifyResult = { status: 'success', amount: 2500, currency: 'MWK' };
    await w.db.collection('households').doc('hh111111').delete();
    const r = await lib.settlePayment({ deps: w.deps, txRef: tx });
    ok('paid but household deleted meanwhile -> recorded for follow-up, no crash', r.status === 'failed' && w.db.peek('payments', tx).status === 'paid_no_household');
  }
  {
    const w = world();
    eq('unknown reference -> unknown', (await lib.settlePayment({ deps: w.deps, txRef: 'by_abcdef_0123456789' })).status, 'unknown');
    eq('malformed reference -> unknown', (await lib.settlePayment({ deps: w.deps, txRef: '../../users/x' })).status, 'unknown');
    ok('PayChangu never contacted for those', w.pc.verifyCalls === 0);
  }
  {
    let { w, tx } = await paidWorld();
    w.pc.verifyHttp = 500;
    let threw = false; try { await lib.settlePayment({ deps: w.deps, txRef: tx }); } catch (_) { threw = true; }
    ok('PayChangu outage surfaces as an error (caller retries), payment stays pending', threw && w.db.peek('payments', tx).status === 'pending');
  }
  {
    let { w, tx } = await paidWorld();
    const w2 = await paidWorld();
    w2.w.pc.verifyResult = { status: 'success', amount: 2500, currency: 'MWK' };
    const out = await lib.reconcilePending({ deps: w2.w.deps });
    ok('scheduled reconcile settles pending payments', out.length === 1 && out[0][1] === 'paid' && w2.w.db.peek('households', 'hh111111').isPremium === true, out);
  }

  console.log('\nOne free trial per account');
  {
    const w = world();
    w.db.seed('households', 'first111', { owner: 'u1', memberUids: ['u1'], trialStarted: ts(T0) }, T0);
    let r = await lib.enforceTrialAndCap({ deps: w.deps, householdId: 'first111', data: w.db.peek('households', 'first111'), createdMs: T0, enforceCap: false });
    ok('first household keeps its trial and the account is marked', !r.stripped && w.db.peek('households', 'first111').trialStarted && w.db.peek('users', 'u1').trialHouseholdId === 'first111' && w.db.peek('users', 'u1').trialClaimedAt);
    w.clock.t += 5000;
    w.db.seed('households', 'second22', { owner: 'u1', memberUids: ['u1'], trialStarted: ts(w.clock.t) }, w.clock.t);
    r = await lib.enforceTrialAndCap({ deps: w.deps, householdId: 'second22', data: w.db.peek('households', 'second22'), createdMs: w.clock.t, enforceCap: false });
    ok('a second household that arrives with a trial loses it', r.stripped && !('trialStarted' in w.db.peek('households', 'second22')) && !!w.db.peek('households', 'first111').trialStarted);
    w.db.seed('households', 'third333', { owner: 'u1', memberUids: ['u1'] }, w.clock.t + 1);
    r = await lib.enforceTrialAndCap({ deps: w.deps, householdId: 'third333', data: w.db.peek('households', 'third333'), createdMs: w.clock.t + 1, enforceCap: false });
    ok('a household created without a trial is left alone', !r.stripped);
  }
  {
    const w = world();                                                         // simultaneous creation: two trials arrive together
    w.db.seed('households', 'aaaa1111', { owner: 'u2', memberUids: ['u2'], trialStarted: ts(T0) }, T0);
    w.db.seed('households', 'bbbb2222', { owner: 'u2', memberUids: ['u2'], trialStarted: ts(T0 + 10) }, T0 + 10);
    await lib.enforceTrialAndCap({ deps: w.deps, householdId: 'bbbb2222', data: w.db.peek('households', 'bbbb2222'), createdMs: T0 + 10, enforceCap: false });
    await lib.enforceTrialAndCap({ deps: w.deps, householdId: 'aaaa1111', data: w.db.peek('households', 'aaaa1111'), createdMs: T0, enforceCap: false });
    ok('race: the EARLIER household keeps the trial whichever function runs first', !!w.db.peek('households', 'aaaa1111').trialStarted && !('trialStarted' in w.db.peek('households', 'bbbb2222')));
  }
  {
    const w = world();                                                         // an account that used a trial before this existed
    w.db.seed('households', 'old00001', { owner: 'u3', memberUids: ['u3'], config: { trialStarted: '2026-01-01T00:00:00.000Z' } }, T0 - 200 * DAY);
    w.db.seed('households', 'new00002', { owner: 'u3', memberUids: ['u3'], trialStarted: ts(T0) }, T0);
    const r = await lib.enforceTrialAndCap({ deps: w.deps, householdId: 'new00002', data: w.db.peek('households', 'new00002'), createdMs: T0, enforceCap: false });
    ok('legacy account that already had a trial does not get another', r.stripped && !('trialStarted' in w.db.peek('households', 'new00002')));
  }
  {
    const w = world();
    const r = await lib.enforceTrialAndCap({ deps: w.deps, householdId: 'x', data: {}, createdMs: T0, enforceCap: true });
    ok('household with no owner is skipped', r.action === 'skip');
  }

  console.log('\nFree household cap (switched on)');
  {
    const w = world();
    for (const [i, id] of ['h1', 'h2', 'h3', 'h4'].entries()) w.db.seed('households', id + 'xxxxxx', { owner: 'u4', memberUids: ['u4'] }, T0 + i);
    w.db.seed('users', 'u4', { ownedHouseholds: ['h1xxxxxx', 'h2xxxxxx', 'h3xxxxxx', 'h4xxxxxx'] });
    let r = await lib.enforceTrialAndCap({ deps: w.deps, householdId: 'h4xxxxxx', data: w.db.peek('households', 'h4xxxxxx'), createdMs: T0 + 3, enforceCap: false });
    ok('cap NOT enforced while the switch is off', !r.removed && !!w.db.peek('households', 'h4xxxxxx'));
    r = await lib.enforceTrialAndCap({ deps: w.deps, householdId: 'h4xxxxxx', data: w.db.peek('households', 'h4xxxxxx'), createdMs: T0 + 3, enforceCap: true });
    ok('4th household for a free account is removed when enforced', r.removed && !w.db.peek('households', 'h4xxxxxx') && !w.db.peek('users', 'u4').ownedHouseholds.includes('h4xxxxxx'));
    ok('the first three are untouched', ['h1', 'h2', 'h3'].every(p => !!w.db.peek('households', p + 'xxxxxx')));
  }
  {
    const w = world();
    for (const [i, id] of ['h1', 'h2', 'h3', 'h4'].entries()) w.db.seed('households', id + 'xxxxxx', { owner: 'u5', memberUids: ['u5'], ...(i === 0 ? { isPremium: true } : {}) }, T0 + i);
    const r = await lib.enforceTrialAndCap({ deps: w.deps, householdId: 'h4xxxxxx', data: w.db.peek('households', 'h4xxxxxx'), createdMs: T0 + 3, enforceCap: true });
    ok('premium owner may keep creating households', !r.removed && !!w.db.peek('households', 'h4xxxxxx'));
  }
  {
    const w = world();
    for (const [i, id] of ['h1', 'h2', 'h3', 'h4'].entries()) w.db.seed('households', id + 'xxxxxx', { owner: 'u6', memberUids: ['u6'], ...(i === 0 ? { deletedAt: 'x' } : {}) }, T0 + i);
    const r = await lib.enforceTrialAndCap({ deps: w.deps, householdId: 'h4xxxxxx', data: w.db.peek('households', 'h4xxxxxx'), createdMs: T0 + 3, enforceCap: true });
    ok('households scheduled for deletion do not count toward the cap', !r.removed);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
