// Firebase Authentication (the list of accounts) over Google's Identity Toolkit REST API.
//
// Firestore only knows the profile documents the app writes. The real list of accounts, when each one signed up, when it
// last signed in, and whether it is disabled, lives in Firebase Authentication. The admin console needs that, and
// browsers cannot read it, so the Worker does it with the same robot (service account) it already uses for Firestore.
//
// One-time setup for this to work: give the robot the role "Firebase Authentication Admin"
// (Google Cloud console > IAM > the bajeti-pay account > add role). Without it these calls answer 403 and the console
// says so, and everything else keeps working.

const toMs = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

export const IDENTITY_SCOPE = 'https://www.googleapis.com/auth/identitytoolkit';

export function makeIdentity({ projectId, getToken, fetchImpl = fetch }) {
  const base = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`;

  async function call(method, url, body) {
    const r = await (0, fetchImpl)(url, {
      method,
      headers: { Authorization: 'Bearer ' + (await getToken()), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let j = null; try { j = await r.json(); } catch (_) {}
    if (!r.ok) {
      const msg = (j && j.error && j.error.message) || '';
      const e = new Error('Auth ' + method + ' failed: HTTP ' + r.status + (msg ? ' ' + String(msg).slice(0, 160) : ''));
      e.status = r.status; throw e;
    }
    return j || {};
  }

  const shape = u => ({
    uid: u.localId, email: u.email || null, phone: u.phoneNumber || null,
    providers: (u.providerUserInfo || []).map(p => p.providerId),
    created: toMs(u.createdAt), lastSignIn: toMs(u.lastLoginAt),
    verified: u.emailVerified === true, disabled: u.disabled === true,
  });

  return {
    // Every account, oldest page first. Up to 1000 per request; stops at 20000 accounts as a safety limit.
    async listUsers() {
      const out = []; let token = '';
      for (let page = 0; page < 20; page++) {
        const j = await call('GET', base + ':batchGet?maxResults=1000' + (token ? '&nextPageToken=' + encodeURIComponent(token) : ''));
        (j.users || []).forEach(u => out.push(shape(u)));
        token = j.nextPageToken || '';
        if (!token) break;
      }
      return out;
    },
    async lookup(uid) {
      const j = await call('POST', base + ':lookup', { localId: [uid] });
      return j.users && j.users[0] ? shape(j.users[0]) : null;
    },
    async setDisabled(uid, disabled) {
      await call('POST', base + ':update', { localId: uid, disableUser: !!disabled });
    },
  };
}
