// Bajeti Yanga service worker
// Bump this version string on every deploy to force cache invalidation.
// Keep the number equal to APP_VERSION in js/01-constants.js (the version people see in the app).
const V = "bajeti-v9.14.0";
// Third-party libraries (Firebase SDK, QR libraries, fonts) live in their own cache that is NOT wiped on each
// deploy. Their URLs carry a version number, so a copy stays valid until the URL itself changes. Before this,
// every release made each phone download ~400 KB of Firebase again over mobile data.
const LIBS = "bajeti-libs-v1";
// Only these hosts are cached. Anything else cross-origin (API calls, profile photos) goes straight to the network.
const LIB_HOSTS = ["www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com", "cdn.jsdelivr.net"];
// How long to wait for the network before falling back to the saved copy of a page or app file.
const NET_TIMEOUT_MS = 4000;

// The app shell plus everything the app actually needs to boot and render,
// so a first-time offline visit isn't left waiting on the network for
// scripts/fonts that were never cached.
//
// index.html is a small shell; the styles and the app code live in styles.css
// and js/*.js. When you add, rename or remove a file in js/, change this list
// AND the <script> tags at the bottom of index.html (same order: the files
// share one global scope and must load in numbered order).
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

// Cache each URL individually so one bad/blocked resource can't silently
// wipe out the whole precache (which is what a single addAll(...).catch(()=>{})
// used to do).
async function precache(cache, urls) {
  await Promise.all(
    urls.map(async (url) => {
      try {
        // Our own files are fetched with cache:"reload" so the offline copy is the
        // file that is on the server right now, not a copy the browser's HTTP cache
        // may still be holding from before this deploy.
        const own = !url.startsWith("http");
        const req = new Request(url, { mode: own ? "same-origin" : "cors", cache: own ? "reload" : "default" });
        const res = await fetch(req);
        if (res && (res.ok || res.type === "opaque")) {
          await cache.put(req, res);
        }
      } catch (err) {
        // Ignore â€” this single resource will just be picked up by runtime
        // caching the first time it's successfully fetched online.
      }
    })
  );
}

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    Promise.all([
      caches.open(V).then((c) => precache(c, APP_SHELL)),
      // Libraries already saved from an earlier release are kept, not downloaded again.
      caches.open(LIBS).then(async (c) => {
        const missing = [];
        for (const u of RUNTIME_SEED) { if (!(await c.match(u))) missing.push(u); }
        return precache(c, missing);
      }),
    ])
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

// Network first, but never make someone stare at a spinner on a weak connection: if the network has not
// answered within NET_TIMEOUT_MS and a saved copy exists, show that (the request carries on and refreshes the copy).
function networkFirst(req, fallbackKey) {
  const fresh = fetch(req, { cache: "no-cache" }).then((res) => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(V).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  });
  const saved = () => caches.match(req).then((c) => c || (fallbackKey ? caches.match(fallbackKey) : null));
  const timed = new Promise((resolve) => {
    setTimeout(() => saved().then((c) => { if (c) resolve(c); }), NET_TIMEOUT_MS);
  });
  return Promise.race([fresh, timed]).catch(() => saved().then((c) => c || Response.error()));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // HTML and our own files (styles, scripts, icons, manifest): network-first, so a deploy shows up right
  // away when online and the page and its files come from one release; saved copy when offline or slow.
  if (isNavigation(req)) { e.respondWith(networkFirst(req, "./index.html")); return; }
  if (url.origin === self.location.origin) { e.respondWith(networkFirst(req)); return; }

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
