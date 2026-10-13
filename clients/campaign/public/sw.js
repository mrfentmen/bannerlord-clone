/**
 * Minimal service worker (MASTER_PLAN task 28).
 *
 * Makes the campaign installable as a PWA. Strategy:
 *   - App shell (/, /index.html, /manifest.webmanifest, icons, fonts):
 *     cache-first, so an installed game boots even with no signal.
 *   - Hashed build assets (/assets/*): cache-first; the hash in the filename
 *     makes them immutable, and the update notifier (task 29) handles refresh.
 *   - World data (/world/*): network-first, in its own bucket keyed by the same
 *     build token the URLs already carry, so an offline player still gets the
 *     region they were playing and a deploy cannot leave them on the last one.
 *   - Everything else (API calls): network-first, no fallback to the shell.
 *
 * Two cache namespaces, because they are invalidated by different things.
 *
 * `CACHE_VERSION` is the shell, and a human bumps it when the shell changes
 * incompatibly. World data is not on that clock: it is replaced by a deploy, and
 * `services/world-data` can swap the whole region without touching this file. So
 * the world bucket is named after the build token in the request URL - the `b=`
 * that `cacheBust` in `src/world/load.ts` already appends to every world URL -
 * and the bucket from any other build is dropped as soon as a response arrives
 * for this one.
 *
 * That token, rather than the identity fields in `region.json`, is what names the
 * bucket, and the reason is ordering. `loadWorldData` fetches region, settlements,
 * network and boundaries in one `Promise.all`, so all four responses are in flight
 * at once, and only `region.json` says which bucket the other three belong in. A
 * cache named from it therefore depends on which response happens to be *parsed*
 * first, and the three files that do not name it will usually win - so the offline
 * cache ends up holding the region file and none of the data that goes with it, and
 * an offline player is told the survey is missing rather than that they are playing
 * it. The token is in the request itself, so every response can name its own bucket
 * without knowing anything about its siblings.
 *
 * It also invalidates on the event that matters most and that a region identity
 * cannot see: a deploy that replaces this region's data while leaving the region's
 * name, bbox and retrieval date alone. Same region, new settlements. The token
 * moves on every build, so that copy cannot survive one.
 *
 * A world-data request that fails and finds nothing cached is allowed to fail. The
 * loader (`src/world/load.ts`) reports that as a retryable WorldDataError with a
 * sentence for the player; serving `/index.html` to a JSON parser instead turns a
 * missing survey into "the file is damaged", which is a different bug from the one
 * that happened.
 */
const CACHE_VERSION = "campaign-shell-v1";
const WORLD_CACHE_PREFIX = "campaign-world-";
const WORLD_PATH = "/world/";
/** Bucket for a world request that arrived without a build token. */
const WORLD_UNVERSIONED = `${WORLD_CACHE_PREFIX}unversioned`;
const BUILD_TOKEN = "b";
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/favicon.svg",
];

function isWorldData(url) {
  return new URL(url).pathname.startsWith(WORLD_PATH);
}

function isImmutableAsset(url) {
  return new URL(url).pathname.startsWith("/assets/");
}

/**
 * The world bucket a request belongs to, from the build token on its own URL.
 *
 * A Cache API bucket name is a free-form string, so the token is restricted to
 * characters a hash is actually made of. Anything else is not a build this worker
 * wrote, and gets the unversioned bucket rather than a new one per malformed URL.
 */
function worldCacheNameFor(url) {
  const token = new URL(url).searchParams.get(BUILD_TOKEN);
  if (!token) return WORLD_UNVERSIONED;
  const safe = token.replace(/[^A-Za-z0-9._-]/g, "");
  return safe ? `${WORLD_CACHE_PREFIX}${safe}` : WORLD_UNVERSIONED;
}

/** Delete every world bucket but `keep`. There is only ever one in play. */
async function dropOtherWorldCaches(keep) {
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((k) => k.startsWith(WORLD_CACHE_PREFIX) && k !== keep).map((k) => caches.delete(k)),
  );
}

