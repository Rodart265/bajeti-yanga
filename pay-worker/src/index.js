// Bajeti Yanga payments, on Cloudflare Workers (free plan). Replaces the `payments` + `reconcilePayments` Cloud
// Functions, which need Firebase's paid Blaze plan. Same behaviour, same one address for everything:
//
//   POST  with a `Signature` header   PayChangu telling us a payment happened (the "webhook")
//   POST  with a sign-in token        the app: { action:'checkout', householdId, months }  or  { action:'check', txRef }
//   GET   with ?tx_ref=...            the customer's browser coming back from PayChangu: settle, then go back to the app
//   GET   /health                     "is it set up?" (says yes/no per setting, never shows a secret)
//   GET   /public?plan=&lang=         notices and the maintenance message the admin console published (nothing private)
//   POST  /admin  with a sign-in token  the admin console (see admin.js: roles, looks, Premium changes, log)
//   POST  /chat  with a sign-in token   Bajeti AI (Premium only), forwarded to Gemini (see ai.js)
//   POST  { action:'createHousehold' }  the app creating a household: trial and 3-household limit enforced here (households.js)
//   POST  { action:'notify' }           the app asking us to push-notify the owner (join request) or a joiner (approval) (push.js)
//   cron every 15 minutes               settle any payment whose webhook never arrived
//   cron in the morning (Malawi time)   bill reminders by push (push.js)
//   cron every 2 hours                  clean-up: old trash, deleted households and accounts (housekeeping.js)
//
// Settings (see pay-worker/SETUP.md). Secrets: PAYCHANGU_SECRET_KEY, PAYCHANGU_WEBHOOK_SECRET, GOOGLE_SERVICE_ACCOUNT.
// Plain settings (wrangler.toml): APP_URL, ALLOWED_ORIGINS, FIREBASE_PROJECT_ID.

import * as logic from './logic.js';
import { FirestoreRest, makeTokenProvider, tsFromMillis } from './firestore.js';
import { verifyFirebaseToken, verifyFirebaseTokenFull } from './auth.js';
import * as admin from './admin.js';
import { makeIdentity, IDENTITY_SCOPE } from './identity.js';
import { handleChat } from './ai.js';
import { createHousehold } from './households.js';
import { makeFcm, FCM_SCOPE, handleNotify, runBillReminders } from './push.js';
import { runHousekeeping } from './housekeeping.js';

// Must match wrangler.toml. Cloudflare times are UTC; Malawi is UTC+2, so 05:05-06:50 UTC is 07:05-08:50 there.
export const BILLS_CRON = '5,20,35,50 5-6 * * *';
export const HOUSEKEEPING_CRON = '10 */2 * * *';
const DEFAULT_APP_URL = 'https://rodart265.github.io/bajeti-yanga/';

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS || 'https://rodart265.github.io').split(',').map(s => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Household, X-AI-Feature',
             'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Max-Age': '86400' };
  }
  return { Vary: 'Origin' };
}
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

// One database client per Worker instance, so the Google access token is re-used between requests.
let shared = { sig: null, db: null, identity: null };
function makeDeps(env, injected) {
  if (injected && injected.db) {
    return { db: injected.db, identity: injected.identity, fcm: injected.fcm, fetchImpl: injected.fetchImpl || fetch, secretKey: env.PAYCHANGU_SECRET_KEY, now: injected.now || Date.now, tsFromMillis: injected.tsFromMillis || tsFromMillis };
  }
  const projectId = env.FIREBASE_PROJECT_ID || 'bajeti-yanga';
  const sig = projectId + '|' + env.GOOGLE_SERVICE_ACCOUNT;
  if (shared.sig !== sig) {
    const getToken = makeTokenProvider({ serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT });
    // The sign-in list needs its own access token (a different scope than the database); it is only created, and only asked
    // for, when the admin console uses it.
    const identity = makeIdentity({ projectId, getToken: makeTokenProvider({ serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT, scope: IDENTITY_SCOPE }) });
    // Push messages go out through Firebase Cloud Messaging, which needs yet another access token scope.
    const fcm = makeFcm({ projectId, getToken: makeTokenProvider({ serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT, scope: FCM_SCOPE }) });
    shared = { sig, db: new FirestoreRest({ projectId, getToken }), identity, fcm };
  }
  return { db: shared.db, identity: shared.identity, fcm: shared.fcm, fetchImpl: fetch, secretKey: env.PAYCHANGU_SECRET_KEY, now: Date.now, tsFromMillis };
}

function missingSettings(env) {
  return ['PAYCHANGU_SECRET_KEY', 'PAYCHANGU_WEBHOOK_SECRET', 'GOOGLE_SERVICE_ACCOUNT'].filter(k => !env[k]);
}

