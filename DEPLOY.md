# DEPLOY.md

How to deploy the Bannerlord Clone to Cloudflare. One domain, no subdomains.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Cloudflare Worker (bannerlord-clone)                    │
│  workers/router/wrangler.toml                           │
├─────────────────────────────────────────────────────────┤
│  /              → Static client (Vite build)            │
│  /api/*         → Go API server (Container)             │
│  WebSocket      → Go API server (same Container)        │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ Durable Object: CampaignApi                             │
│  Owns the API server Container                          │
│  SQLite for persistence                                 │
└─────────────────────────────────────────────────────────┘
```

**Why this shape:** One page, one domain, no subdomains (boss's order).
The Worker routes everything. Static assets served directly. API calls go
to the Go server in a Container. Saves are in the player's browser
(IndexedDB), not on the server.

---

## Prerequisites

- `wrangler >= 3.90` (Containers support)
- Cloudflare account with Workers, Containers, Durable Objects enabled
- Go toolchain (for building the API server)
- Node 24+ (for building the client)

---

## Build Steps

### 1. Build the Client

```bash
cd clients/campaign
npm ci
npm run build
# Output: dist/ (uploaded as Worker assets)
```

The build runs:
- `write-build-hash.mjs` — stamps the build
- `tsc --noEmit` — typecheck (must pass)
- `vite build` — bundles the client
- `check-no-fixtures.mjs` — ensures no test fixtures in prod

### 2. Build the API Server

```bash
cd services/simulation
go build -o apiserver ./cmd/apiserver
```

### 3. Deploy

```bash
wrangler deploy --config workers/router/wrangler.toml
```

This uploads:
- Client static assets from `clients/campaign/dist`
- Worker code from `workers/router/src/index.ts`
- Creates the Durable Object binding

---

## Configuration

`workers/router/wrangler.toml`:

```toml
name = "bannerlord-clone"
main = "workers/router/src/index.ts"
compatibility_date = "2026-09-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "clients/campaign/dist"
not_found_handling = "single-page-application"

[durable_objects]
bindings = [
  { name = "APISERVER", class_name = "CampaignApi" }
]

[[migrations]]
tag = "v1"
new_sqlite_classes = ["CampaignApi"]
```

---

## Environment Variables

Set via `wrangler secret` or in the dashboard:

- `SIMULATION_MODE` — `production` or `fixture`
- `WORLD_DATA_URL` — URL for world data files

---

## Monitoring

- **Logs:** `wrangler tail --config workers/router/wrangler.toml`
- **Metrics:** Cloudflare dashboard → Workers → bannerlord-clone
- **CI:** GitHub Actions runs `ci-gate.yml` on every push (vitest + typecheck + build + pytest)

---

## Rollback

```bash
# List deployments
wrangler deployments list --config workers/router/wrangler.toml

# Rollback to previous
wrangler rollback --config workers/router/wrangler.toml
```

---

## Local Development

```bash
# Client only (uses fixture data)
cd clients/campaign
npm run dev

# With local API server
cd services/simulation
go run ./cmd/apiserver &
cd ../../clients/campaign
VITE_API_URL=http://localhost:8080 npm run dev
```
