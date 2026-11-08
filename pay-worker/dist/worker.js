// src/logic.js
var PRICES = { 1: 1500, 3: 4e3 };
var CURRENCY = "MWK";
var CAT_OFFSET_MS = 2 * 3600 * 1e3;
var PENDING_MAX_AGE_MS = 3 * 86400 * 1e3;
var enc = new TextEncoder();
var pad = (n) => String(n).padStart(2, "0");
var isCode = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{3,40}$/.test(s);
var isTxRef = (s) => typeof s === "string" && /^by_[a-z0-9]{6,12}_[a-f0-9]{10}$/.test(s);
function catYMD(ms) {
  const d = new Date(ms + CAT_OFFSET_MS);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}
var ymdStr = ([y, m, d]) => `${y}-${pad(m)}-${pad(d)}`;
function addMonthsYMD([y, m, d], months) {
  const idx = m - 1 + months;
  const yy = y + Math.floor(idx / 12), mm = (idx % 12 + 12) % 12;
  const dim = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return [yy, mm + 1, Math.min(d, dim)];
}
function endOfDayMs(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 23, 59, 59) - CAT_OFFSET_MS;
}
function extendExpiry(existing, months, nowMs) {
  let base = catYMD(nowMs);
  if (typeof existing === "string" && existing) {
    let endMs = NaN, ymd = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(existing)) {
      endMs = endOfDayMs(existing);
      ymd = existing.split("-").map(Number);
    } else {
      const t = new Date(existing).getTime();
      if (!Number.isNaN(t)) {
        endMs = t;
        ymd = catYMD(t);
      }
    }
    if (!Number.isNaN(endMs) && endMs >= nowMs) base = ymd;
  }
  return ymdStr(addMonthsYMD(base, months));
}
function expiryToMs(v) {
  if (v === null || v === void 0 || v === "") return NaN;
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? endOfDayMs(v) : new Date(v).getTime();
  if (typeof v.toMillis === "function") return v.toMillis();
  return NaN;
}
function currentPremium(h) {
  const cfg = h && h.config && typeof h.config === "object" ? h.config : {};
  const active = h && h.isPremium === true || cfg.isPremium === true;
  const raw = [h && h.premiumExpiry, cfg.premiumExpiry];
  let best = null, bestMs = -Infinity;
  for (const v of raw) {
    const ms = expiryToMs(v);
    if (!Number.isNaN(ms) && ms > bestMs) {
      best = v;
      bestMs = ms;
    }
  }
  const expiry = best === null ? null : typeof best === "string" ? best : ymdStr(catYMD(bestMs));
  const anyRaw = !!(raw[0] || raw[1]);
  return { active, unlimited: active && !anyRaw, expiry };
}
var hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
function newTxRef() {
  return "by_" + Date.now().toString(36) + "_" + hex(crypto.getRandomValues(new Uint8Array(5)));
}
function hexToBytes(h) {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
function b64ToBytes(s) {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - t.length % 4) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
async function signatureOk(rawBody, header, secret) {
  if (!secret || !header) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));
  const h = String(header).trim();
  let given;
  if (/^[0-9a-f]{64}$/i.test(h)) given = hexToBytes(h);
  else {
    try {
      given = b64ToBytes(h);
    } catch (_) {
      return false;
    }
  }
  return sameBytes(given, mac);
}
function candidateRefs(body, query) {
  const out = /* @__PURE__ */ new Set();
  const take = (v) => {
    if (isTxRef(v)) out.add(v);
  };
  const b = body && typeof body === "object" ? body : {};
  [
    b.tx_ref,
    b.reference,
    b.charge_id,
    b.txRef,
    b.data && b.data.tx_ref,
    b.data && b.data.reference,
    b.meta && b.meta.tx_ref,
    query && query.tx_ref
  ].forEach(take);
  return [...out];
}
async function payChanguCreate({ fetchImpl, secretKey, payload }) {
  const r = await fetchImpl("https://api.paychangu.com/payment", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer " + secretKey },
    body: JSON.stringify(payload)
  });
  let j = null;
  try {
    j = await r.json();
  } catch (_) {
  }
  const url = j && j.data && j.data.checkout_url;
  if (!r.ok || !url) throw new Error("PayChangu create failed: HTTP " + r.status + " " + JSON.stringify(j || {}).slice(0, 300));
  return url;
}
async function payChanguVerify({ fetchImpl, secretKey, txRef }) {
  const r = await fetchImpl("https://api.paychangu.com/verify-payment/" + encodeURIComponent(txRef), {
    headers: { Accept: "application/json", Authorization: "Bearer " + secretKey }
  });
  let j = null;
  try {
    j = await r.json();
  } catch (_) {
  }
  if (r.status === 404) return { state: "pending" };
  if (!r.ok || !j || !j.data) throw new Error("PayChangu verify failed: HTTP " + r.status);
  const st = String(j.data.status || "").toLowerCase();
  if (st === "success" || st === "successful") return { state: "paid", amount: Number(j.data.amount), currency: String(j.data.currency || "") };
  if (st === "failed" || st === "cancelled" || st === "canceled") return { state: "failed" };
  return { state: "pending" };
}
async function createCheckout({ deps, uid, email, householdId, months, selfUrl, appUrl }) {
  const { db, fetchImpl, secretKey, now } = deps;
  if (!isCode(householdId)) return { code: 400, error: "Invalid household." };
  const price = PRICES[months];
  if (!price) return { code: 400, error: "Invalid plan." };
  const hh = await db.collection("households").doc(householdId).get();
  const h = hh.exists ? hh.data() : null;
  if (!h || !Array.isArray(h.memberUids) || !h.memberUids.includes(uid) || h.deletedAt) return { code: 403, error: "Not allowed." };
  const mine = await db.collection("payments").where("uid", "==", uid).limit(200).get();
  const since = now() - 10 * 60 * 1e3;
  if (mine.docs.filter((d) => (d.data().createdAtMs || 0) > since).length >= 5) return { code: 429, error: "Too many payment attempts. Please wait a few minutes." };
  const txRef = newTxRef();
  const payRef = db.collection("payments").doc(txRef);
  await payRef.set({ uid, householdId, months, amount: price, currency: CURRENCY, status: "pending", createdAtMs: now() });
  const payload = {
    amount: price,
    currency: CURRENCY,
    tx_ref: txRef,
    callback_url: selfUrl,
    return_url: appUrl + (appUrl.includes("?") ? "&" : "?") + "paid=1",
    customization: { title: "Bajeti Yanga Premium", description: months + (months === 1 ? " month" : " months") },
    meta: { householdId, uid }
  };
  if (typeof email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) payload.email = email;
  try {
    const url = await payChanguCreate({ fetchImpl, secretKey, payload });
    return { code: 200, body: { checkout_url: url, tx_ref: txRef } };
  } catch (e) {
    await payRef.update({ status: "init_failed", error: String(e.message).slice(0, 300) });
    return { code: 502, error: "Could not start the payment. Please try again.", detail: e.message };
  }
}
async function settlePayment({ deps, txRef }) {
  const { db, fetchImpl, secretKey, now, tsFromMillis: tsFromMillis2 } = deps;
  if (!isTxRef(txRef)) return { status: "unknown" };
  const payRef = db.collection("payments").doc(txRef);
  const first = await payRef.get();
  if (!first.exists) return { status: "unknown" };
  const p = first.data();
  if (p.status === "paid") return { status: "paid", premiumExpiry: p.premiumExpiry || null };
  if (p.status !== "pending") return { status: "failed" };
  const v = await payChanguVerify({ fetchImpl, secretKey, txRef });
  if (v.state === "failed") {
    await payRef.update({ status: "failed" });
    return { status: "failed" };
  }
  if (v.state !== "paid") {
    if (now() - (p.createdAtMs || 0) > PENDING_MAX_AGE_MS) {
      await payRef.update({ status: "expired" });
      return { status: "failed" };
    }
    return { status: "pending" };
  }
  if (!(v.amount >= p.amount) || v.currency !== CURRENCY) {
    await payRef.update({ status: "mismatch", paidAmount: v.amount || null, paidCurrency: v.currency || null });
    return { status: "failed" };
  }
  let result = { status: "paid", premiumExpiry: null };
  await db.runTransaction(async (tx) => {
    const ps = await tx.get(payRef);
    if (ps.data().status === "paid") {
      result = { status: "paid", premiumExpiry: ps.data().premiumExpiry || null };
      return;
    }
    const hhRef = db.collection("households").doc(p.householdId);
    const hs = await tx.get(hhRef);
    if (!hs.exists) {
      tx.update(payRef, { status: "paid_no_household", paidAtMs: now() });
      result = { status: "failed" };
      return;
    }
    const h = hs.data();
    const cur = currentPremium(h);
    const wasUnlimited = cur.unlimited;
    const expiry = wasUnlimited ? null : extendExpiry(cur.active ? cur.expiry : null, p.months, now());
    if (!wasUnlimited) {
      const upd = { isPremium: true, premiumExpiry: expiry };
      if (h.isPremium !== true) upd.premiumActivatedAt = new Date(now()).toISOString();
      tx.update(hhRef, upd);
      if (h.owner) {
        const uRef = db.collection("users").doc(h.owner);
        const us = await tx.get(uRef);
        const cur2 = us.exists && us.data().premiumUntil && us.data().premiumUntil.toMillis ? us.data().premiumUntil.toMillis() : 0;
        tx.set(uRef, { premiumUntil: tsFromMillis2(Math.max(cur2, endOfDayMs(expiry))) }, { merge: true });
      }
    }
    const extra = wasUnlimited ? { note: "household already had Premium with no end date; nothing was extended" } : {};
    if (wasUnlimited) console.warn("payment on a household with unlimited Premium, check for a refund:", txRef);
    tx.update(payRef, { status: "paid", paidAtMs: now(), premiumExpiry: expiry, ...extra });
    result = { status: "paid", premiumExpiry: expiry };
  });
  return result;
}
async function reconcilePending({ deps, limit = 50 }) {
  const snap2 = await deps.db.collection("payments").where("status", "==", "pending").limit(limit).get();
  const out = [];
  for (const d of snap2.docs) {
    try {
      out.push([d.id, (await settlePayment({ deps, txRef: d.id })).status]);
    } catch (e) {
      out.push([d.id, "error: " + e.message]);
    }
  }
  return out;
}

