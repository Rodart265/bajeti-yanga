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
    let endMs = NaN, ymd2 = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(existing)) {
      endMs = endOfDayMs(existing);
      ymd2 = existing.split("-").map(Number);
    } else {
      const t = new Date(existing).getTime();
      if (!Number.isNaN(t)) {
        endMs = t;
        ymd2 = catYMD(t);
      }
    }
    if (!Number.isNaN(endMs) && endMs >= nowMs) base = ymd2;
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
var DELETE = /* @__PURE__ */ Symbol("delete field");
function randomId(prefix) {
  const b = crypto.getRandomValues(new Uint8Array(5));
  return prefix + "_" + Date.now().toString(36) + "_" + [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
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
  for (const [k, v] of Object.entries(obj)) {
    if (v === void 0 || v === DELETE) continue;
    if (k.includes(".")) throw new Error("a dotted field name can only be used with DELETE: " + k);
    f[k] = encodeValue(v);
  }
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
var seg = (k) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : "`" + k.replace(/\\/g, "\\\\").replace(/`/g, "\\`") + "`";
var fieldPath = (k) => String(k).split(".").map(seg).join(".");
var maskOf = (data) => Object.keys(data).filter((k) => data[k] !== void 0).map(fieldPath);
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
function makeTokenProvider({ serviceAccountJson, fetchImpl = fetch, now = Date.now, scope = "https://www.googleapis.com/auth/datastore" }) {
  let sa;
  try {
    sa = typeof serviceAccountJson === "string" ? JSON.parse(serviceAccountJson) : serviceAccountJson;
  } catch (_) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT is not valid JSON. Paste the whole key file.");
  }
  if (!sa || !sa.client_email || !sa.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT is missing client_email or private_key.");
  let cached2 = null, keyPromise = null;
  return async function getToken() {
    if (cached2 && cached2.exp - 6e4 > now()) return cached2.token;
    keyPromise = keyPromise || importPrivateKey(sa.private_key);
    const key = await keyPromise;
    const iat = Math.floor(now() / 1e3);
    const header = { alg: "RS256", typ: "JWT" };
    const claims = { iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 };
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
    cached2 = { token: j.access_token, exp: now() + (Number(j.expires_in) || 3600) * 1e3 };
    return cached2.token;
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
  async _getDoc(path, txId, fields) {
    const q = [];
    if (txId) q.push("transaction=" + encodeURIComponent(txId));
    if (fields) for (const f of fields) q.push("mask.fieldPaths=" + encodeURIComponent(fieldPath(f)));
    const url = this._docUrl(path) + (q.length ? "?" + q.join("&") : "");
    const res = await this._send("GET", url);
    if (res.status === 404) return snap(path.split("/").pop(), null);
    if (!res.ok) throw this._fail(res, "read");
    return snap(path.split("/").pop(), decodeFields(res.json.fields), res.json);
  }
  async _delete(path) {
    const res = await this._send("DELETE", this._docUrl(path));
    if (!res.ok && res.status !== 404) throw this._fail(res, "delete");
  }
  async _patch(path, data, { mask, mustExist }) {
    const q = [];
    if (mask) for (const fp of maskOf(data)) q.push("updateMask.fieldPaths=" + encodeURIComponent(fp));
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
        get: (ref, fields) => this._getDoc(ref.path, transaction, fields),
        set: (ref, data, opts) => writes.push(opts && opts.merge ? { update: { name: name(ref), fields: encodeFields(data) }, updateMask: { fieldPaths: maskOf(data) } } : { update: { name: name(ref), fields: encodeFields(data) } }),
        update: (ref, data) => writes.push({
          update: { name: name(ref), fields: encodeFields(data) },
          updateMask: { fieldPaths: maskOf(data) },
          currentDocument: { exists: true }
        }),
        delete: (ref) => writes.push({ delete: name(ref) })
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
function snap(id, data, raw) {
  const t = raw && raw.createTime ? Date.parse(raw.createTime) : null;
  return { id, exists: data !== null, createTime: Number.isNaN(t) ? null : t, data: () => data === null ? void 0 : data };
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
  orderBy(f, dir) {
    return new Query(this.db, this.name, [], 0).orderBy(f, dir);
  }
  select(...fields) {
    return new Query(this.db, this.name, [], 0).select(...fields);
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
  get(fields) {
    return this.db._getDoc(this.path, null, fields);
  }
  set(data, opts) {
    return this.db._patch(this.path, data, { mask: !!(opts && opts.merge) });
  }
  update(data) {
    return this.db._patch(this.path, data, { mask: true, mustExist: true });
  }
  delete() {
    return this.db._delete(this.path);
  }
};
var Query = class _Query {
  constructor(db, name, filters, lim, order = [], sel = null) {
    this.db = db;
    this.name = name;
    this.filters = filters;
    this.lim = lim;
    this.order = order;
    this.sel = sel;
  }
  _with(o) {
    return new _Query(this.db, this.name, o.filters || this.filters, o.lim === void 0 ? this.lim : o.lim, o.order || this.order, o.sel === void 0 ? this.sel : o.sel);
  }
  where(f, op, v) {
    return this._with({ filters: [...this.filters, [f, op, v]] });
  }
  limit(n) {
    return this._with({ lim: n });
  }
  orderBy(f, dir = "asc") {
    return this._with({ order: [...this.order, [f, String(dir).toLowerCase() === "desc" ? "DESCENDING" : "ASCENDING"]] });
  }
  // Only these fields come back (dotted paths reach inside maps). Keeps big documents (budgets) off the wire.
  select(...fields) {
    return this._with({ sel: fields });
  }
  async get() {
    const fs = this.filters.map(([f, op, v]) => {
      if (!OPS[op]) throw new Error("unsupported operator " + op);
      return { fieldFilter: { field: { fieldPath: f }, op: OPS[op], value: encodeValue(v) } };
    });
    const sq = { from: [{ collectionId: this.name }] };
    if (fs.length === 1) sq.where = fs[0];
    else if (fs.length > 1) sq.where = { compositeFilter: { op: "AND", filters: fs } };
    if (this.order.length) sq.orderBy = this.order.map(([f, d]) => ({ field: { fieldPath: fieldPath(f) }, direction: d }));
    if (this.sel) sq.select = { fields: this.sel.map((f) => ({ fieldPath: fieldPath(f) })) };
    if (this.lim) sq.limit = this.lim;
    const rows = await this.db._post(":runQuery", { structuredQuery: sq }, "query");
    const docs = (rows || []).filter((r) => r.document).map((r) => snap(r.document.name.split("/").pop(), decodeFields(r.document.fields), r.document));
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
  const u = await verifyFirebaseTokenFull(token, env, fetchImpl, nowMs);
  return { uid: u.uid, email: u.email };
}
async function verifyFirebaseTokenFull(token, env, fetchImpl = fetch, nowMs = Date.now()) {
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
  const ok2 = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]), enc3.encode(parts[0] + "." + parts[1]));
  if (!ok2) throw new Error("bad signature");
  return {
    uid: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    emailVerified: payload.email_verified === true,
    provider: payload.firebase && typeof payload.firebase.sign_in_provider === "string" ? payload.firebase.sign_in_provider : null,
    authTime: Number(payload.auth_time) || 0
  };
}

// src/admin.js
var DAY = 864e5;
var HOUR = 36e5;
var TRIAL_DAYS = 14;
var FRESH_SECONDS = 30 * 60;
var READ_ACTIONS = [
  "whoami",
  "overview",
  "attention",
  "households",
  "household",
  "users",
  "payments",
  "premium",
  "chipereganyu",
  "announcements",
  "settings",
  "log"
];
var WRITE_ROLES = {
  recheck_payment: ["owner", "support"],
  payment_note: ["owner", "support"],
  premium_set: ["owner"],
  user_disable: ["owner"],
  announcement_save: ["owner"],
  announcement_delete: ["owner"],
  settings_save: ["owner"]
};
var NEEDS_FRESH = /* @__PURE__ */ new Set(["premium_set", "user_disable", "announcement_save", "announcement_delete", "settings_save"]);
var parseList = (s) => new Set(String(s || "").split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean));
function adminLists(env) {
  return { owner: parseList(env.ADMIN_OWNERS || env.ADMIN_EMAILS), support: parseList(env.ADMIN_SUPPORT), analyst: parseList(env.ADMIN_ANALYSTS) };
}
function roleOf(email, env) {
  const e = String(email || "").toLowerCase();
  if (!e) return null;
  const l = adminLists(env);
  return l.owner.has(e) ? "owner" : l.support.has(e) ? "support" : l.analyst.has(e) ? "analyst" : null;
}
function authorize({ user, env, action, nowMs }) {
  const l = adminLists(env);
  if (!l.owner.size && !l.support.size && !l.analyst.size) return { ok: false, code: 503, error: "The admin console is not set up yet. Add ADMIN_OWNERS in Cloudflare." };
  if (!user || !user.email || !user.emailVerified || user.provider !== "google.com") return { ok: false, code: 403, error: "Not allowed.", denied: true };
  const role = roleOf(user.email, env);
  if (!role) return { ok: false, code: 403, error: "Not allowed.", denied: true };
  const isRead = READ_ACTIONS.includes(action), allowed = WRITE_ROLES[action];
  if (!isRead && !allowed) return { ok: false, code: 400, error: "Unknown action." };
  if (allowed && !allowed.includes(role)) return { ok: false, code: 403, error: "Your role cannot do that." };
  if (NEEDS_FRESH.has(action) && !(nowMs / 1e3 - Number(user.authTime || 0) <= FRESH_SECONDS)) {
    return { ok: false, code: 401, error: "Sign in again to make changes.", needsFreshSignIn: true };
  }
  return { ok: true, role, email: String(user.email).toLowerCase(), uid: user.uid };
}
var Fail = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
var pad2 = (n) => String(n).padStart(2, "0");
var ymd = (ms) => {
  const [y, m, d] = catYMD(ms);
  return `${y}-${pad2(m)}-${pad2(d)}`;
};
var isYMD = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
var realYMD = (s) => {
  if (!isYMD(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
var ymdMs = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
var daysBetween = (a, b) => Math.round((ymdMs(b) - ymdMs(a)) / DAY);
var tsMs = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};
var expiryMs = (v) => isYMD(v) ? endOfDayMs(v) : tsMs(v);
var asDate = (v) => v === null || v === void 0 || v === "" ? null : isYMD(v) ? v : tsMs(v) === null ? null : ymd(tsMs(v));
var cleanLine = (s, max) => String(s === null || s === void 0 ? "" : s).replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
var cleanBlock = (s, max) => String(s === null || s === void 0 ? "" : s).replace(/\r/g, "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ").trim().slice(0, max);
var ok = (body) => ({ code: 200, body });
var asInt = (v, lo, hi) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};
var HH_FIELDS = [
  "name",
  "owner",
  "memberUids",
  "isPremium",
  "premiumExpiry",
  "premiumActivatedAt",
  "trialStarted",
  "deletedAt",
  "premiumAdminAt",
  "premiumAdminBy",
  "config.isPremium",
  "config.premiumExpiry",
  "config.premiumActivatedAt",
  "config.trialStarted"
];
var USER_FIELDS = ["displayName", "email", "householdId", "ownedHouseholds", "premiumUntil", "pendingDeletion", "trialClaimedAt"];
var PAY_FIELDS = [
  "uid",
  "householdId",
  "months",
  "amount",
  "currency",
  "status",
  "createdAtMs",
  "paidAtMs",
  "premiumExpiry",
  "source",
  "note",
  "adminNote",
  "adminResolved",
  "paidAmount",
  "by"
];
var GROUP_FIELDS = [
  "name",
  "status",
  "createdBy",
  "createdAt",
  "frequency",
  "contributionAmount",
  "dueDay",
  "memberUids",
  "currentCycle.cycleNumber",
  "currentCycle.lap",
  "currentCycle.dueDate",
  "currentCycle.amount",
  "currentCycle.contributions"
];
var memos = /* @__PURE__ */ new WeakMap();
async function cached(ctx, key, fn) {
  const ttl = Number(ctx.env.ADMIN_CACHE_SECONDS === void 0 ? 30 : ctx.env.ADMIN_CACHE_SECONDS) * 1e3;
  if (!(ttl > 0)) return fn();
  let m = memos.get(ctx.deps.db);
  if (!m) {
    m = /* @__PURE__ */ new Map();
    memos.set(ctx.deps.db, m);
  }
  const hit = m.get(key);
  if (hit && !ctx.fresh && ctx.now - hit.at < ttl) return hit.v;
  const v = await fn();
  m.set(key, { at: ctx.now, v });
  return v;
}
var forgetCache = (ctx) => memos.delete(ctx.deps.db);
var loadHouseholds = (ctx) => cached(ctx, "hh", async () => (await ctx.deps.db.collection("households").select(...HH_FIELDS).get()).docs.map((d) => ({ id: d.id, created: d.createTime, ...d.data() })));
var loadUserDocs = (ctx) => cached(ctx, "ud", async () => (await ctx.deps.db.collection("users").select(...USER_FIELDS).get()).docs.map((d) => ({ id: d.id, ...d.data() })));
var loadPayments = (ctx, n) => cached(ctx, "pay" + n, async () => (await ctx.deps.db.collection("payments").orderBy("createdAtMs", "desc").limit(n).select(...PAY_FIELDS).get()).docs.map((d) => ({ id: d.id, ...d.data() })));
var loadAuth = (ctx) => cached(ctx, "auth", async () => {
  try {
    return { ok: true, list: await ctx.identity.listUsers() };
  } catch (e) {
    return { ok: false, status: e.status || 0, message: String(e.message || e).slice(0, 200) };
  }
});
function peopleMap(auth, userDocs) {
  const m = /* @__PURE__ */ new Map();
  if (auth.ok) auth.list.forEach((u) => m.set(u.uid, { ...u, name: u.email || u.phone || u.uid }));
  userDocs.forEach((d) => {
    if (!m.has(d.id)) m.set(d.id, { uid: d.id, email: d.email || null, phone: null, name: d.email || d.displayName || d.id, created: null, lastSignIn: null, disabled: false, providers: [] });
  });
  return m;
}
var nameOf = (people, uid) => uid ? (people.get(uid) || {}).name || uid : null;
function premiumInfo(h, now) {
  const cur = currentPremium(h);
  const cfg = h.config && typeof h.config === "object" ? h.config : {};
  const eMs = cur.active && cur.expiry ? expiryMs(cur.expiry) : null;
  const trialStarted = tsMs(h.trialStarted) !== null ? tsMs(h.trialStarted) : tsMs(cfg.trialStarted);
  let state;
  if (cur.active) state = cur.unlimited || eMs === null || eMs >= now ? "premium" : "premium_expired";
  else if (trialStarted !== null) state = now - trialStarted < TRIAL_DAYS * DAY ? "trial" : "trial_ended";
  else state = "free";
  return {
    state,
    active: cur.active,
    unlimited: cur.unlimited,
    expiry: cur.expiry ? asDate(cur.expiry) : null,
    expiryMs: eMs,
    daysLeft: state === "premium" && eMs !== null ? Math.ceil((eMs - now) / DAY) : null,
    trialStarted,
    trialDaysLeft: state === "trial" ? Math.max(0, TRIAL_DAYS - Math.floor((now - trialStarted) / DAY)) : null,
    legacyOnly: cfg.isPremium === true && h.isPremium !== true,
    rootActive: h.isPremium === true,
    rootExpiry: asDate(h.premiumExpiry),
    configActive: cfg.isPremium === true,
    configExpiry: asDate(cfg.premiumExpiry)
  };
}
var brief = (i) => ({ state: i.state, expiry: i.expiry, unlimited: i.unlimited, rootActive: i.rootActive, rootExpiry: i.rootExpiry, configActive: i.configActive, configExpiry: i.configExpiry });
function aggregatePayments(pays) {
  const by = /* @__PURE__ */ new Map();
  for (const p of pays) {
    if (!p.householdId) continue;
    let a = by.get(p.householdId);
    if (!a) {
      a = { paidCount: 0, paidTotal: 0, lastPaidAt: 0, lastExpiry: null, maxExpiryMs: 0 };
      by.set(p.householdId, a);
    }
    if (p.status !== "paid") continue;
    a.paidCount++;
    a.paidTotal += Number(p.amount) || 0;
    a.lastPaidAt = Math.max(a.lastPaidAt, p.paidAtMs || 0);
    const em = isYMD(p.premiumExpiry) ? endOfDayMs(p.premiumExpiry) : 0;
    if (em > a.maxExpiryMs) {
      a.maxExpiryMs = em;
      a.lastExpiry = p.premiumExpiry;
    }
  }
  return by;
}
function lookReason(p, now) {
  if (p.adminResolved === true) return null;
  const age = now - (p.createdAtMs || 0);
  if (p.status === "pending" && age > HOUR && age < 3 * DAY) return "Still pending after an hour";
  if (p.status === "mismatch") return "Amount paid did not match the price";
  if (p.status === "paid_no_household") return "Paid, but the household no longer exists";
  if (p.status === "init_failed") return "Could not be started at PayChangu";
  if (p.status === "paid" && /no end date/i.test(String(p.note || ""))) return "Household already had unlimited Premium (refund?)";
  return null;
}
var payRow = (p, now, people) => ({
  id: p.id,
  uid: p.uid || null,
  who: nameOf(people, p.uid),
  householdId: p.householdId || null,
  months: p.months || null,
  amount: Number(p.amount) || 0,
  status: p.status || "unknown",
  createdAtMs: p.createdAtMs || null,
  paidAtMs: p.paidAtMs || null,
  premiumExpiry: p.premiumExpiry || null,
  source: p.source || "paychangu",
  note: p.note || null,
  adminNote: p.adminNote || null,
  resolved: p.adminResolved === true,
  look: lookReason(p, now)
});
function hhRow(h, now, people, agg) {
  const i = premiumInfo(h, now), a = agg.get(h.id);
  return {
    id: h.id,
    name: h.name || null,
    owner: h.owner || null,
    ownerName: nameOf(people, h.owner),
    members: Array.isArray(h.memberUids) ? h.memberUids.length : 0,
    created: h.created || null,
    deleted: !!h.deletedAt,
    state: i.state,
    expiry: i.expiry,
    daysLeft: i.daysLeft,
    unlimited: i.unlimited,
    trialDaysLeft: i.trialDaysLeft,
    legacy: i.legacyOnly,
    paid: a ? a.paidCount : 0,
    lastPaidAt: a && a.lastPaidAt ? a.lastPaidAt : null
  };
}
function buildAttention({ hhs, pays, now, people }) {
  const items = [], agg = aggregatePayments(pays);
  for (const p of pays) {
    const why = lookReason(p, now);
    if (!why) continue;
    const high = p.status === "pending" || p.status === "paid_no_household" || p.status === "mismatch";
    items.push({
      id: "pay:" + p.id,
      kind: "payment",
      severity: high ? "high" : "medium",
      title: why,
      at: p.createdAtMs || 0,
      detail: `${nameOf(people, p.uid) || "Unknown customer"} \xB7 MK ${(Number(p.amount) || 0).toLocaleString("en-GB")} \xB7 ${p.months || "?"} month${p.months === 1 ? "" : "s"}`,
      ref: { type: "payment", id: p.id, householdId: p.householdId || null },
      canRecheck: p.status === "pending"
    });
  }
  for (const h of hhs) {
    if (h.deletedAt) continue;
    const i = premiumInfo(h, now), a = agg.get(h.id);
    if (i.legacyOnly) items.push({
      id: "legacy:" + h.id,
      kind: "household",
      severity: "low",
      title: "Premium is only in the old config field",
      detail: `${h.id} \xB7 ${nameOf(people, h.owner) || "no owner"} \xB7 ends ${i.expiry || "no end date"}. It works, but move it to the new fields.`,
      at: 0,
      ref: { type: "household", id: h.id }
    });
    if (i.rootExpiry && i.configExpiry && i.rootExpiry !== i.configExpiry) items.push({
      id: "dates:" + h.id,
      kind: "household",
      severity: "medium",
      title: "Two different Premium end dates",
      detail: `${h.id} \xB7 new field ${i.rootExpiry}, old field ${i.configExpiry}. The later one is used.`,
      at: 0,
      ref: { type: "household", id: h.id }
    });
    if (a && a.maxExpiryMs && !i.unlimited && (tsMs(h.premiumAdminAt) || 0) < a.lastPaidAt) {
      const cur = i.active && i.expiryMs ? i.expiryMs : 0;
      if (cur < a.maxExpiryMs - DAY / 2) items.push({
        id: "short:" + h.id,
        kind: "household",
        severity: "high",
        title: "Premium ends sooner than the last payment",
        detail: `${h.id} \xB7 a payment ran to ${a.lastExpiry}, but the household shows ${i.expiry || "no Premium"}.`,
        at: a.lastPaidAt,
        ref: { type: "household", id: h.id }
      });
    }
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return items.sort((x, y) => rank[x.severity] - rank[y.severity] || y.at - x.at);
}
var authNote = (a) => a.ok ? null : a.status === 403 ? 'The robot account needs the role "Firebase Authentication Admin" before sign-in dates and account disabling work.' : "Could not read the Firebase sign-in list right now. " + (a.message || "");
async function whoami(ctx) {
  return ok({ email: ctx.admin.email, role: ctx.admin.role, canWrite: ctx.admin.role === "owner", canRecheck: ctx.admin.role !== "analyst", freshSeconds: FRESH_SECONDS });
}
async function overview(ctx) {
  const { now } = ctx;
  const [hhs, auth, userDocs, pays, log2] = await Promise.all([
    loadHouseholds(ctx),
    loadAuth(ctx),
    loadUserDocs(ctx),
    loadPayments(ctx, 1e3),
    cached(ctx, "log8", async () => (await ctx.deps.db.collection("adminLog").orderBy("atMs", "desc").limit(8).get()).docs.map((d) => ({ id: d.id, ...d.data() })))
  ]);
  const people = peopleMap(auth, userDocs), agg = aggregatePayments(pays);
  const live = hhs.filter((h) => !h.deletedAt), infos = new Map(live.map((h) => [h.id, premiumInfo(h, now)]));
  const states = { premium: 0, premium_expired: 0, trial: 0, trial_ended: 0, free: 0 };
  let expiring7 = 0, expiring30 = 0, unlimited = 0, legacy = 0, trialed = 0, converted = 0;
  for (const h of live) {
    const i = infos.get(h.id);
    states[i.state]++;
    if (i.state === "premium") {
      if (i.unlimited) unlimited++;
      else if (i.daysLeft !== null) {
        if (i.daysLeft <= 7) expiring7++;
        if (i.daysLeft <= 30) expiring30++;
      }
    }
    if (i.legacyOnly) legacy++;
    if (i.trialStarted !== null) {
      trialed++;
      if (agg.get(h.id) && agg.get(h.id).paidCount > 0) converted++;
    }
  }
  const days = [];
  for (let k = 29; k >= 0; k--) days.push(ymd(now - k * DAY));
  const at = new Map(days.map((d, k) => [d, k]));
  const signups = days.map((d) => ({ d, n: 0 })), newHouseholds = days.map((d) => ({ d, n: 0 }));
  hhs.forEach((h) => {
    const k = h.created ? at.get(ymd(h.created)) : void 0;
    if (k !== void 0) newHouseholds[k].n++;
  });
  let users2;
  if (auth.ok) {
    auth.list.forEach((u) => {
      const k = u.created ? at.get(ymd(u.created)) : void 0;
      if (k !== void 0) signups[k].n++;
    });
    const cohort = auth.list.filter((u) => u.created && u.created <= now - 30 * DAY);
    const kept = cohort.filter((u) => u.lastSignIn && u.lastSignIn >= now - 30 * DAY).length;
    users2 = {
      total: auth.list.length,
      last7: auth.list.filter((u) => u.created && now - u.created < 7 * DAY).length,
      last30: auth.list.filter((u) => u.created && now - u.created < 30 * DAY).length,
      active7: auth.list.filter((u) => u.lastSignIn && now - u.lastSignIn < 7 * DAY).length,
      active30: auth.list.filter((u) => u.lastSignIn && now - u.lastSignIn < 30 * DAY).length,
      inactive30: auth.list.filter((u) => !u.lastSignIn || now - u.lastSignIn >= 30 * DAY).length,
      disabled: auth.list.filter((u) => u.disabled).length,
      retention30: cohort.length ? Math.round(kept / cohort.length * 1e3) / 10 : null,
      retentionCohort: cohort.length
    };
  } else users2 = { total: userDocs.length, last7: null, last30: null, active7: null, active30: null, inactive30: null, disabled: null, retention30: null, retentionCohort: 0 };
  const paid = pays.filter((p) => p.status === "paid"), when = (p) => p.paidAtMs || p.createdAtMs || 0;
  const [cy, cm] = catYMD(now), months = [];
  for (let k = 11; k >= 0; k--) {
    const idx = cm - 1 - k;
    months.push({ m: `${cy + Math.floor(idx / 12)}-${pad2((idx % 12 + 12) % 12 + 1)}`, amount: 0, count: 0 });
  }
  const mAt = new Map(months.map((x, k) => [x.m, k]));
  paid.forEach((p) => {
    const k = mAt.get(ymd(when(p)).slice(0, 7));
    if (k !== void 0) {
      months[k].amount += Number(p.amount) || 0;
      months[k].count++;
    }
  });
  const prev3 = months.slice(8, 11);
  const payers = [...agg.values()].filter((a) => a.paidCount > 0);
  const revenue = {
    currency: CURRENCY,
    total: paid.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    thisMonth: months[11].amount,
    lastMonth: months[10].amount,
    byMonth: months,
    avgMonthly3: Math.round(prev3.reduce((s, x) => s + x.amount, 0) / 3),
    truncated: pays.length >= 1e3,
    byPlan: { one: paid.filter((p) => p.months === 1).length, three: paid.filter((p) => p.months === 3).length, manual: paid.filter((p) => p.source === "manual").length }
  };
  const byStatus = {};
  pays.forEach((p) => {
    byStatus[p.status || "unknown"] = (byStatus[p.status || "unknown"] || 0) + 1;
  });
  const attention2 = buildAttention({ hhs, pays, now, people });
  const recentSignups = auth.ok ? [...auth.list].filter((u) => u.created).sort((a, b) => b.created - a.created).slice(0, 8).map((u) => ({ uid: u.uid, name: u.name || u.email || u.phone || u.uid, created: u.created })) : [];
  return ok({
    auth: { ok: auth.ok, note: authNote(auth) },
    users: users2,
    signupsByDay: auth.ok ? signups : null,
    newHouseholdsByDay: newHouseholds,
    households: { live: live.length, deleted: hhs.length - live.length, last7: hhs.filter((h) => h.created && now - h.created < 7 * DAY).length, last30: hhs.filter((h) => h.created && now - h.created < 30 * DAY).length },
    premium: {
      states,
      expiring7,
      expiring30,
      unlimited,
      legacy,
      payingHouseholds: payers.length,
      repeatPayers: payers.filter((a) => a.paidCount >= 2).length,
      trialed,
      converted,
      conversionRate: trialed ? Math.round(converted / trialed * 1e3) / 10 : null
    },
    revenue,
    payments: { byStatus },
    attention: { total: attention2.length, high: attention2.filter((x) => x.severity === "high").length, items: attention2.slice(0, 6) },
    recentSignups,
    recentLog: log2
  });
}
async function attention(ctx) {
  const [hhs, auth, userDocs, pays] = await Promise.all([loadHouseholds(ctx), loadAuth(ctx), loadUserDocs(ctx), loadPayments(ctx, 1e3)]);
  return ok({ items: buildAttention({ hhs, pays, now: ctx.now, people: peopleMap(auth, userDocs) }), truncated: pays.length >= 1e3 });
}
async function households(ctx) {
  const [hhs, auth, userDocs, pays] = await Promise.all([loadHouseholds(ctx), loadAuth(ctx), loadUserDocs(ctx), loadPayments(ctx, 1e3)]);
  const people = peopleMap(auth, userDocs), agg = aggregatePayments(pays);
  const rows = hhs.map((h) => hhRow(h, ctx.now, people, agg)).sort((a, b) => (b.created || 0) - (a.created || 0));
  return ok({ rows, auth: { ok: auth.ok, note: authNote(auth) } });
}
async function household(ctx, p) {
  const id = p.id;
  if (!isCode(id)) throw new Fail(400, "Invalid household.");
  const { db } = ctx.deps, { now } = ctx;
  const hs = await db.collection("households").doc(id).get(HH_FIELDS);
  if (!hs.exists) throw new Fail(404, "Household not found.");
  const h = { id, created: hs.createTime, ...hs.data() };
  const [auth, userDocs, pays, hist] = await Promise.all([
    loadAuth(ctx),
    loadUserDocs(ctx),
    db.collection("payments").where("householdId", "==", id).limit(60).select(...PAY_FIELDS).get(),
    db.collection("adminLog").where("target", "==", id).limit(60).get()
  ]);
  const people = peopleMap(auth, userDocs), info = premiumInfo(h, now);
  const payList = pays.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a2, b) => (b.createdAtMs || 0) - (a2.createdAtMs || 0));
  const a = aggregatePayments(payList).get(id);
  const ownerDoc = userDocs.find((u) => u.id === h.owner);
  return ok({
    id,
    name: h.name || null,
    created: h.created || null,
    deleted: !!h.deletedAt,
    owner: h.owner || null,
    ownerName: nameOf(people, h.owner),
    premium: {
      ...info,
      activatedAt: h.premiumActivatedAt || null,
      adminAt: tsMs(h.premiumAdminAt),
      adminBy: h.premiumAdminBy || null,
      lastPaymentRanTo: a ? a.lastExpiry : null,
      ownerPremiumUntil: ownerDoc ? tsMs(ownerDoc.premiumUntil) : null
    },
    members: (h.memberUids || []).map((uid) => {
      const u = people.get(uid) || {};
      return { uid, name: nameOf(people, uid), lastSignIn: u.lastSignIn || null, disabled: !!u.disabled, owner: uid === h.owner };
    }),
    payments: payList.slice(0, 30).map((x) => payRow(x, now, people)),
    history: hist.docs.map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => (y.atMs || 0) - (x.atMs || 0)).slice(0, 20)
  });
}
async function users(ctx) {
  const [auth, userDocs, hhs] = await Promise.all([loadAuth(ctx), loadUserDocs(ctx), loadHouseholds(ctx)]);
  const docs = new Map(userDocs.map((d) => [d.id, d])), member = /* @__PURE__ */ new Map();
  hhs.forEach((h) => {
    if (h.deletedAt) return;
    (h.memberUids || []).forEach((uid) => {
      const l = member.get(uid) || [];
      l.push(h.id);
      member.set(uid, l);
    });
  });
  const row = (uid, u) => {
    const d = docs.get(uid) || {};
    return {
      uid,
      name: u.name || d.email || d.displayName || uid,
      providers: u.providers || [],
      created: u.created || null,
      lastSignIn: u.lastSignIn || null,
      verified: u.verified === void 0 ? null : u.verified,
      disabled: !!u.disabled,
      households: (member.get(uid) || []).slice(0, 5),
      householdCount: (member.get(uid) || []).length,
      premiumUntil: tsMs(d.premiumUntil),
      pendingDeletion: d.pendingDeletion === true
    };
  };
  const rows = auth.ok ? auth.list.map((u) => row(u.uid, { ...u, name: u.email || u.phone || u.uid })) : userDocs.map((d) => row(d.id, {}));
  rows.sort((a, b) => (b.created || 0) - (a.created || 0));
  return ok({ rows, auth: { ok: auth.ok, note: authNote(auth) } });
}
async function payments(ctx, p) {
  const limit = asInt(p.limit, 1, 2e3) || 500;
  const [pays, auth, userDocs] = await Promise.all([loadPayments(ctx, limit), loadAuth(ctx), loadUserDocs(ctx)]);
  const people = peopleMap(auth, userDocs);
  return ok({ rows: pays.map((x) => payRow(x, ctx.now, people)), truncated: pays.length >= limit });
}
async function premium(ctx) {
  const [hhs, auth, userDocs, pays] = await Promise.all([loadHouseholds(ctx), loadAuth(ctx), loadUserDocs(ctx), loadPayments(ctx, 1e3)]);
  const people = peopleMap(auth, userDocs), agg = aggregatePayments(pays), now = ctx.now;
  const rows = hhs.filter((h) => !h.deletedAt).map((h) => hhRow(h, now, people, agg));
  const byExpiry = (a, b) => (a.daysLeft === null ? 9e9 : a.daysLeft) - (b.daysLeft === null ? 9e9 : b.daysLeft);
  return ok({
    expiring: rows.filter((r) => r.state === "premium" && !r.unlimited && r.daysLeft !== null && r.daysLeft <= 14).sort(byExpiry),
    expired: rows.filter((r) => r.state === "premium_expired").sort((a, b) => String(b.expiry).localeCompare(String(a.expiry))).slice(0, 50),
    trials: rows.filter((r) => r.state === "trial").sort((a, b) => a.trialDaysLeft - b.trialDaysLeft),
    unlimited: rows.filter((r) => r.state === "premium" && r.unlimited),
    legacy: rows.filter((r) => r.legacy)
  });
}
async function chipereganyu(ctx) {
  const [snap2, auth, userDocs] = await Promise.all([
    cached(ctx, "grp", async () => (await ctx.deps.db.collection("chipereganyu_groups").select(...GROUP_FIELDS).get()).docs.map((d) => ({ id: d.id, ...d.data() }))),
    loadAuth(ctx),
    loadUserDocs(ctx)
  ]);
  const people = peopleMap(auth, userDocs), today = ymd(ctx.now);
  const rows = snap2.map((g) => {
    const cc = g.currentCycle || null, c = cc && cc.contributions && typeof cc.contributions === "object" ? Object.values(cc.contributions) : [];
    const paid = c.filter((x) => x && x.paid === true).length;
    const sent = c.filter((x) => x && x.sent === true && x.paid !== true);
    const stuck = sent.filter((x) => tsMs(x.sentAt) !== null && ctx.now - tsMs(x.sentAt) > 3 * DAY).length;
    const overdueDays = cc && isYMD(cc.dueDate) ? Math.max(0, daysBetween(cc.dueDate, today)) : 0;
    return {
      id: g.id,
      name: g.name || g.id,
      status: g.status || "unknown",
      admin: nameOf(people, g.createdBy),
      members: Array.isArray(g.memberUids) ? g.memberUids.length : 0,
      frequency: g.frequency || null,
      amount: Number(g.contributionAmount) || 0,
      created: tsMs(g.createdAt),
      cycle: cc ? cc.cycleNumber || null : null,
      lap: cc ? cc.lap || null : null,
      dueDate: cc ? cc.dueDate || null : null,
      overdueDays: paid < c.length ? overdueDays : 0,
      contributors: c.length,
      paid,
      sentNotConfirmed: sent.length,
      stuck
    };
  }).sort((a, b) => b.overdueDays - a.overdueDays || (b.created || 0) - (a.created || 0));
  const byStatus = {};
  rows.forEach((r) => {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  });
  return ok({ rows, summary: { total: rows.length, byStatus, overdue: rows.filter((r) => r.overdueDays > 0).length, stuck: rows.filter((r) => r.stuck > 0).length } });
}
async function announcements(ctx) {
  const docs = (await ctx.deps.db.collection("announcements").limit(200).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  return ok({ rows: docs.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)) });
}
async function settings(ctx) {
  const s = await ctx.deps.db.collection("adminConfig").doc("settings").get();
  const d = s.exists ? s.data() : {}, l = adminLists(ctx.env), auth = await loadAuth(ctx);
  return ok({
    maintenanceOn: d.maintenanceOn === true,
    maintenanceMessage: d.maintenanceMessage || "",
    updatedAtMs: d.updatedAtMs || null,
    updatedBy: d.updatedBy || null,
    admins: ctx.admin.role === "owner" ? { owner: [...l.owner], support: [...l.support], analyst: [...l.analyst] } : null,
    auth: { ok: auth.ok, note: authNote(auth) }
  });
}
async function log(ctx, p) {
  const limit = asInt(p.limit, 1, 300) || 150;
  return ok({ rows: (await ctx.deps.db.collection("adminLog").orderBy("atMs", "desc").limit(limit).get()).docs.map((d) => ({ id: d.id, ...d.data() })) });
}
var logDoc = (ctx, action, target, extra) => ({ atMs: ctx.now, by: ctx.admin.email, role: ctx.admin.role, action, target: target || null, ...extra });
async function writeLog(ctx, action, target, extra) {
  await ctx.deps.db.collection("adminLog").doc(randomId("log")).set(logDoc(ctx, action, target, extra));
}
function needReason(p) {
  const reason = cleanLine(p.reason, 300);
  if (reason.length < 3) throw new Fail(400, "Please give a reason (at least 3 letters). It goes in the activity log.");
  return reason;
}
var PREMIUM_MODES = ["extend", "set_expiry", "unlimited", "revoke", "tidy"];
async function actPremium(ctx, p) {
  const { db, tsFromMillis: ts } = ctx.deps, { now } = ctx;
  const id = p.householdId, mode = p.mode;
  if (!isCode(id)) throw new Fail(400, "Invalid household.");
  if (!PREMIUM_MODES.includes(mode)) throw new Fail(400, "Unknown Premium action.");
  const reason = needReason(p);
  let months = null;
  if (mode === "extend") {
    months = asInt(p.months, 1, 36);
    if (!months) throw new Fail(400, "Months must be a whole number from 1 to 36.");
  }
  if (mode === "set_expiry") {
    if (!realYMD(p.expiry)) throw new Fail(400, "Enter the end date as YYYY-MM-DD.");
    if (p.expiry < "2024-01-01" || p.expiry > ymd(now + 5 * 365 * DAY)) throw new Fail(400, "That end date is out of range (up to 5 years ahead).");
  }
  let rec = null;
  if (p.recordPayment) {
    if (!["extend", "set_expiry"].includes(mode)) throw new Fail(400, "A payment can only be recorded when giving or extending Premium.");
    const amount = asInt(p.recordPayment.amount, 0, 5e6);
    if (amount === null) throw new Fail(400, "The payment amount must be a whole number of kwacha.");
    rec = { amount, note: cleanLine(p.recordPayment.note, 200) };
  }
  let result;
  await db.runTransaction(async (tx) => {
    const hRef = db.collection("households").doc(id), hs = await tx.get(hRef, HH_FIELDS);
    if (!hs.exists) throw new Fail(404, "Household not found.");
    const h = hs.data();
    if (h.deletedAt) throw new Fail(400, "This household is deleted.");
    const cur = currentPremium(h), before = premiumInfo(h, now);
    let active = true, expiry = null;
    if (mode === "extend") {
      if (cur.unlimited) throw new Fail(400, 'This household already has Premium with no end date. Use "Set end date" to give it one.');
      expiry = extendExpiry(cur.active ? cur.expiry : null, months, now);
    } else if (mode === "set_expiry") expiry = p.expiry;
    else if (mode === "unlimited") expiry = null;
    else if (mode === "revoke") active = false;
    else if (mode === "tidy") {
      if (!cur.active) throw new Fail(400, "This household has no Premium to move.");
      expiry = cur.unlimited ? null : asDate(cur.expiry);
    }
    const rootData = active ? { isPremium: true, premiumExpiry: expiry === null ? DELETE : expiry, premiumAdminAt: now, premiumAdminBy: ctx.admin.email } : { isPremium: false, premiumExpiry: DELETE, premiumAdminAt: now, premiumAdminBy: ctx.admin.email };
    if (active && h.isPremium !== true) rootData.premiumActivatedAt = new Date(now).toISOString();
    const cfg = h.config && typeof h.config === "object" ? h.config : {}, strippedCfg = { ...cfg };
    for (const k of ["isPremium", "premiumExpiry", "premiumActivatedAt"]) if (k in cfg) {
      rootData["config." + k] = DELETE;
      delete strippedCfg[k];
    }
    tx.update(hRef, rootData);
    const after = premiumInfo({ ...h, isPremium: active, premiumExpiry: expiry === null || !active ? void 0 : expiry, config: strippedCfg }, now);
    if (h.owner) {
      const uRef = db.collection("users").doc(h.owner), us = await tx.get(uRef, ["premiumUntil"]);
      const curUntil = us.exists ? tsMs(us.data().premiumUntil) : null;
      const oldEnd = cur.active ? cur.unlimited ? Infinity : expiryMs(cur.expiry) || 0 : 0;
      if (active) {
        const newUntil = expiry === null ? endOfDayMs("2100-01-01") : endOfDayMs(expiry);
        if (!(curUntil && curUntil > oldEnd && curUntil > newUntil)) tx.set(uRef, { premiumUntil: ts(newUntil) }, { merge: true });
      } else if (us.exists && curUntil !== null && curUntil <= oldEnd) tx.set(uRef, { premiumUntil: DELETE }, { merge: true });
    }
    let paymentId = null;
    if (rec) {
      paymentId = randomId("manual");
      tx.set(db.collection("payments").doc(paymentId), {
        uid: h.owner || null,
        householdId: id,
        months,
        amount: rec.amount,
        currency: CURRENCY,
        status: "paid",
        source: "manual",
        createdAtMs: now,
        paidAtMs: now,
        premiumExpiry: expiry,
        note: rec.note || reason,
        by: ctx.admin.email
      });
    }
    tx.set(db.collection("adminLog").doc(randomId("log")), logDoc(ctx, "premium_" + mode, id, { reason, before: brief(before), after: brief(after), paymentId, months }));
    result = { before: brief(before), after: brief(after), paymentId };
  });
  forgetCache(ctx);
  return ok({ ok: true, ...result });
}
async function actRecheck(ctx, p) {
  const { deps } = ctx, txRef = p.txRef;
  if (!isTxRef(txRef)) throw new Fail(400, "That is not a PayChangu reference from this app.");
  const ref = deps.db.collection("payments").doc(txRef), snap2 = await ref.get();
  if (!snap2.exists) throw new Fail(404, "Payment not found.");
  const before = snap2.data().status;
  let reopened = false;
  if (p.force === true && ["expired", "failed"].includes(before)) {
    if (ctx.admin.role !== "owner") throw new Fail(403, "Only the owner can reopen a closed payment.");
    await ref.update({ status: "pending", createdAtMs: ctx.now, adminReopenedAt: ctx.now });
    reopened = true;
  }
  const r = await settlePayment({ deps, txRef });
  const after = (await ref.get()).data();
  await writeLog(ctx, "payment_recheck", txRef, { before: { status: before }, after: { status: after.status, premiumExpiry: after.premiumExpiry || null }, reopened });
  forgetCache(ctx);
  return ok({ ok: true, result: r.status, status: after.status, premiumExpiry: after.premiumExpiry || null, reopened });
}
async function actPaymentNote(ctx, p) {
  const txRef = String(p.txRef || "");
  if (!/^[A-Za-z0-9_-]{6,60}$/.test(txRef)) throw new Fail(400, "Invalid payment.");
  const note = cleanLine(p.note, 300), resolved = p.resolved === true;
  if (!note && !resolved) throw new Fail(400, "Write a note, or mark it as reviewed.");
  const ref = ctx.deps.db.collection("payments").doc(txRef);
  if (!(await ref.get(["status"])).exists) throw new Fail(404, "Payment not found.");
  await ref.update({ adminNote: note || DELETE, adminResolved: resolved, adminNoteBy: ctx.admin.email, adminNoteAt: ctx.now });
  await writeLog(ctx, "payment_note", txRef, { after: { note, resolved } });
  forgetCache(ctx);
  return ok({ ok: true });
}
async function actUserDisable(ctx, p) {
  const uid = String(p.uid || "");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Fail(400, "Invalid account.");
  const reason = needReason(p), disable = p.disabled !== false;
  const u = await ctx.identity.lookup(uid).catch((e) => {
    throw new Fail(e.status === 403 ? 403 : 502, e.status === 403 ? 'The robot account needs the role "Firebase Authentication Admin" first.' : "Could not reach Firebase sign-in right now.");
  });
  if (!u) throw new Fail(404, "Account not found.");
  if (disable && (uid === ctx.admin.uid || roleOf(u.email, ctx.env))) throw new Fail(400, "Admin accounts cannot be disabled here.");
  await ctx.identity.setDisabled(uid, disable);
  await writeLog(ctx, disable ? "user_disable" : "user_enable", uid, { reason, before: { disabled: !!u.disabled }, after: { disabled: disable }, who: u.email || u.phone || null });
  forgetCache(ctx);
  return ok({ ok: true, disabled: disable });
}
var NOTICE_KINDS = ["info", "warning"];
var NOTICE_AUDIENCE = ["all", "free", "premium"];
var NOTICE_LANG = ["all", "en", "cw"];
async function actAnnouncementSave(ctx, p) {
  const title = cleanLine(p.title, 80), body = cleanBlock(p.body, 500);
  if (title.length < 3) throw new Fail(400, "Give the notice a title (at least 3 letters).");
  const audience = NOTICE_AUDIENCE.includes(p.audience) ? p.audience : "all", lang = NOTICE_LANG.includes(p.lang) ? p.lang : "all", kind = NOTICE_KINDS.includes(p.kind) ? p.kind : "info";
  const startsAtMs = p.startsAtMs ? Number(p.startsAtMs) : null, endsAtMs = p.endsAtMs ? Number(p.endsAtMs) : null;
  if (startsAtMs !== null && !Number.isFinite(startsAtMs) || endsAtMs !== null && !Number.isFinite(endsAtMs)) throw new Fail(400, "Invalid start or end time.");
  if (startsAtMs && endsAtMs && endsAtMs <= startsAtMs) throw new Fail(400, "The end time must be after the start time.");
  const col = ctx.deps.db.collection("announcements");
  let id = p.id ? String(p.id) : null, prev = null;
  if (id) {
    if (!/^[A-Za-z0-9_-]{3,60}$/.test(id)) throw new Fail(400, "Invalid notice.");
    const s = await col.doc(id).get();
    if (!s.exists) throw new Fail(404, "Notice not found.");
    prev = s.data();
  } else id = randomId("n");
  const doc = {
    title,
    body,
    audience,
    lang,
    kind,
    active: p.active !== false,
    startsAtMs,
    endsAtMs,
    createdAtMs: prev ? prev.createdAtMs || ctx.now : ctx.now,
    createdBy: prev ? prev.createdBy || ctx.admin.email : ctx.admin.email,
    updatedAtMs: ctx.now,
    updatedBy: ctx.admin.email
  };
  await col.doc(id).set(doc);
  await writeLog(ctx, prev ? "announcement_edit" : "announcement_create", id, { after: { title, audience, lang, kind, active: doc.active } });
  return ok({ ok: true, id });
}
async function actAnnouncementDelete(ctx, p) {
  const id = String(p.id || "");
  if (!/^[A-Za-z0-9_-]{3,60}$/.test(id)) throw new Fail(400, "Invalid notice.");
  const ref = ctx.deps.db.collection("announcements").doc(id), s = await ref.get();
  if (!s.exists) throw new Fail(404, "Notice not found.");
  await ref.delete();
  await writeLog(ctx, "announcement_delete", id, { before: { title: s.data().title || null } });
  return ok({ ok: true });
}
async function actSettingsSave(ctx, p) {
  const msg = cleanLine(p.maintenanceMessage, 300), on = p.maintenanceOn === true;
  if (on && msg.length < 3) throw new Fail(400, "Write the message people will see during maintenance.");
  const ref = ctx.deps.db.collection("adminConfig").doc("settings"), prev = (await ref.get()).data() || {};
  await ref.set({ maintenanceOn: on, maintenanceMessage: msg, updatedAtMs: ctx.now, updatedBy: ctx.admin.email });
  await writeLog(ctx, "settings_save", "maintenance", { before: { on: prev.maintenanceOn === true, message: prev.maintenanceMessage || "" }, after: { on, message: msg } });
  return ok({ ok: true });
}
var HANDLERS = { whoami, overview, attention, households, household, users, payments, premium, chipereganyu, announcements, settings, log };
var WRITERS = {
  premium_set: actPremium,
  recheck_payment: actRecheck,
  payment_note: actPaymentNote,
  user_disable: actUserDisable,
  announcement_save: actAnnouncementSave,
  announcement_delete: actAnnouncementDelete,
  settings_save: actSettingsSave
};
var run = (action) => HANDLERS[action] || WRITERS[action];
var denied = { seen: /* @__PURE__ */ new Map(), hourStart: 0, count: 0 };
async function logDenied(deps, user, action) {
  const now = deps.now();
  if (now - denied.hourStart > HOUR) {
    denied.hourStart = now;
    denied.count = 0;
    denied.seen.clear();
  }
  const e = String(user.email || user.uid).toLowerCase();
  if (denied.seen.has(e) || denied.count >= 20) return;
  denied.seen.set(e, now);
  denied.count++;
  await deps.db.collection("adminLog").doc(randomId("log")).set({ atMs: now, by: e, role: null, action: "denied", target: String(action || "").slice(0, 40) });
}
async function handle({ user, action, params, env, deps, identity }) {
  const now = deps.now(), p = params && typeof params === "object" ? params : {};
  const a = authorize({ user, env, action, nowMs: now });
  if (!a.ok) {
    if (a.denied) await logDenied(deps, user, action).catch(() => {
    });
    return { code: a.code, body: { error: a.error, needsFreshSignIn: a.needsFreshSignIn || void 0 } };
  }
  const fn = run(action);
  if (!fn) return { code: 400, body: { error: "Unknown action." } };
  const ctx = { deps, env, identity, now, admin: a, fresh: p.fresh === true };
  try {
    return await fn(ctx, p);
  } catch (e) {
    if (e instanceof Fail) return { code: e.code, body: { error: e.message } };
    console.error("admin error", action, e && e.message);
    return { code: 500, body: { error: "Something went wrong.", detail: String(e && e.message || e).slice(0, 200) } };
  }
}
var publicMemo = /* @__PURE__ */ new WeakMap();
async function publicFeed({ deps, env, plan, lang }) {
  const ttl = Number(env.PUBLIC_CACHE_SECONDS === void 0 ? 60 : env.PUBLIC_CACHE_SECONDS) * 1e3, now = deps.now();
  let raw = ttl > 0 ? publicMemo.get(deps.db) : null;
  if (!raw || now - raw.at >= ttl) {
    const [n, s] = await Promise.all([deps.db.collection("announcements").where("active", "==", true).limit(50).get(), deps.db.collection("adminConfig").doc("settings").get()]);
    raw = { at: now, notices: n.docs.map((d) => ({ id: d.id, ...d.data() })), settings: s.exists ? s.data() : {} };
    if (ttl > 0) publicMemo.set(deps.db, raw);
  }
  const p = plan === "premium" ? "premium" : "free", l = lang === "cw" ? "cw" : "en";
  const notices = raw.notices.filter((x) => (!x.startsAtMs || x.startsAtMs <= now) && (!x.endsAtMs || x.endsAtMs > now) && (x.audience === "all" || x.audience === p) && (x.lang === "all" || x.lang === l)).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)).slice(0, 3).map((x) => ({ id: x.id, title: x.title || "", body: x.body || "", kind: x.kind === "warning" ? "warning" : "info" }));
  const on = raw.settings.maintenanceOn === true;
  return { notices, maintenance: on ? { on: true, message: raw.settings.maintenanceMessage || "" } : { on: false } };
}

// src/identity.js
var toMs = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
var IDENTITY_SCOPE = "https://www.googleapis.com/auth/identitytoolkit";
function makeIdentity({ projectId, getToken, fetchImpl = fetch }) {
  const base = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`;
  async function call(method, url, body) {
    const r = await (0, fetchImpl)(url, {
      method,
      headers: { Authorization: "Bearer " + await getToken(), "Content-Type": "application/json" },
      body: body === void 0 ? void 0 : JSON.stringify(body)
    });
    let j = null;
    try {
      j = await r.json();
    } catch (_) {
    }
    if (!r.ok) {
      const msg = j && j.error && j.error.message || "";
      const e = new Error("Auth " + method + " failed: HTTP " + r.status + (msg ? " " + String(msg).slice(0, 160) : ""));
      e.status = r.status;
      throw e;
    }
    return j || {};
  }
  const shape = (u) => ({
    uid: u.localId,
    email: u.email || null,
    phone: u.phoneNumber || null,
    providers: (u.providerUserInfo || []).map((p) => p.providerId),
    created: toMs(u.createdAt),
    lastSignIn: toMs(u.lastLoginAt),
    verified: u.emailVerified === true,
    disabled: u.disabled === true
  });
  return {
    // Every account, oldest page first. Up to 1000 per request; stops at 20000 accounts as a safety limit.
    async listUsers() {
      const out = [];
      let token = "";
      for (let page = 0; page < 20; page++) {
        const j = await call("GET", base + ":batchGet?maxResults=1000" + (token ? "&nextPageToken=" + encodeURIComponent(token) : ""));
        (j.users || []).forEach((u) => out.push(shape(u)));
        token = j.nextPageToken || "";
        if (!token) break;
      }
      return out;
    },
    async lookup(uid) {
      const j = await call("POST", base + ":lookup", { localId: [uid] });
      return j.users && j.users[0] ? shape(j.users[0]) : null;
    },
    async setDisabled(uid, disabled) {
      await call("POST", base + ":update", { localId: uid, disableUser: !!disabled });
    }
  };
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400"
    };
  }
  return { Vary: "Origin" };
}
var json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
var shared = { sig: null, db: null, identity: null };
function makeDeps(env, injected) {
  if (injected && injected.db) {
    return { db: injected.db, identity: injected.identity, fetchImpl: injected.fetchImpl || fetch, secretKey: env.PAYCHANGU_SECRET_KEY, now: injected.now || Date.now, tsFromMillis: injected.tsFromMillis || tsFromMillis };
  }
  const projectId = env.FIREBASE_PROJECT_ID || "bajeti-yanga";
  const sig = projectId + "|" + env.GOOGLE_SERVICE_ACCOUNT;
  if (shared.sig !== sig) {
    const getToken = makeTokenProvider({ serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT });
    const identity = makeIdentity({ projectId, getToken: makeTokenProvider({ serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT, scope: IDENTITY_SCOPE }) });
    shared = { sig, db: new FirestoreRest({ projectId, getToken }), identity };
  }
  return { db: shared.db, identity: shared.identity, fetchImpl: fetch, secretKey: env.PAYCHANGU_SECRET_KEY, now: Date.now, tsFromMillis };
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
      if (req.method === "GET" && url.pathname === "/public") {
        const feed = await publicFeed({ deps, env, plan: url.searchParams.get("plan"), lang: url.searchParams.get("lang") });
        return json(200, feed, { ...cors, "Cache-Control": "public, max-age=60" });
      }
      if (url.pathname === "/admin") {
        if (req.method !== "POST") return json(405, { error: "POST only" }, cors);
        const noStore = { ...cors, "Cache-Control": "no-store" };
        const bm = /^Bearer (.+)$/.exec(req.headers.get("authorization") || "");
        if (!bm) return json(401, { error: "Please sign in again." }, noStore);
        let who;
        try {
          who = await verifyFirebaseTokenFull(bm[1], env, injected.fetchImpl || fetch, deps.now());
        } catch (_) {
          return json(401, { error: "Please sign in again." }, noStore);
        }
        let params = {};
        try {
          params = await req.json();
        } catch (_) {
        }
        const out = await handle({ user: who, action: params && params.action, params, env, deps, identity: deps.identity });
        return json(out.code, out.body, noStore);
      }
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
    const run2 = (async () => {
      const out = await reconcilePending({ deps: makeDeps(env, injected) });
      if (out.length) console.log("reconciled", JSON.stringify(out));
      return out;
    })().catch((e) => {
      console.error("reconcile failed", e && e.message);
      return [];
    });
    if (ctx && ctx.waitUntil) ctx.waitUntil(run2);
    return run2;
  }
};
export {
  index_default as default
};
