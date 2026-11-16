// Creating a household, done here instead of in the browser.
//
// Why: the free trial (one per ACCOUNT) and the free household limit (3) used to depend on fields a person could edit
// themselves or on Cloud Functions that cannot run on the Spark plan, so neither was real. Here the Worker, which people
// cannot tamper with, decides:
//   - the trial: users/{uid}.trialClaimedAt is written only here, in the same all-or-nothing step that creates the
//     household, so two quick requests cannot both get a trial;
//   - the limit: counted from the households that really exist with this person as owner, not from a list they could clear;
//   - Premium fields in the budget are stripped, so nobody can create a household that is "already Premium".
// After this is deployed, firestore.rules no longer lets the browser create households at all.

import { tsFromMillis } from './firestore.js';
import { computePremium } from './ai.js';

const CODE = /^[a-z0-9]{6,20}$/;
const BLOCKED_CFG_KEYS = ['isPremium', 'premiumExpiry', 'premiumActivatedAt', 'trialStarted'];
const MAX_CFG_CHARS = 300000;
const FIELDS = ['memberUids', 'owner', 'isPremium', 'premiumExpiry', 'trialStarted', 'config.isPremium', 'config.premiumExpiry', 'config.trialStarted', 'deletedAt'];

const bad = (code, error) => ({ code, body: { error } });

export async function createHousehold({ deps, env, who, body }) {
  if (who.provider === 'password' && !who.emailVerified) return bad(403, 'verify_email');
  const code = body && body.code;
  if (typeof code !== 'string' || !CODE.test(code)) return bad(400, 'bad_code');
  const cfg = body.config;
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return bad(400, 'bad_config');
  let size = 0; try { size = JSON.stringify(cfg).length; } catch (_) { return bad(400, 'bad_config'); }
  if (size > MAX_CFG_CHARS) return bad(413, 'config_too_large');
  const clean = JSON.parse(JSON.stringify(cfg));
  BLOCKED_CFG_KEYS.forEach(k => { delete clean[k]; });
  const displayName = typeof body.displayName === 'string' ? body.displayName.slice(0, 80) : '';
  const uid = who.uid, now = deps.now();

  // How many households does this person own, and may they have another?
  const limit = Number(env.FREE_HOUSEHOLD_LIMIT) > 0 ? Number(env.FREE_HOUSEHOLD_LIMIT) : 3;
  const owned = (await deps.db.collection('households').where('owner', '==', uid).select(...FIELDS).get()).docs.filter(d => !d.data().deletedAt);
  if (owned.length >= limit) {
    const u = await deps.db.collection('users').doc(uid).get(['premiumUntil']);
    const until = u.exists ? u.data().premiumUntil : null;
    const premiumUser = until && (typeof until.toMillis === 'function' ? until.toMillis() : new Date(until).getTime()) > now;
    // Paid Premium on any of their households lifts the limit (as the FAQ says). A free trial does not.
    const paid = d => { const x = d.data(), c = x.config || {}; return computePremium({ memberUids: [uid], isPremium: x.isPremium, premiumExpiry: x.premiumExpiry, config: { isPremium: c.isPremium, premiumExpiry: c.premiumExpiry } }, uid, env, now) === true; };
    const anyPremium = owned.some(paid);
    if (!premiumUser && !anyPremium) return bad(403, 'household_limit');
  }

  // One all-or-nothing step: claim the id, claim the trial if this account still has one, write both documents.
  return deps.db.runTransaction(async tx => {
    const hhRef = deps.db.collection('households').doc(code), uRef = deps.db.collection('users').doc(uid);
    const [hh, u] = [await tx.get(hhRef, ['owner']), await tx.get(uRef)];
    if (hh.exists) return bad(409, 'code_taken');
    const ud = u.exists ? u.data() : {};
    const trial = !ud.trialClaimedAt;
    const doc = { config: clean, createdAt: tsFromMillis(now), owner: uid, memberUids: [uid] };
    if (body.solo === true) doc.solo = true;
    if (trial) doc.trialStarted = tsFromMillis(now);
    tx.set(hhRef, doc);
    const owned2 = Array.isArray(ud.ownedHouseholds) ? ud.ownedHouseholds.filter(x => x !== code).concat(code) : [code];
    const upd = { householdId: code, ownedHouseholds: owned2 };
    if (displayName) upd.displayName = displayName;
    if (trial) { upd.trialClaimedAt = tsFromMillis(now); upd.trialHouseholdId = code; }
    tx.set(uRef, upd, { merge: true });
    return { code: 200, body: { ok: true, code, trial } };
  });
}
