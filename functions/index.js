'use strict';
// Bajeti Yanga Cloud Functions (needs the Firebase Blaze plan). See docs/ROLLOUT-2026-10.md.
//
//   payments            HTTPS. One URL that does three jobs:
//                         POST + sign-in token  -> the app starts a payment ("checkout") or asks if it went through ("check")
//                         POST + Signature      -> PayChangu's webhook
//                         GET  ?tx_ref=...      -> the customer's browser coming back from PayChangu
//   reconcilePayments   every 15 minutes, settles any payment whose webhook was missed
//   onHouseholdCreated  keeps it to one free trial per account (and, if switched on, the free household cap)
//   admin               HTTPS. The one door for the admin console (docs: admin console plan). Google sign-in + ADMIN_EMAILS only.

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret, defineString } = require('firebase-functions/params');
const lib = require('./lib');
const adminLib = require('./admin');

initializeApp();
const db = getFirestore();

const PAYCHANGU_SECRET_KEY = defineSecret('PAYCHANGU_SECRET_KEY');          // PayChangu dashboard -> API keys (secret key)
const PAYCHANGU_WEBHOOK_SECRET = defineSecret('PAYCHANGU_WEBHOOK_SECRET');  // PayChangu dashboard -> API & Webhooks (web secret)
const APP_URL = defineString('APP_URL', { default: 'https://rodart265.github.io/bajeti-yanga/' });
const ALLOWED_ORIGINS = defineString('ALLOWED_ORIGINS', { default: 'https://rodart265.github.io' });
const ENFORCE_HOUSEHOLD_CAP = defineString('ENFORCE_HOUSEHOLD_CAP', { default: 'false' });
const ADMIN_EMAILS = defineString('ADMIN_EMAILS', { default: '' });                    // comma-separated Google emails; empty = nobody
const ADMIN_ENABLED = defineString('ADMIN_ENABLED', { default: 'true' });              // 'false' + redeploy = console off
const ADMIN_VIEW_ENTRIES = defineString('ADMIN_VIEW_ENTRIES', { default: 'false' });   // 'true' lets the console show recent entries

// Must match where your Firestore database lives for the trigger to deploy (see the rollout guide).
const REGION = process.env.FUNCTION_REGION || 'us-central1';

function depsFor(secretKey) {
  return {
    db, fetchImpl: fetch, secretKey, now: () => Date.now(),
    FV: FieldValue,
    tsFromMillis: ms => Timestamp.fromMillis(ms),
  };
}

function cors(req, res) {
  const allowed = ALLOWED_ORIGINS.value().split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.get('origin');
  res.set('Vary', 'Origin');
  if (origin && allowed.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Max-Age', '86400');
  }
}