export default {
  async fetch(req, env, ctx, injected = {}) {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);
    const appUrl = env.APP_URL || DEFAULT_APP_URL;

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (req.method === 'GET' && url.pathname === '/health') {
      const missing = missingSettings(env);
      return json(200, { ok: missing.length === 0, missing }, cors);   // names only, never values
    }

    if (!injected.db) {
      const missing = missingSettings(env);
      if (missing.length) { console.error('payments not set up, missing:', missing.join(', ')); return json(503, { error: 'Payments are not set up yet.' }, cors); }
    }
    let deps;
    try { deps = makeDeps(env, injected); }
    catch (e) { console.error('setup problem:', e.message); return json(503, { error: 'Payments are not set up yet.' }, cors); }

    try {
      // What the app is told: notices and the maintenance message. No sign-in; nothing private is in it.
      if (req.method === 'GET' && url.pathname === '/public') {
        const feed = await admin.publicFeed({ deps, env, plan: url.searchParams.get('plan'), lang: url.searchParams.get('lang') });
        return json(200, feed, { ...cors, 'Cache-Control': 'public, max-age=60' });
      }

      // Bajeti AI. Premium only; the Gemini key lives here, never in the app.
      if (url.pathname === '/chat') {
        if (req.method !== 'POST') return json(405, { error: 'POST only' }, cors);
        return handleChat({ req, env, deps, fetchImpl: injected.fetchImpl || fetch, cors });
      }

      // The admin console.
      if (url.pathname === '/admin') {
        if (req.method !== 'POST') return json(405, { error: 'POST only' }, cors);
        const noStore = { ...cors, 'Cache-Control': 'no-store' };
        const bm = /^Bearer (.+)$/.exec(req.headers.get('authorization') || '');
        if (!bm) return json(401, { error: 'Please sign in again.' }, noStore);
        let who;
        try { who = await verifyFirebaseTokenFull(bm[1], env, injected.fetchImpl || fetch, deps.now()); }
        catch (_) { return json(401, { error: 'Please sign in again.' }, noStore); }
        let params = {}; try { params = await req.json(); } catch (_) {}
        const out = await admin.handle({ user: who, action: params && params.action, params, env, deps, identity: deps.identity });
        return json(out.code, out.body, noStore);
      }

      // The customer's browser returning from PayChangu: settle (checked with PayChangu, never trusted from the URL).
      if (req.method === 'GET') {
        const refs = logic.candidateRefs(null, { tx_ref: url.searchParams.get('tx_ref') });
        if (!refs.length) return new Response('ok', { status: 200 });
        for (const ref of refs) await logic.settlePayment({ deps, txRef: ref }).catch(e => console.error('settle failed', ref, e.message));
        return Response.redirect(appUrl + (appUrl.includes('?') ? '&' : '?') + 'paid=1', 302);
      }
      if (req.method !== 'POST') return json(405, { error: 'POST only' }, cors);

      const raw = new Uint8Array(await req.arrayBuffer());
      let body = {}; try { body = JSON.parse(new TextDecoder().decode(raw)); } catch (_) {}

      // PayChangu webhook
      const signature = req.headers.get('signature');
      if (signature) {
        if (!(await logic.signatureOk(raw, signature, env.PAYCHANGU_WEBHOOK_SECRET))) return json(401, { error: 'bad signature' });
        for (const ref of logic.candidateRefs(body, { tx_ref: url.searchParams.get('tx_ref') })) {
          await logic.settlePayment({ deps, txRef: ref }).catch(e => console.error('settle failed', ref, e.message));
        }
        return json(200, { ok: true });                // always 200 once the signature is good, or PayChangu keeps retrying
      }

      // The app (a signed-in person)
      const m = /^Bearer (.+)$/.exec(req.headers.get('authorization') || '');
      if (!m) return json(401, { error: 'Please sign in again.' }, cors);
      let user;
      try { user = await verifyFirebaseTokenFull(m[1], env, injected.fetchImpl || fetch, deps.now()); }
      catch (_) { return json(401, { error: 'Please sign in again.' }, cors); }

      if (body.action === 'checkout') {
        const out = await logic.createCheckout({ deps, uid: user.uid, email: user.email, householdId: body.householdId, months: Number(body.months), selfUrl: url.origin + '/', appUrl });
        if (out.detail) console.error('checkout failed', out.detail);
        return json(out.code, out.body || { error: out.error }, cors);
      }
      if (body.action === 'check') {
        if (!logic.isTxRef(body.txRef)) return json(400, { error: 'Invalid reference.' }, cors);
        const pay = await deps.db.collection('payments').doc(body.txRef).get();
        if (!pay.exists || pay.data().uid !== user.uid) return json(404, { error: 'Payment not found.' }, cors);
        return json(200, await logic.settlePayment({ deps, txRef: body.txRef }), cors);
      }
      if (body.action === 'createHousehold') {
        const out = await createHousehold({ deps, env, who: user, body });
        return json(out.code, out.body, { ...cors, 'Cache-Control': 'no-store' });
      }
      if (body.action === 'notify') {
        const out = await handleNotify({ deps, fcm: deps.fcm, user, body });
        return json(out.code, out.body, { ...cors, 'Cache-Control': 'no-store' });
      }
      return json(400, { error: 'Unknown action.' }, cors);
    } catch (e) {
      console.error('payments error', e && e.message);
      return json(500, { error: 'Something went wrong. Please try again.' }, cors);
    }
  },

  // The timers (see wrangler.toml). Each one is told which timer fired through event.cron:
  //   "*/15 * * * *"             settle payments whose webhook never arrived
  //   BILLS_CRON  (mornings)      bill reminders by push
  //   HOUSEKEEPING_CRON           clean-up of old trash, deleted households and accounts
  async scheduled(event, env, ctx, injected = {}) {
    if (!injected.db && missingSettings(env).length) { console.error('scheduled job skipped, not set up'); return; }
    const cron = event && event.cron;
    const run = (async () => {
      const deps = makeDeps(env, injected);
      if (cron === BILLS_CRON) {
        const out = await runBillReminders({ deps, fcm: deps.fcm });
        console.log('bill reminders', JSON.stringify(out));
        return out;
      }
      if (cron === HOUSEKEEPING_CRON) {
        const out = await runHousekeeping({ deps, env, identity: deps.identity });
        console.log('housekeeping', JSON.stringify(out));
        return out;
      }
      const out = await logic.reconcilePending({ deps });
      if (out.length) console.log('reconciled', JSON.stringify(out));
      return out;
    })().catch(e => { console.error('scheduled job failed', cron, e && e.message); return []; });
    if (ctx && ctx.waitUntil) ctx.waitUntil(run);
    return run;
  },
};
