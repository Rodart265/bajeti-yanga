// Bajeti Yanga service worker
// Bump this version string on every deploy to force cache invalidation.
const V = "bajeti-v9.5.0";

// The app shell plus everything the app actually needs to boot and render,
// so a first-time offline visit isn't left waiting on the network for
// scripts/fonts that were never cached.
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-96.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
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
        const req = new Request(url, { mode: url.startsWith("http") ? "cors" : "same-origin" });
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
  if (isNavigation(req)) {
    e.respondWith(
      fetch(req)
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

  // Everything else (JS/CSS/fonts/images): cache-first for speed, with a
  // silent background refresh so caches don't go stale forever.
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