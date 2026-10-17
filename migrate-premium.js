// Moves Premium and trial fields out of households/{id}.config and into root fields.
// Also sets users/{ownerUid}.premiumUntil so the household cap rule can see Premium.
//
// Usage (dry run, writes nothing):
//   node migrate-premium.js ./serviceAccountKey.json
//
// Apply, copying Premium only for households you have verified as paid:
//   node migrate-premium.js ./serviceAccountKey.json --apply --premium=ID1,ID2
//
// A member could have written config.isPremium by hand, so this script never
// trusts it. Premium is copied to the root only for ids listed in --premium.
// Every config copy of the Premium and trial fields is deleted when you apply.

const path = require('path');
const admin = require('firebase-admin');

const keyPath = process.argv[2];
if (!keyPath) {
  console.error('Usage: node migrate-premium.js <serviceAccountKey.json> [--apply] [--premium=id1,id2]');
  process.exit(1);
}
const apply = process.argv.includes('--apply');
const premiumArg = process.argv.find(a => a.startsWith('--premium='));
const verified = new Set(premiumArg ? premiumArg.slice(10).split(',').map(s => s.trim()).filter(Boolean) : []);

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))) });
const db = admin.firestore();
const FV = admin.firestore.FieldValue;
const TS = admin.firestore.Timestamp;

function toTimestamp(v) {
  if (!v) return null;
  if (v.toDate) return v;
  const s = String(v);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T23:59:59Z') : new Date(s);
  return isNaN(d.getTime()) ? null : TS.fromDate(d);
}

(async () => {
  const snap = await db.collection('households').get();
  const ownerUntil = {}; // ownerUid -> latest premium end date (ms)
  let touched = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    const c = d.config || {};
    const upd = {};
    const notes = [];

    const hasCfgPremium = ['isPremium', 'premiumExpiry', 'premiumActivatedAt'].some(k => c[k] !== undefined);
    if (hasCfgPremium) {
      if (verified.has(doc.id)) {
        if (d.isPremium === undefined && c.isPremium === true) upd.isPremium = true;
        if (d.premiumExpiry === undefined && c.premiumExpiry) upd.premiumExpiry = c.premiumExpiry;
        if (d.premiumActivatedAt === undefined && c.premiumActivatedAt) upd.premiumActivatedAt = c.premiumActivatedAt;
        notes.push('copy verified premium to root');
      } else if (c.isPremium === true) {
        notes.push('config.isPremium is true but id not in --premium, NOT copied');
      }
      ['isPremium', 'premiumExpiry', 'premiumActivatedAt'].forEach(k => {
        if (c[k] !== undefined) upd['config.' + k] = FV.delete();
      });
    }

    if (c.trialStarted !== undefined) {
      if (d.trialStarted === undefined) {
        const ts = toTimestamp(c.trialStarted);
        if (ts) { upd.trialStarted = ts; notes.push('copy trialStarted to root'); }
      }
      upd['config.trialStarted'] = FV.delete();
    }

    // Premium end date for the owner's premiumUntil
    const isPrem = (upd.isPremium !== undefined ? upd.isPremium : d.isPremium) === true;
    if (isPrem && d.owner) {
      const exp = upd.premiumExpiry !== undefined ? upd.premiumExpiry : d.premiumExpiry;
      const ts = exp ? toTimestamp(exp) : TS.fromDate(new Date('2100-01-01T00:00:00Z'));
      if (ts) ownerUntil[d.owner] = Math.max(ownerUntil[d.owner] || 0, ts.toMillis());
    }

    if (Object.keys(upd).length) {
      touched++;
      console.log((apply ? 'UPDATE ' : 'WOULD UPDATE ') + doc.id + ': ' + (notes.join(', ') || 'remove config copies'));
      if (apply) await doc.ref.update(upd);
    }
  }

  for (const uid of Object.keys(ownerUntil)) {
    const until = TS.fromMillis(ownerUntil[uid]);
    console.log((apply ? 'SET ' : 'WOULD SET ') + 'users/' + uid + '.premiumUntil = ' + until.toDate().toISOString());
    if (apply) await db.collection('users').doc(uid).set({ premiumUntil: until }, { merge: true });
  }

  console.log('\nHouseholds ' + (apply ? 'updated' : 'that would change') + ': ' + touched);
  if (!apply) console.log('Dry run only. Re-run with --apply to write.');
})().catch(e => { console.error(e); process.exit(1); });
