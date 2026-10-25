// Bajeti Yanga service worker
// Bump this version string on every deploy to force cache invalidation.
// Keep the number equal to APP_VERSION in js/01-constants.js (the version people see in the app).
const V = "bajeti-v9.10.0";

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
  "./manifest.webmanifest",
  "./icons/icon-96.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

const RUNTIME_SEED = [
  "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=Syne:wght@700;800&display=swap",
  "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
  "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js",
  "https://unpkg.com/lucide@0.441.0/dist/umd/lucide.min.js",
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
    caches.open(V).then((c) => precache(c, [...APP_SHELL, ...RUNTIME_SEED]))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((ks) =>
        Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))
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

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // HTML: network-first, so a deploy shows up right away when online;
  // fall back to the cached shell the moment the network is unavailable.
  // cache:"no-cache" means "ask the server if it changed" (a tiny 304 reply when
  // it has not), so the page and the files it loads always come from one deploy.
  if (isNavigation(req)) {
    e.respondWith(
      fetch(req, { cache: "no-cache" })
        .then((fresh) => {
          const copy = fresh.clone();
          caches.open(V).then((c) => c.put(req, copy)).catch(() => {});
          return fresh;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("./index.html"))
        )
    );
    return;
  }

  // Our own files (styles.css, js/*.js, icons, manifest): same idea as the HTML.
  // Network-first and revalidated, so editing a file and deploying is enough (no
  // need to remember a version number for it to reach people), and a file that did
  // not change costs only a tiny 304 reply, not a download. Offline, the copy saved
  // by the last successful load (or by the install step above) is used.
  if (new URL(req.url).origin === self.location.origin) {
    e.respondWith(
      fetch(req, { cache: "no-cache" })
        .then((fresh) => {
          if (fresh && fresh.ok) {
            const copy = fresh.clone();
            caches.open(V).then((c) => c.put(req, copy)).catch(() => {});
          }
          return fresh;
        })
        .catch(() => caches.match(req).then((cached) => cached || Response.error()))
    );
    return;
  }

  // Everything else (fonts and third-party libraries from CDNs): cache-first for
  // speed, with a silent background refresh so caches don't go stale forever.
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((fresh) => {
          try {
            const copy = fresh.clone();
            caches.open(V).then((c) => c.put(req, copy));
          } catch (x) {}
          return fresh;
        })
        .catch(() => null);
      return cached || network;
    })
  );
});
