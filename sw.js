// Bajeti Yanga service worker
// Bump this version string on every deploy to force cache invalidation.
const V = "bajeti-v9.4.2";
const URLS = ["/bajeti-yanga/", "/bajeti-yanga/index.html"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(V).then((c) => c.addAll(URLS).catch(() => {}))
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

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(
      (r) =>
        r ||
        fetch(e.request)
          .then((nr) => {
            try {
              const c = nr.clone();
              caches.open(V).then((cc) => cc.put(e.request, c));
            } catch (x) {}
            return nr;
          })
          .catch(() => caches.match(URLS[0]))
    )
  );
});

