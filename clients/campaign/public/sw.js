/**
 * Minimal service worker (MASTER_PLAN task 28).
 *
 * Makes the campaign installable as a PWA. Strategy:
 *   - App shell (/, /index.html, /manifest.webmanifest, icons, fonts):
 *     cache-first, so an installed game boots even with no signal.
 *   - Hashed build assets (/assets/*): cache-first; the hash in the filename
 *     makes them immutable, and the update notifier (task 29) handles refresh.
 *   - Everything else (API calls, world data): network-first with a cache
 *     fallback, so the game degrades to cached data rather than failing.
 *
 * The cache name carries a version. Bump CACHE_VERSION when the shell changes
 * incompatibly; old caches are purged on activate.
 */
const CACHE_VERSION = "campaign-shell-v1";
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isImmutableAsset(url) {
  return new URL(url).pathname.startsWith("/assets/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (isImmutableAsset(request.url)) {
    // Hashed filenames: safe to serve from cache forever.
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Shell + data: try the network, fall back to cache, then to the shell.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && new URL(request.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(request).then((hit) => hit ?? caches.match("/index.html")),
      ),
  );
});
