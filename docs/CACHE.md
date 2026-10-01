# CACHE.md

How caching works for the browser game, and how to invalidate it on deploy. The client is a static Vite bundle on Cloudflare; the Go simulation runs in Cloudflare Containers with Durable Objects for live-world persistence. Browser saves live in IndexedDB, never on the server.

---

## 1. WHAT GETS CACHED AND WHERE

| Layer | What it caches | Default behavior |
|---|---|---|
| Browser HTTP cache | JS/CSS chunks, fonts, images | Follows `Cache-Control` headers from Cloudflare |
| Cloudflare edge cache | Everything static under the domain | Caches by URL; respects origin `Cache-Control` |
| Vite build output | JS/CSS in `dist/assets/` | Filenames contain a content hash (for example `index-a3f9c1.js`); a changed file gets a new name automatically |
| World data | `public/world/` JSON and PNG tiles, fetched at runtime | Copied verbatim to `dist/world/`; filenames are fixed, so they need explicit versioning (section 3) |
| Audio | `public/audio/` SFX and radio MP3s, fetched at runtime | Same as world data: fixed filenames, explicit versioning needed |
| IndexedDB | Player saves and campaign state | Versioned by the app, not by HTTP (section 5) |

The JS/CSS bundle never goes stale by itself: Vite's content hashes mean a new deploy produces new filenames, and `index.html` (which references them) is served with `Cache-Control: no-cache` so the browser always revalidates it.

## 2. CACHE RULES PER ASSET CLASS

Set these as Cloudflare cache rules or origin headers:

| Path pattern | Strategy | Cache-Control | Why |
|---|---|---|---|
| `/` and `/index.html` | Revalidate every load | `no-cache` | Entry point; must pick up new hashed bundle names on every deploy |
| `/assets/*` (Vite hashed chunks) | Immutable, long-lived | `public, max-age=31536000, immutable` | Filename changes when content changes, so the old file can live in cache forever |
| `/world/*` | Versioned, medium-lived | `public, max-age=86400` | 16 MB of JSON and tiles; see section 3 for how versions change |
| `/audio/*` | Versioned, medium-lived | `public, max-age=86400` | SFX and radio files; same versioning as world data |
| `/fonts/*`, `/images/*`, `/favicon.svg` | Long-lived | `public, max-age=31536000` | Change rarely; bump with a query param or rename if they do |
| `/api/*` | Never cached | `no-store` | Live simulation state; a cached battle result is a wrong battle result |

## 3. VERSIONING RUNTIME-FETCHED DATA

`index.html` is the only file the browser revalidates. Everything fetched at runtime (world files, audio) uses fixed filenames, so a deploy that changes them must change the URL the client asks for. Two supported approaches, in order of preference:

1. **Build-stamped directory.** At build time, copy `public/world/` and `public/audio/` into `dist/` under a directory named for the build hash (for example `world-r4f2/`), and bake that path into the bundle via an env variable. Old clients keep working against the old directory until they reload; new clients get the new one. No purge needed.
2. **Query-param version.** Append `?v=<build-hash>` to fetch URLs (for example `/world/regions.json?v=r4f2`). Works with the default Cloudflare setup, but every proxy in the chain must be told to include the query string in the cache key. Cloudflare does this by default.

Do not rely on Cloudflare purge for routine deploys. Purge is the emergency tool: it is global, slow to propagate, and gives no guarantee about which client has which version.

## 4. AUDIO AND 3D ASSET SPECIAL HANDLING

Audio masters (WAV) and radio MP3s are large and change rarely:

- The pipeline (`tools/sfx/`, `tools/radio/`) writes delivery files plus a manifest (`audio-manifest.json`, `radio-manifest.json`) that records a SHA-256 per file. The client can compare the manifest's hashes against what it fetched to detect a half-updated deploy.
- After regenerating audio, bump the version in section 3 before deploying. Never ship new MP3s under the old version string.
- 3D models under `public/models/` follow the same rule: fixed filenames get versioned like world data. Models over the asset budgets in `tools/pipelines/README.md` are rejected at intake, so a deploy never has to serve a 200 MB GLB by accident.

## 5. INDEXEDDB SAVE VERSIONING

Saves live in the browser's IndexedDB. The server never sees them, so there is no server-side migration path.

- Every save record carries a `schemaVersion` integer. The app opens the database with a version number; `onupgradeneeded` runs migrations in order, one step per version, and each migration is a pure function from the old record shape to the new one.
- Rules:
  - Never remove a migration. Old saves from any shipped version must still open.
  - Migrations only add fields or transform values; they never delete player data silently. If a field cannot be migrated, keep it and mark it deprecated in code.
  - If a save is corrupt (fails to parse), do not overwrite it. Quarantine it under a `corrupt-<timestamp>` key and start fresh, so the player can report the bug and we can inspect the bytes.
- Test migrations with fixtures: keep one saved record per schema version in the test suite and assert each migrates cleanly to current.

## 6. SERVICE WORKER (NOT YET SHIPPED)

There is no service worker today, and the game works without one. If a PWA install prompt is added later:

- Cache-first for `/assets/*` (immutable hashed files; safe).
- Network-first for `/`, `/index.html`, and everything under `/world/`, `/audio/`, and `/api/`. A stale world file is worse than a slow one.
- Version the service worker itself: on activate, delete caches whose version does not match the current build hash.

## 7. DEPLOY CHECKLIST (CACHE PART)

1. Build the client (`vite build`); confirm `dist/index.html` references hashed asset names.
2. Stamp the runtime data version (section 3); confirm fetch URLs carry it.
3. Deploy static files to Cloudflare.
4. Purge nothing. Load the game in a fresh profile and confirm the version string in the footer (or build-hash notifier) matches the deploy.
5. If the game misbehaves after a deploy and a hard refresh fixes it, the entry point was cached: check that `/` and `/index.html` serve `Cache-Control: no-cache`.

## 8. EMERGENCY PURGE

When a bad file is already cached at the edge (wrong audio, corrupt world tile):

1. Fix the file and redeploy with a new version string (section 3). This fixes all future loads.
2. Only then, purge the specific bad URLs in the Cloudflare dashboard (Caching > Purge by URL), never "Purge Everything" unless the whole deploy is bad.
3. Verify with `curl -I <url>` from a clean network that the edge returns the new file and a fresh `cf-cache-status`.
