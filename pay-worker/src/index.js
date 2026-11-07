// Bajeti Yanga payments, on Cloudflare Workers (free plan). Replaces the `payments` + `reconcilePayments` Cloud
// Functions, which need Firebase's paid Blaze plan. Same behaviour, same one address for everything:
//
//   POST  with a `Signature` header   PayChangu telling us a payment happened (the "webhook")
//   POST  with a sign-in token        the app: { action:'checkout', householdId, months }  or  { action:'check', txRef }
//   GET   with ?tx_ref=...            the customer's browser coming back from PayChangu: settle, then go back to the app
//   GET   /health                     "is it set up?" (says yes/no per setting, never shows a secret)
//   every 15 minutes (cron)           settle any payment whose webhook never arrived
//
// Settings (see pay-worker/SETUP.md). Secrets: PAYCHANGU_SECRET_KEY, PAYCHANGU_WEBHOOK_SECRET, GOOGLE_SERVICE_ACCOUNT.
// Plain settings (wrangler.toml): APP_URL, ALLOWED_ORIGINS, FIREBASE_PROJECT_ID.

import * as logic from './logic.js';
import { FirestoreRest, makeTokenProvider, tsFromMillis, defaultFetch } from './firestore.js';
import { verifyFirebaseToken } from './auth.js';

const DEFAULT_APP_URL = 'https://rodart265.github.io/bajeti-yanga/';

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS || 'https://rodart265.github.io').split(',').map(s => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
             'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Max-Age': '86400' };
  }
  return { Vary: 'Origin' };
}
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

// One database client per Worker instance, so the Google access token is re-used between requests.
let shared = { sig: null, db: null };
function makeDeps(env, injected) {
  if (injected && injected.db) {
    return { db: injected.db, fetchImpl: injected.fetchImpl || defaultFetch, secretKey: env.PAYCHANGU_SECRET_KEY, now: injected.now || Date.now, tsFromMillis: injected.tsFromMillis || tsFromMillis };
  }
  const projectId = env.FIREBASE_PROJECT_ID || 'bajeti-yanga';
  const sig = projectId + '|' + env.GOOGLE_SERVICE_ACCOUNT;
  if (shared.sig !== sig) {
    const getToken = makeTokenProvider({ serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT });
    shared = { sig, db: new FirestoreRest({ projectId, getToken }) };
  }
  return { db: shared.db, fetchImpl: defaultFetch, secretKey: env.PAYCHANGU_SECRET_KEY, now: Date.now, tsFromMillis };
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
      if (missing.length || url.searchParams.get('deep') !== '1') return json(200, { ok: missing.length === 0, missing }, cors);   // names only, never values
      // /health?deep=1 also signs in to Google and reads the database once, so "ok" means payments can really work.
      try { await makeDeps(env, injected).db.collection('payments').limit(1).get(); return json(200, { ok: true, missing, google: 'ok', database: 'ok' }, cors); }
      catch (e) { console.error('deep health failed:', e && e.message); return json(200, { ok: false, missing, problem: String((e && e.message) || e).slice(0, 200) }, cors); }
    }

    if (!injected.db) {
      const missing = missingSettings(env);
      if (missing.length) { console.error('payments not set up, missing:', missing.join(', ')); return json(503, { error: 'Payments are not set up yet.' }, cors); }
    }
    let deps;
    try { deps = makeDeps(env, injected); }
    catch (e) { console.error('setup problem:', e.message); return json(503, { error: 'Payments are not set up yet.' }, cors); }

    try {
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
      if (!m) { console.log('refused: no sign-in token'); return json(401, { error: 'Please sign in again.' }, cors); }
      let user;
      try { user = await verifyFirebaseToken(m[1], env, injected.fetchImpl || defaultFetch, deps.now()); }
      catch (e) { console.log('refused: sign-in token not accepted:', e && e.message); return json(401, { error: 'Please sign in again.' }, cors); }

      if (body.action === 'checkout') {
        const out = await logic.createCheckout({ deps, uid: user.uid, email: user.email, householdId: body.householdId, months: Number(body.months), selfUrl: url.origin + '/', appUrl });
        if (out.detail) console.error('checkout failed', out.detail);
        else if (out.code >= 400) console.log('checkout refused', out.code, out.error, 'household', body.householdId);
        return json(out.code, out.body || { error: out.error }, cors);
      }
      if (body.action === 'check') {
        if (!logic.isTxRef(body.txRef)) return json(400, { error: 'Invalid reference.' }, cors);
        const pay = await deps.db.collection('payments').doc(body.txRef).get();
        if (!pay.exists || pay.data().uid !== user.uid) return json(404, { error: 'Payment not found.' }, cors);
        return json(200, await logic.settlePayment({ deps, txRef: body.txRef }), cors);
      }
      return json(400, { error: 'Unknown action.' }, cors);
    } catch (e) {
      console.error('payments error', e && e.message);
      return json(500, { error: 'Something went wrong. Please try again.' }, cors);
    }
  },

  // Every 15 minutes: settle payments that are still "pending" (webhook missed, customer closed the page, ...).
  async scheduled(event, env, ctx, injected = {}) {
    if (!injected.db && missingSettings(env).length) { console.error('reconcile skipped, not set up'); return; }
    const run = (async () => {
      const out = await logic.reconcilePending({ deps: makeDeps(env, injected) });
      if (out.length) console.log('reconciled', JSON.stringify(out));
      return out;
    })().catch(e => { console.error('reconcile failed', e && e.message); return []; });
    if (ctx && ctx.waitUntil) ctx.waitUntil(run);
    return run;
  },
};
