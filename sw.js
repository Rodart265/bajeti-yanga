// Bajeti Yanga service worker
//
// HOW RELEASES WORK
// Each release is a fixed set of files (APP_SHELL) saved together under one cache name (V). The page and all its
// scripts always come from that one saved set, so an old script can never run next to a new page.
//   - A new release arrives as a new sw.js. It downloads the WHOLE set; if any file fails, or the files are not
//     the release this worker was built for, the install fails and the phone keeps running the old release
//     untouched. It simply tries again next time (nothing half-updated, ever).
//   - Once the whole set is saved the new worker takes over, and the open page shows "New version ready".
//
// TO RELEASE: change APP_VERSION in js/01-constants.js, then run  node tools/release.js  (it writes V and BUILD
// below), then  node tests/release.test.js  must pass. Do not edit V or BUILD by hand.
const V = "bajeti-v9.18.0";
const BUILD = "fcf352223997"; // fingerprint of every file in APP_SHELL, written by tools/release.js. Changing it changes this file, which is what makes phones fetch the release.

// Third-party libraries (Firebase SDK, QR libraries, fonts) live in their own cache that is NOT wiped on each
// deploy. Their URLs carry a version number, so a copy stays valid until the URL itself changes. Before this,
// every release made each phone download ~400 KB of Firebase again over mobile data.
const LIBS = "bajeti-libs-v1";
// Only these hosts are cached. Anything else cross-origin (API calls, profile photos) goes straight to the network.
const LIB_HOSTS = ["www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com", "cdn.jsdelivr.net"];

// The app shell: everything the app needs to boot and render. All of it is required for a release to install.
//
// index.html is a small shell; the styles and the app code live in styles.css
// and js/*.js. When you add, rename or remove a file in js/, change this list
// AND the <script> tags at the bottom of index.html (same order: the files
// share one global scope and must load in numbered order). tests/release.test.js checks both lists agree.
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./glass.css",
  "./js/01-constants.js",
  "./js/02-helpers.js",
  "./js/03-pin.js",
  "./js/04-auth.js",
  "./js/05-household.js",
  "./js/06-chipereganyu.js",
  "./js/07-render.js",
  "./js/08-history-summary.js",
  "./js/09-settings.js",
  "./js/10-legal.js",
  "./js/11-premium.js",
  "./js/12-chat.js",
  "./js/13-actions-boot.js",
  "./vendor/icons.min.js",
  "./manifest.webmanifest",
  "./icons/icon-96.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

const RUNTIME_SEED = [
  "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap",
  "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
  "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js",
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js",
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js",
];

// Third-party libraries: best effort. One that cannot be fetched now is picked up the first time it loads online.
async function precacheLibs(cache, urls) {
  await Promise.all(
    urls.map(async (url) => {
      try {
        const req = new Request(url, { mode: "cors", cache: "default" });
        const res = await fetch(req);
        if (res && (res.ok || res.type === "opaque")) await cache.put(req, res);
      } catch (err) {
        // ignored on purpose
      }
    })
  );
}

// Our own files: ALL of them or the install fails. Fetched with cache:"reload" so the copy saved is the file
// on the server right now, not one the browser's HTTP cache (or a CDN) may still hold from before this deploy.
async function precacheShell(cache) {
  await Promise.all(
    APP_SHELL.map(async (url) => {
      const res = await fetch(new Request(url, { cache: "reload", credentials: "same-origin" }));
      if (!res || !res.ok) throw new Error("shell file failed: " + url + " (" + (res && res.status) + ")");
      await cache.put(url, res);
    })
  );
  // The downloaded files must belong to the release this worker was built for. During a deploy a server or CDN
  // can briefly hand out a mix of old and new files; if that happened, fail now and retry later.
  const hit = await cache.match("./js/01-constants.js");
  const text = hit ? await hit.text() : "";
  const m = /const APP_VERSION\s*=\s*'([^']+)'/.exec(text);
  if (!m || "bajeti-v" + m[1] !== V) {
    throw new Error("release mismatch: worker is " + V + " but files say " + (m ? m[1] : "unknown"));
  }
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(V);
        await precacheShell(cache);
      } catch (err) {
        await caches.delete(V).catch(() => {}); // leave nothing half-saved; the running release keeps working
        throw err; // install fails, the old worker stays in charge, the browser retries later
      }
      // Libraries already saved from an earlier release are kept, not downloaded again.
      const libs = await caches.open(LIBS);
      const missing = [];
      for (const u of RUNTIME_SEED) { if (!(await libs.match(u))) missing.push(u); }
      await precacheLibs(libs, missing);
      await self.skipWaiting(); // only now: the whole release is saved
    })()
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((ks) =>
        Promise.all(ks.filter((k) => k !== V && k !== LIBS).map((k) => caches.delete(k)))
      ),
    ])
  );
});

function isNavigation(request) {
  return (
    request.mode === "navigate" ||
    (request.method === "GET" && request.headers.get("accept")?.includes("text/html"))
  );
}

// Our own files come from this release's saved set, never mixed with the network. Fast on weak connections too.
async function ownFile(req) {
  const cache = await caches.open(V);
  let hit = await cache.match(req, { ignoreSearch: true });
  if (!hit && isNavigation(req)) hit = await cache.match("./index.html");
  if (hit) return hit;
  // Not part of the release set (should not happen; tests/release.test.js guards the list): ask the network, save nothing.
  try { return await fetch(req); } catch (err) { return Response.error(); }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // The admin console (/admin/) is a separate page with its own files. This worker's scope covers it, and
    // ownFile() answers any unknown navigation with the app's index.html, so without this line /admin/ shows
    // the app's boot splash ("Part of the app didn't finish loading") instead of the console. Not intercepted:
    // the browser fetches the admin page and its files straight from the network, and nothing is saved.
    if (/\/admin(\/|$)/.test(url.pathname)) return;
    // version.json says the oldest version still allowed to run (see docs/RELEASING.md). It must always be
    // the live copy, so it never goes through the saved set.
    if (url.pathname.endsWith("/version.json")) { e.respondWith(fetch(req, { cache: "no-store" })); return; }
    e.respondWith(ownFile(req));
    return;
  }

  // Libraries and fonts from the allowed CDNs: saved copy first (instant, works offline), refreshed quietly
  // in the background. Version-numbered library URLs never change, so the refresh is just a cheap check.
  if (LIB_HOSTS.indexOf(url.hostname) !== -1) {
    e.respondWith(
      caches.open(LIBS).then((c) =>
        c.match(req).then((cached) => {
          const net = fetch(req)
            .then((res) => {
              if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone()).catch(() => {});
              return res;
            })
            .catch(() => null);
          return cached || net.then((r) => r || Response.error());
        })
      )
    );
  }
  // Everything else: not intercepted, the browser handles it normally.
});