// src/firestore.js
var enc2 = new TextEncoder();
var Ts = class {
  // a Firestore timestamp
  constructor(ms) {
    this.ms = ms;
  }
  toMillis() {
    return this.ms;
  }
};
var tsFromMillis = (ms) => new Ts(ms);
function encodeValue(v) {
  if (v === null) return { nullValue: null };
  if (v instanceof Ts) return { timestampValue: new Date(v.ms).toISOString() };
  switch (typeof v) {
    case "boolean":
      return { booleanValue: v };
    case "number":
      return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    case "string":
      return { stringValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === "object") return { mapValue: { fields: encodeFields(v) } };
  throw new Error("cannot store a value of type " + typeof v);
}
function encodeFields(obj) {
  const f = {};
  for (const [k, v] of Object.entries(obj)) if (v !== void 0) f[k] = encodeValue(v);
  return f;
}
function decodeValue(f) {
  if (!f) return void 0;
  if ("nullValue" in f) return null;
  if ("booleanValue" in f) return f.booleanValue;
  if ("integerValue" in f) return Number(f.integerValue);
  if ("doubleValue" in f) return f.doubleValue;
  if ("stringValue" in f) return f.stringValue;
  if ("timestampValue" in f) return new Ts(Date.parse(f.timestampValue));
  if ("arrayValue" in f) return (f.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in f) return decodeFields(f.mapValue.fields || {});
  return void 0;
}
function decodeFields(fields) {
  const o = {};
  for (const k of Object.keys(fields || {})) o[k] = decodeValue(fields[k]);
  return o;
}
var fieldPath = (k) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : "`" + k.replace(/\\/g, "\\\\").replace(/`/g, "\\`") + "`";
var b64url = (bytes) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
async function importPrivateKey(pem) {
  const body = String(pem).replace(/\\n/g, "\n").replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}
function makeTokenProvider({ serviceAccountJson, fetchImpl = fetch, now = Date.now }) {
  let sa;
  try {
    sa = typeof serviceAccountJson === "string" ? JSON.parse(serviceAccountJson) : serviceAccountJson;
  } catch (_) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT is not valid JSON. Paste the whole key file.");
  }
  if (!sa || !sa.client_email || !sa.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT is missing client_email or private_key.");
  let cached = null, keyPromise = null;
  return async function getToken() {
    if (cached && cached.exp - 6e4 > now()) return cached.token;
    keyPromise = keyPromise || importPrivateKey(sa.private_key);
    const key = await keyPromise;
    const iat = Math.floor(now() / 1e3);
    const header = { alg: "RS256", typ: "JWT" };
    const claims = { iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 };
    const input = b64url(enc2.encode(JSON.stringify(header))) + "." + b64url(enc2.encode(JSON.stringify(claims)));
    const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc2.encode(input)));
    const r = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + input + "." + b64url(sig)
    });
    let j = null;
    try {
      j = await r.json();
    } catch (_) {
    }
    if (!r.ok || !j || !j.access_token) throw new Error("Google sign-in failed: " + (j && (j.error_description || j.error) || r.status));
    cached = { token: j.access_token, exp: now() + (Number(j.expires_in) || 3600) * 1e3 };
    return cached.token;
  };
}
var OPS = { "==": "EQUAL", ">": "GREATER_THAN", "<": "LESS_THAN", ">=": "GREATER_THAN_OR_EQUAL", "<=": "LESS_THAN_OR_EQUAL" };
var FirestoreRest = class {
  constructor({ projectId, getToken, fetchImpl = fetch }) {
    this.getToken = getToken;
    this.fetchImpl = fetchImpl;
    this.root = `projects/${projectId}/databases/(default)/documents`;
    this.base = "https://firestore.googleapis.com/v1/";
  }
  async _send(method, url, body) {
    const r = await (0, this.fetchImpl)(url, {
      method,
      headers: { Authorization: "Bearer " + await this.getToken(), "Content-Type": "application/json" },
      body: body === void 0 ? void 0 : JSON.stringify(body)
    });
    let j = null;
    try {
      j = await r.json();
    } catch (_) {
    }
    return { status: r.status, ok: r.ok, json: j };
  }
  _fail(res, what) {
    const msg = res.json && res.json.error && res.json.error.message || "";
    const e = new Error("Firestore " + what + " failed: HTTP " + res.status + (msg ? " " + String(msg).slice(0, 200) : ""));
    e.status = res.status;
    return e;
  }
  async _post(suffix, body, what) {
    const res = await this._send("POST", this.base + this.root + suffix, body);
    if (!res.ok) throw this._fail(res, what || suffix);
    return res.json;
  }
  _docUrl(path) {
    return this.base + this.root + "/" + path.split("/").map(encodeURIComponent).join("/");
  }
  async _getDoc(path, txId) {
    const url = this._docUrl(path) + (txId ? "?transaction=" + encodeURIComponent(txId) : "");
    const res = await this._send("GET", url);
    if (res.status === 404) return snap(path.split("/").pop(), null);
    if (!res.ok) throw this._fail(res, "read");
    return snap(path.split("/").pop(), decodeFields(res.json.fields));
  }
  async _patch(path, data, { mask, mustExist }) {
    const q = [];
    if (mask) for (const k of Object.keys(data).filter((k2) => data[k2] !== void 0)) q.push("updateMask.fieldPaths=" + encodeURIComponent(fieldPath(k)));
    if (mustExist) q.push("currentDocument.exists=true");
    const res = await this._send("PATCH", this._docUrl(path) + (q.length ? "?" + q.join("&") : ""), { fields: encodeFields(data) });
    if (!res.ok) throw this._fail(res, "write");
  }
  collection(name) {
    return new Col(this, name);
  }
  // Runs fn(tx) and commits its writes in one go. Reads inside fn lock the documents; if another request got there
  // first Firestore answers 409 (aborted) and the whole function is simply run again, up to 3 times.
  async runTransaction(fn) {
    for (let attempt = 1; ; attempt++) {
      const { transaction } = await this._post(":beginTransaction", { options: { readWrite: {} } }, "begin");
      const writes = [];
      const name = (ref) => this.root + "/" + ref.path;
      const tx = {
        get: (ref) => this._getDoc(ref.path, transaction),
        set: (ref, data, opts) => writes.push(opts && opts.merge ? { update: { name: name(ref), fields: encodeFields(data) }, updateMask: { fieldPaths: Object.keys(data).filter((k) => data[k] !== void 0).map(fieldPath) } } : { update: { name: name(ref), fields: encodeFields(data) } }),
        update: (ref, data) => writes.push({
          update: { name: name(ref), fields: encodeFields(data) },
          updateMask: { fieldPaths: Object.keys(data).filter((k) => data[k] !== void 0).map(fieldPath) },
          currentDocument: { exists: true }
        })
      };
      let result;
      try {
        result = await fn(tx);
      } catch (e) {
        await this._post(":rollback", { transaction }, "rollback").catch(() => {
        });
        throw e;
      }
      try {
        await this._post(":commit", { writes, transaction }, "commit");
        return result;
      } catch (e) {
        if (e.status === 409 && attempt < 3) continue;
        throw e;
      }
    }
  }
};
function snap(id, data) {
  return { id, exists: data !== null, data: () => data === null ? void 0 : data };
}
var Col = class {
  constructor(db, name) {
    this.db = db;
    this.name = name;
  }
  doc(id) {
    return new DocRef(this.db, this.name + "/" + id);
  }
  where(f, op, v) {
    return new Query(this.db, this.name, [[f, op, v]], 0);
  }
  limit(n) {
    return new Query(this.db, this.name, [], n);
  }
  get() {
    return new Query(this.db, this.name, [], 0).get();
  }
};
var DocRef = class {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split("/").pop();
  }
  get() {
    return this.db._getDoc(this.path);
  }
  set(data, opts) {
    return this.db._patch(this.path, data, { mask: !!(opts && opts.merge) });
  }
  update(data) {
    return this.db._patch(this.path, data, { mask: true, mustExist: true });
  }
};
var Query = class _Query {
  constructor(db, name, filters, lim) {
    this.db = db;
    this.name = name;
    this.filters = filters;
    this.lim = lim;
  }
  where(f, op, v) {
    return new _Query(this.db, this.name, [...this.filters, [f, op, v]], this.lim);
  }
  limit(n) {
    return new _Query(this.db, this.name, this.filters, n);
  }
  async get() {
    const fs = this.filters.map(([f, op, v]) => {
      if (!OPS[op]) throw new Error("unsupported operator " + op);
      return { fieldFilter: { field: { fieldPath: f }, op: OPS[op], value: encodeValue(v) } };
    });
    const sq = { from: [{ collectionId: this.name }] };
    if (fs.length === 1) sq.where = fs[0];
    else if (fs.length > 1) sq.where = { compositeFilter: { op: "AND", filters: fs } };
    if (this.lim) sq.limit = this.lim;
    const rows = await this.db._post(":runQuery", { structuredQuery: sq }, "query");
    const docs = (rows || []).filter((r) => r.document).map((r) => snap(r.document.name.split("/").pop(), decodeFields(r.document.fields)));
    return { docs, size: docs.length, forEach: (fn) => docs.forEach(fn) };
  }
};

// src/auth.js
var enc3 = new TextEncoder();
var JWK_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
var KEY_TTL_MS = 60 * 60 * 1e3;
var keyCache = { at: 0, keys: /* @__PURE__ */ new Map() };
function b64urlBytes(s) {
  const t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(t + "=".repeat((4 - t.length % 4) % 4)), (c) => c.charCodeAt(0));
}
var b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
async function getKey(kid, fetchImpl) {
  const fresh = Date.now() - keyCache.at < KEY_TTL_MS;
  if (!fresh || !keyCache.keys.has(kid)) {
    const r = await fetchImpl(JWK_URL);
    if (!r.ok) throw new Error("could not load Google keys");
    const j = await r.json();
    const keys = /* @__PURE__ */ new Map();
    for (const k of j.keys || []) keys.set(k.kid, k);
    keyCache = { at: Date.now(), keys };
  }
  const jwk = keyCache.keys.get(kid);
  if (!jwk) throw new Error("unknown key id");
  return crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
}
async function verifyFirebaseToken(token, env, fetchImpl = fetch, nowMs = Date.now()) {
  const projectId = env && env.FIREBASE_PROJECT_ID || "bajeti-yanga";
  const parts = String(token).split(".");
  if (parts.length !== 3) throw new Error("malformed");
  const header = b64urlJson(parts[0]);
  const payload = b64urlJson(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("bad header");
  const now = Math.floor(nowMs / 1e3);
  if (payload.aud !== projectId) throw new Error("wrong audience");
  if (payload.iss !== "https://securetoken.google.com/" + projectId) throw new Error("wrong issuer");
  if (!(payload.exp > now)) throw new Error("expired");
  if (!(payload.iat <= now + 60)) throw new Error("issued in the future");
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) throw new Error("bad subject");
  const key = await getKey(header.kid, fetchImpl);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]), enc3.encode(parts[0] + "." + parts[1]));
  if (!ok) throw new Error("bad signature");
  return { uid: payload.sub, email: typeof payload.email === "string" ? payload.email : null };
}

// src/index.js
var DEFAULT_APP_URL = "https://rodart265.github.io/bajeti-yanga/";
function corsHeaders(req, env) {
  const origin = req.headers.get("Origin");
  const allowed = String(env.ALLOWED_ORIGINS || "https://rodart265.github.io").split(",").map((s) => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400"
    };
  }
  return { Vary: "Origin" };
}
var json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
var shared = { sig: null, db: null };
function makeDeps(env, injected) {
  if (injected && injected.db) {
    return { db: injected.db, fetchImpl: injected.fetchImpl || fetch, secretKey: env.PAYCHANGU_SECRET_KEY, now: injected.now || Date.now, tsFromMillis: injected.tsFromMillis || tsFromMillis };
  }
  const projectId = env.FIREBASE_PROJECT_ID || "bajeti-yanga";
  const sig = projectId + "|" + env.GOOGLE_SERVICE_ACCOUNT;
  if (shared.sig !== sig) {
    const getToken = makeTokenProvider({ serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT });
    shared = { sig, db: new FirestoreRest({ projectId, getToken }) };
  }
  return { db: shared.db, fetchImpl: fetch, secretKey: env.PAYCHANGU_SECRET_KEY, now: Date.now, tsFromMillis };
}
function missingSettings(env) {
  return ["PAYCHANGU_SECRET_KEY", "PAYCHANGU_WEBHOOK_SECRET", "GOOGLE_SERVICE_ACCOUNT"].filter((k) => !env[k]);
}
var index_default = {
  async fetch(req, env, ctx, injected = {}) {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);
    const appUrl = env.APP_URL || DEFAULT_APP_URL;
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method === "GET" && url.pathname === "/health") {
      const missing = missingSettings(env);
      return json(200, { ok: missing.length === 0, missing }, cors);
    }
    if (!injected.db) {
      const missing = missingSettings(env);
      if (missing.length) {
        console.error("payments not set up, missing:", missing.join(", "));
        return json(503, { error: "Payments are not set up yet." }, cors);
      }
    }
    let deps;
    try {
      deps = makeDeps(env, injected);
    } catch (e) {
      console.error("setup problem:", e.message);
      return json(503, { error: "Payments are not set up yet." }, cors);
    }
    try {
      if (req.method === "GET") {
        const refs = candidateRefs(null, { tx_ref: url.searchParams.get("tx_ref") });
        if (!refs.length) return new Response("ok", { status: 200 });
        for (const ref of refs) await settlePayment({ deps, txRef: ref }).catch((e) => console.error("settle failed", ref, e.message));
        return Response.redirect(appUrl + (appUrl.includes("?") ? "&" : "?") + "paid=1", 302);
      }
      if (req.method !== "POST") return json(405, { error: "POST only" }, cors);
      const raw = new Uint8Array(await req.arrayBuffer());
      let body = {};
      try {
        body = JSON.parse(new TextDecoder().decode(raw));
      } catch (_) {
      }
      const signature = req.headers.get("signature");
      if (signature) {
        if (!await signatureOk(raw, signature, env.PAYCHANGU_WEBHOOK_SECRET)) return json(401, { error: "bad signature" });
        for (const ref of candidateRefs(body, { tx_ref: url.searchParams.get("tx_ref") })) {
          await settlePayment({ deps, txRef: ref }).catch((e) => console.error("settle failed", ref, e.message));
        }
        return json(200, { ok: true });
      }
      const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") || "");
      if (!m) return json(401, { error: "Please sign in again." }, cors);
      let user;
      try {
        user = await verifyFirebaseToken(m[1], env, injected.fetchImpl || fetch, deps.now());
      } catch (_) {
        return json(401, { error: "Please sign in again." }, cors);
      }
      if (body.action === "checkout") {
        const out = await createCheckout({ deps, uid: user.uid, email: user.email, householdId: body.householdId, months: Number(body.months), selfUrl: url.origin + "/", appUrl });
        if (out.detail) console.error("checkout failed", out.detail);
        return json(out.code, out.body || { error: out.error }, cors);
      }
      if (body.action === "check") {
        if (!isTxRef(body.txRef)) return json(400, { error: "Invalid reference." }, cors);
        const pay = await deps.db.collection("payments").doc(body.txRef).get();
        if (!pay.exists || pay.data().uid !== user.uid) return json(404, { error: "Payment not found." }, cors);
        return json(200, await settlePayment({ deps, txRef: body.txRef }), cors);
      }
      return json(400, { error: "Unknown action." }, cors);
    } catch (e) {
      console.error("payments error", e && e.message);
      return json(500, { error: "Something went wrong. Please try again." }, cors);
    }
  },
  // Every 15 minutes: settle payments that are still "pending" (webhook missed, customer closed the page, ...).
  async scheduled(event, env, ctx, injected = {}) {
    if (!injected.db && missingSettings(env).length) {
      console.error("reconcile skipped, not set up");
      return;
    }
    const run = (async () => {
      const out = await reconcilePending({ deps: makeDeps(env, injected) });
      if (out.length) console.log("reconciled", JSON.stringify(out));
      return out;
    })().catch((e) => {
      console.error("reconcile failed", e && e.message);
      return [];
    });
    if (ctx && ctx.waitUntil) ctx.waitUntil(run);
    return run;
  }
};
export {
  index_default as default
};
