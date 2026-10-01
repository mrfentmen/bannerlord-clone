# RUNBOOK.md

Operating the browser game in production: how to deploy it, how to tell it is healthy, and what to do when it is not. Read CACHE.md first for the caching half of deploys.

The stack: a static Vite client on Cloudflare, a Go simulation behind `/v1/battle/*` running in Cloudflare Containers, Durable Objects for live-world persistence, and IndexedDB in the browser for saves. There is no server-side save storage and no Postgres.

---

## 1. DEPLOYMENT

### 1.1 Client (static bundle)

1. From a clean tree on the release branch, run the checks:
   - `cd clients/campaign && npx tsc --noEmit`
   - `npx vitest run`
   - `python3 tools/sfx/run.py --ci`, `python3 tools/radio/run.py --ci`, `python3 tools/anim/run.py --ci`, `python3 tools/pipelines/run.py --ci`
2. Build: `cd clients/campaign && vite build`. If the build is killed (OOM), pause background agents first, then resume them after.
3. Confirm `dist/index.html` references hashed asset names and the runtime-data version string (CACHE.md section 3) matches this build.
4. Deploy `dist/` to Cloudflare. Purge nothing on a routine deploy.
5. Smoke test in a fresh browser profile:
   - The game loads to the map screen with the skeleton UI on the first frame.
   - `GET /v1/version` returns 200 and a `build_hash` matching the deploy.
   - Start a battle, issue an order, resolve it. The result screen appears.

### 1.2 Simulation (Go service)

1. `cd services/simulation && go build ./...` must be clean.
2. The battle API exposes `POST /v1/battle/start`, `GET /v1/battle/state`, `POST /v1/battle/orders`, `GET /v1/battle/stream`, `POST /v1/battle/resolve`, and `GET /v1/version`. Deploy the container image with the build hash baked in; `/v1/version` reports it.
3. The tick loop runs 20 simulated ticks per wall second. After deploy, watch one live battle and confirm ticks advance (see 2.2).

### 1.3 What "done" looks like

- Client build hash (shown in the client footer / build-hash notifier) equals the deployed commit.
- `/v1/version` on the API returns the same build hash.
- No console errors on a fresh load; no failed fetches in the network tab.

## 2. HEALTH CHECKS

### 2.1 What to monitor

| Signal | Healthy | Alert when |
|---|---|---|
| `GET /v1/version` status | 200, correct build hash | Non-200 for 2 minutes, or wrong hash after a deploy |
| Battle tick rate | 20 ticks per wall second | Below 15 for 5 minutes (battles feel frozen) |
| Client error rate | Near zero console errors | Spike after a deploy (bad bundle or stale `index.html`) |
| Cloudflare cache hit ratio | High for `/assets/*`, `/world/*`, `/audio/*` | Sudden drop (origin trouble or cache rule regression) |
| Container restarts | Zero unexpected | Any restart not tied to a deploy |

### 2.2 Quick manual check

```bash
# API alive and reporting the right build?
curl -s https://<domain>/v1/version

# Entry point serving no-cache so clients pick up new bundles?
curl -sI https://<domain>/ | grep -i cache-control

# Edge serving the current world data version?
curl -sI "https://<domain>/world/regions.json?v=<build-hash>" | grep -i cf-cache-status
```

## 3. COMMON ISSUES

### 3.1 Game will not load (blank page)

1. Open devtools. If `index.html` loaded but chunks 404: the deploy shipped a new `index.html` referencing old hashed files, or vice versa. Redeploy the full `dist/` in one step; never upload files piecemeal.
2. If nothing loads at all: check Cloudflare status and DNS. `curl -sI https://<domain>/` should return 200.
3. If it loads in a fresh profile but not for returning players: stale cache. Confirm `/` serves `Cache-Control: no-cache` (CACHE.md section 2).

### 3.2 Audio not playing

1. The client is fault-tolerant by design: missing pipeline files make the radio stay silent, never crash the game. Silence alone is not a bug report; check the network tab for failed `/audio/*` fetches first.
2. If fetches 404: the audio version string did not get bumped with the new files (CACHE.md section 4). Redeploy with the correct version.
3. If files load but nothing sounds: check the browser autoplay policy. Audio starts on user gesture; the tavern/town radio starts when those screens open, which counts as a gesture in most browsers.

### 3.3 Save corrupted or missing

1. Saves live in IndexedDB in the player's browser. There is no server copy; do not promise recovery from our side.
2. The app quarantines unparsable saves under a `corrupt-<timestamp>` key instead of overwriting them. Ask the player for: browser and version, the schema version shown in settings (if reachable), and whether they cleared site data recently.
3. If many players report missing saves at once after a deploy: the IndexedDB migration (CACHE.md section 5) is broken. Roll back the client (section 4) and fix the migration with a fixture for the failing schema version before redeploying.

### 3.4 Battle desync or frozen battle

1. Check the tick rate: a battle that stops advancing usually means the simulation container is wedged or restarted mid-battle.
2. `POST /v1/battle/state` for the session id. If the session is gone, the container restarted; sessions do not survive restarts by design.
3. If ticks advance but units do nothing: check `/v1/battle/orders` accepts the order payload (400s here mean a client/server schema mismatch, usually from deploying one without the other).

### 3.5 FPS drops in large battles

1. The client has a rolling FPS monitor and a quality scaler (high to medium to low). Check which tier the player is on before assuming a bug.
2. The desktop target is 30 fps at 1,000 units. Below that on a machine that used to hit it: profile the spatial grid first; historically it has been about 86 percent of battle CPU.
3. Never benchmark on a loaded box. Pause background agents before profiling, resume after.

## 4. ROLLBACK

Client and simulation deploy independently, but they must stay schema-compatible on `/v1/battle/*`.

1. Identify the last good build hash (from the deploy log or `/v1/version` history).
2. Redeploy the full `dist/` of that build in one step. Do not mix files across builds.
3. If the API changed too, roll the container image back to the matching build.
4. Verify with the smoke test in 1.3. Watch the error rate for 15 minutes.

## 5. LOG LOCATIONS

| Log | Where |
|---|---|
| Client console errors | Player's devtools; ask for a screenshot or exported HAR on bug reports |
| Simulation stdout | Container logs in the Cloudflare dashboard |
| Battle results | Returned by `POST /v1/battle/resolve`; the client also shows them on the result screen |
| Pipeline runs | Stdout of `tools/*/run.py --ci`; each pipeline also writes its manifest (`audio-manifest.json`, `radio-manifest.json`, model manifest) |
| Deploy history | Git log on the release branch; every deploy should be a tagged commit |

## 6. SEVERITY AND ESCALATION

- **P1 (game down):** blank page for everyone, or `/v1/version` non-200. Roll back immediately, then investigate.
- **P2 (feature broken):** audio silent, saves failing, battles frozen. Fix forward if the cause is clear and small; otherwise roll back.
- **P3 (degraded):** FPS complaints, single-player issues. Investigate in the normal queue.

Technical blockers go to Pax, who relays to Del. Do not page Del directly for production issues.