/**
 * The bucket whose contents are already the only world bucket on disk.
 *
 * The boot tier is 154 tiles fetched one at a time, and `dropOtherWorldCaches` asks the
 * cache store for its whole key list every time. Remembering the last bucket pruned turns
 * 154 of those into one, and nothing is lost: a bucket that is already alone cannot
 * acquire a rival without a request carrying a different build token, and that request
 * sets this to a different name.
 */
let pruned = null;

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
        // Stale shell caches only. World buckets are named after the build whose
        // requests fill them, not after this file's version, so purging them here
        // would throw away the offline map of the build this very worker serves.
        // The one that is genuinely stale - an earlier build's - is dropped by
        // `worldResponse` as soon as this build asks for anything.
        Promise.all(
          keys.filter((k) => k !== CACHE_VERSION && !k.startsWith(WORLD_CACHE_PREFIX)).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

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

  if (isWorldData(request.url)) {
    event.respondWith(worldResponse(request));
    return;
  }

  // Shell + API: try the network, fall back to cache, then to the shell.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && new URL(request.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(() => cachedOrShell(request)),
  );
});

/**
 * Network-first for world data, bucketed by the build the request came from.
 *
 * A response that is not ok, or not same-origin, is returned as it arrived and
 * never cached: a 404 for a file this region does not ship is a fact about the
 * region, and caching it would make the next load believe it.
 */
async function worldResponse(request) {
  let response;
  try {
    response = await fetch(request);
  } catch (err) {
    const hit = await caches.match(request);
    if (hit) return hit;
    // Nothing cached and no network: let this fail. The loader's own error path is the
    // one that can explain it, and it is retryable, which is the truth.
    throw err;
  }
  if (!response.ok || new URL(request.url).origin !== self.location.origin) return response;

  try {
    const name = worldCacheNameFor(request.url);
    const cache = await caches.open(name);
    await cache.put(request, response.clone());
    // Only a build's own bucket may evict. An untokenised request is a courtesy bucket -
    // `src/scene/cityDemo.ts` fetches `world/cities/<slug>.json` without a token - and
    // letting one evict would trade the whole offline map for a file nobody has cached.
    if (name !== WORLD_UNVERSIONED && pruned !== name) {
      await dropOtherWorldCaches(name);
      pruned = name;
    }
  } catch {
    // A cache that cannot be written is not a reason to fail a load that succeeded.
    // The response below is the real one.
  }
  return response;
}

/**
 * Offline with no cached copy of what was asked for.
 *
 * The shell fallback is for navigations only. Serving `/index.html` in answer to a
 * `fetch()` for `/world/settlements.json` returns `200 OK` with an HTML body, which
 * every JSON reader in the app sees as a *corrupt* file rather than as a missing one
 * - so a player with no signal is told the world survey is damaged instead of being
 * told they are offline. That is CONSTITUTION.md section 1.3's exact failure: a loud
 * message that is loud about the wrong thing.
 *
 * It is reachable rather than theoretical. World data is fetched network-first, so a
 * player online during a deployment gets the new files and a player online during
 * none does not; a returning player whose bucket predates a newly added wire file,
 * who then loses signal, lands on exactly that path. Adding `boundaries.json` made it
 * more likely, because a file that did not exist for the build they last played now
 * does.
 *
 * So: navigations get the shell, so the installed game opens. Everything else gets a
 * 503 saying it was never cached, which the app reports as what it is. World data does
 * not come through here at all - `worldResponse` lets its own failure stand, because
 * the loader's retryable `WorldDataError` is a better answer than a 503 either.
 */
function cachedOrShell(request) {
  return caches.match(request).then((hit) => {
    if (hit) return hit;
    if (request.mode === "navigate") return caches.match("/index.html");
    return new Response("offline, and this file has never been cached", {
      status: 503,
      statusText: "Offline and not cached",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  });
}