exports.payments = onRequest(
  { region: REGION, secrets: [PAYCHANGU_SECRET_KEY, PAYCHANGU_WEBHOOK_SECRET], invoker: 'public', timeoutSeconds: 30, maxInstances: 10 },
  async (req, res) => {
    cors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    const secretKey = PAYCHANGU_SECRET_KEY.value();
    const deps = depsFor(secretKey);
    const appUrl = APP_URL.value();

    try {
      // The customer's browser returning from PayChangu: settle (the check is made with PayChangu, not trusted from the URL).
      if (req.method === 'GET') {
        for (const ref of lib.candidateRefs(null, req.query)) await lib.settlePayment({ deps, txRef: ref }).catch(() => {});
        res.redirect(302, appUrl + (appUrl.includes('?') ? '&' : '?') + 'paid=1');
        return;
      }
      if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

      // PayChangu webhook
      const signature = req.get('signature');
      if (signature) {
        if (!lib.signatureOk(req.rawBody || Buffer.from(''), signature, PAYCHANGU_WEBHOOK_SECRET.value())) {
          res.status(401).json({ error: 'bad signature' }); return;
        }
        for (const ref of lib.candidateRefs(req.body, req.query)) {
          await lib.settlePayment({ deps, txRef: ref }).catch(e => console.error('settle failed', ref, e.message));
        }
        res.status(200).json({ ok: true });                     // always 200 once the signature is good, or PayChangu keeps retrying
        return;
      }

      // The app (signed-in person)
      const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
      if (!m) { res.status(401).json({ error: 'Please sign in again.' }); return; }
      let decoded;
      try { decoded = await getAuth().verifyIdToken(m[1]); }
      catch (_) { res.status(401).json({ error: 'Please sign in again.' }); return; }
      const body = req.body && typeof req.body === 'object' ? req.body : {};

      if (body.action === 'checkout') {
        const selfUrl = 'https://' + (req.get('x-forwarded-host') || req.get('host')) + '/';
        const out = await lib.createCheckout({ deps, uid: decoded.uid, email: decoded.email, householdId: body.householdId, months: Number(body.months), selfUrl, appUrl });
        if (out.detail) console.error('checkout failed', out.detail);
        res.status(out.code).json(out.body || { error: out.error });
        return;
      }
      if (body.action === 'check') {
        if (!lib.isTxRef(body.txRef)) { res.status(400).json({ error: 'Invalid reference.' }); return; }
        const pay = await db.collection('payments').doc(body.txRef).get();
        if (!pay.exists || pay.data().uid !== decoded.uid) { res.status(404).json({ error: 'Payment not found.' }); return; }
        const r = await lib.settlePayment({ deps, txRef: body.txRef });
        res.status(200).json(r);
        return;
      }
      res.status(400).json({ error: 'Unknown action.' });
    } catch (e) {
      console.error('payments error', e);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  }
);

exports.reconcilePayments = onSchedule(
  { region: REGION, schedule: 'every 15 minutes', secrets: [PAYCHANGU_SECRET_KEY], timeoutSeconds: 120 },
  async () => {
    const out = await lib.reconcilePending({ deps: depsFor(PAYCHANGU_SECRET_KEY.value()) });
    if (out.length) console.log('reconciled', JSON.stringify(out));
  }
);

exports.onHouseholdCreated = onDocumentCreated(
  { document: 'households/{householdId}', region: REGION },
  async event => {
    const snap = event.data;
    if (!snap) return;
    const out = await lib.enforceTrialAndCap({
      deps: depsFor(null), householdId: event.params.householdId, data: snap.data(),
      createdMs: snap.createTime ? snap.createTime.toMillis() : Date.now(),
      enforceCap: ENFORCE_HOUSEHOLD_CAP.value() === 'true',
    });
    if (out.stripped || out.removed) console.log('household', event.params.householdId, JSON.stringify(out));
  }
);

exports.admin = onRequest(
  { region: REGION, invoker: 'public', timeoutSeconds: 60, maxInstances: 3 },
  async (req, res) => {
    cors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
    const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
    if (!m) { res.status(401).json({ error: 'Please sign in.' }); return; }
    let decoded;
    try { decoded = await getAuth().verifyIdToken(m[1], true); }          // true = also refuse revoked sessions
    catch (_) { res.status(401).json({ error: 'Please sign in again.' }); return; }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const gate = adminLib.authorize({
      decoded, adminEmails: adminLib.parseAdmins(ADMIN_EMAILS.value()), enabled: ADMIN_ENABLED.value() !== 'false',
      nowMs: Date.now(), needFresh: adminLib.needsFresh(body.action),
    });
    if (!gate.ok) {
      console.warn('admin refused', decoded.email, gate.code);
      res.status(gate.code).json({ error: gate.error, needsFreshSignIn: !!gate.needsFreshSignIn }); return;
    }
    try {
      const out = await adminLib.handle({
        action: body.action, params: body.params, now: Date.now(), viewEntries: ADMIN_VIEW_ENTRIES.value() === 'true',
        store: adminLib.firestoreStore({ db, auth: getAuth() }),
      });
      res.status(out.code).json(out.body);
    } catch (e) {
      console.error('admin error', body.action, e);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  }
);
