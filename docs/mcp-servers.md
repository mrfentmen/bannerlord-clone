# MCP servers for the crew — keyless only

**Date:** 2026-10-01
**Status:** owner directive. **Owner rule: no server may require an API key, token, or licence.**

**Read first:** `CONSTITUTION.md`, `agents/README.md`, `ART_AND_AUDIO.md`, `ASSETS.md`

---

## 0. What this is

Which MCP servers each agent should connect, so it can do its lane better. Additive; touches no design doc.

Two rules govern this document:

1. **No credentials.** Any tool that needs an API key, token, or licence key is out. A secret that does not need to exist cannot leak.
2. **Verified, not assumed.** Every tool marked FREE below was called and returned data. Every tool marked PREMIUM returned a licence error. Do not upgrade a PREMIUM tool by adding a key — that breaks rule 1.

**The premium trap.** These servers come from a third-party collection where *individual tools* behind a free-looking server can be paywalled. A server being "free" is not enough — the specific tool has to be free. Both tables below are per-tool for that reason.

---

## 1. Stack reality

Renderer is **Babylon.js in a browser**. Backend is **Go**. We own no Unreal project, no Unity project, no `project.godot`, no C++ build.

Nearly everything online for "MCP servers for game development" is Unity, Unreal, Godot, or Roblox. **None apply to us.** Do not install an engine MCP; there is no engine to connect to.

---

## 2. Already connected — the shared baseline

These run today. Every lane should assume them available. `meme-imgflip` has been **removed** by owner directive; it has no purpose in a game project.

### 2.1 Essential — use daily

| Server | Lane | Use it for |
|---|---|---|
| **playwright** | 3, 4 | The only way to actually verify the client or the crowd benchmark. Already have e2e specs in `clients/campaign/tests/e2e/`; this is the same capability interactively. |
| **filesystem** | all | Lane-scoped reads and writes. Agents stay inside their own folder. |
| **github** | all | Repo reads and pushes. The Contents API needs auth; the `git` CLI is the reliable push path. |
| **context7** | 2, 3 | Current Babylon.js and Vite docs. Our training data predates both. |
| **sequential-thinking** | 2 | Chain and balance reasoning for `CAUSE_EFFECT.md`. |
| **memory** | all | Knowledge graph. Best use here: shared terminology and canon across lanes so two agents do not invent two names for the same thing. |
| **osv-mcp** | all | Advisory and vulnerability lookup. Any dependency added under `CONSTITUTION.md` §4.2 should be checked through it. |
| **deps-dev-mcp** | 2, 3 | Dependency versions, release history, licences. Supports §4.2 "check before you add a library". |

### 2.2 Useful — reach for them

| Server | Use it for |
|---|---|
| **fetch** | Pulling a URL the filesystem and github servers cannot, including docs and raw data files. |
| **mcp-shell**, **mcp-terminal** | Running builds and tests, and interactive terminal sessions when a command needs a TTY. |
| **schema-compatibility** | Diffing a schema before and after a change. **Directly relevant** to the client/world-data wire contract in `services/world-data/src/worlddata/client_wire.py`; a field rename there breaks the client silently. |
| **mcp-spec** | Looking up MCP specification details when writing or reviewing an MCP server. |
| **mcp-advisor** | Compliance-checking a server we author ourselves. |
| **time** | Date and timezone handling. Low stakes, but harmless and occasionally needed for log and changelog timestamps. |

### 2.3 Marginal — keep, do not build on

| Server | Note |
|---|---|
| **openapi-scout** | Built for OpenAPI specs. We have a Go API that does not exist yet (§6, hosting undecided). Revisit when it does. |
| **sqlite** | **We do not use SQLite.** `CONSTITUTION.md` §4 locks Postgres. Harmless, but do not let an agent reach for it as a shortcut around the hosting decision. |
| **website-builder** | Builds static marketing sites. Not a game. |
| **restful-api-dev** | A mock JSON test API. Only useful for testing an HTTP client before the real backend exists. |
| **everything** | The MCP reference/demo server. Useful for debugging MCP plumbing, nothing else. |

### 2.4 Broken — do not rely on

| Server | Status |
|---|---|
| **json-schema-store** | Currently failing to connect (`MCP error -32000: Connection closed`). Do not depend on it. Either fix the launch or drop it; do not leave a permanently broken server in the config pretending to work. |

---

## 3. Tier 1 — install these. Verified keyless.

### 3.1 `overpass-mcp` — real OpenStreetMap data

**Why:** `CONSTITUTION.md` §1.1 requires real geography. `services/world-data` already fetches OSM, and the latest repo commit says *"Brooklyn/Queens/Staten Island pending: Overpass API timing out on all queries as of 2026-10-01 03:40 UTC"* — wave 1 stalled on this exact service.

| Tool | Status |
|---|---|
| `nodes_in_box` | **FREE** |
| `tag_census` | **FREE** |
| `map_features`, `named_places`, `element_lookup`, `nearby_features` | PREMIUM — do not use |

**Honest scope:** only the two free tools remain, and they are the weaker half. `nodes_in_box` gives raw OSM nodes in a bounding box, and `tag_census` counts features carrying a tag across a view. **The friendly queries — named places, nearby features — are paywalled.** This server is worth installing for the raw and counting queries, and is **not** a replacement for the existing `tools/fetch-city-data.py`. Do not let an agent conclude from a `tag_census` count that a city is empty; a timeout and a zero result look identical on the wire, so implement backoff and report a timeout as a timeout under **Unresolved**.

**Config:**

```jsonc
"overpass": {
  "type": "local",
  "command": ["node", "/Users/dtaxk/workspaces/awesome-mcps/servers/overpass-mcp/dist/index.js"],
  "enabled": true,
  "timeout": 180000
}
```

### 3.2 `census-geo-mcp` — independent verification of real figures

**Why:** `PHASES.md` Phase 0 exit criteria require spot-checking settlements against published figures. `CHANGELOG.md` records **24 agree, 1 disagree, 11 unverified**, and those 11 rows are why Phase 0 is unsigned. The US Census API is free.

| Tool | Status |
|---|---|
| `geocode`, `coordinates`, `coordinate_geographies` | **FREE** |
| `address_geographies` | PREMIUM — do not use |

**Config:**

```jsonc
"census-geo": {
  "type": "local",
  "command": ["node", "/Users/dtaxk/workspaces/awesome-mcps/servers/census-geo-mcp/dist/index.js"],
  "enabled": true,
  "timeout": 120000
}
```

### 3.3 `musicbrainz-mcp` — era audio catalogue

**Why:** `ART_AND_AUDIO.md` wants period-appropriate music and radio. There is no audio catalogue anywhere in the repo.

| Tool | Status |
|---|---|
| `search_artists`, `search_releases`, `search_recordings`, `get_artist` | **FREE** |
| `search_release_groups`, `search_labels` | PREMIUM — do not use |

**Verified working:** a query for Nina Simone returned her artist record with type, country, start and end dates, and MBID. That is exactly the metadata shape an audio manifest needs.

**Hard honesty rule:** MusicBrainz is a **metadata** service. It tells us what exists, by whom, in what era. **It does not provide audio files.** An agent must never write a CHANGELOG row implying we hold licensed audio when we hold a metadata record. Whatever sources the actual audio needs its own `CONSTITUTION.md` §5 manifest entries.

**Config:**

```jsonc
"musicbrainz": {
  "type": "local",
  "command": ["node", "/Users/dtaxk/workspaces/awesome-mcps/servers/musicbrainz-mcp/dist/index.js"],
  "enabled": true,
  "timeout": 120000
}
```

### 3.4 `color-mcp` — make the locked art direction mechanical

**Why:** `CONSTITUTION.md` §3.1 locks visual direction *before* panels are built, and §3.4 forbids components inventing their own palette. `ART_AND_AUDIO.md` holds the direction as prose, `src/design/tokens.ts` holds it as code, and nothing links them.

| Tool | Status |
|---|---|
| `color_scheme`, `color_info` | **FREE** |
| `color_contrast`, `random_color` | PREMIUM — do not use |

**Gap to know about:** `color_contrast` is paywalled, and that was the accessibility half of the job. Palette generation is free; contrast verification is not. Accessibility therefore stays a manual check, and `CHANGELOG.md` must not claim a contrast pass was automated.

**Config:**

```jsonc
"color": {
  "type": "local",
  "command": ["node", "/Users/dtaxk/workspaces/awesome-mcps/servers/color-mcp/dist/index.js"],
  "enabled": true,
  "timeout": 120000
}
```

### 3.5 `image-tools-mcp` — texture and screenshot work

**Why:** `CONSTITUTION.md` §5 stores originals unedited and ships compressed formats. §3.4 requires small-screen checks at 320/390/768/1440px, which means resizing and comparing screenshots.

| Tool | Status |
|---|---|
| `resize_image`, `inspect_image` | **FREE** |
| `probe_url`, `convert_url_image` | PREMIUM — do not use |

The free half covers the common case: resizing local textures and screenshots. Anything that fetches a URL to convert is paywalled, so **download first, then convert locally**.

**Config:**

```jsonc
"image-tools": {
  "type": "local",
  "command": ["node", "/Users/dtaxk/workspaces/awesome-mcps/servers/image-tools-mcp/dist/index.js"],
  "enabled": true,
  "timeout": 120000
}
```

### 3.6 `package-registry-mcp` — check before adding a dependency

**Why:** `CONSTITUTION.md` §4.2 says *"Check whether the repo already does a thing before adding a library that does it again."* Make it a tool call instead of a guess.

| Tool | Status |
|---|---|
| `npm_package`, `pypi_package`, `npm_search` | **FREE** |
| `npm_dist_tags`, `npm_publish_timeline` | PREMIUM — do not use |

**Config:**

```jsonc
"package-registry": {
  "type": "local",
  "command": ["node", "/Users/dtaxk/workspaces/awesome-mcps/servers/package-registry-mcp/dist/index.js"],
  "enabled": true,
  "timeout": 120000
}
```

### 3.7 `mdn-search-mcp` — web platform reference

**Why:** the campaign client is TypeScript in a browser, so real failures live in web APIs our training data is stale on.

| Tool | Status |
|---|---|
| `search`, `section_census` | **FREE** |
| `search_ranked`, `locale_coverage` | PREMIUM — do not use |

`context7` remains the better source for *library* docs; use this for *web platform* behaviour.

**Config:**

```jsonc
"mdn-search": {
  "type": "local",
  "command": ["node", "/Users/dtaxk/workspaces/awesome-mcps/servers/mdn-search-mcp/dist/index.js"],
  "enabled": true,
  "timeout": 120000
}
```

### 3.8 `math-tools-mcp` — balance arithmetic

**Why:** `CAUSE_EFFECT.md` §6 requires every rate constant justified against a run, and `CONSTITUTION.md` §1.2 forbids magic numbers.

| Tool | Status |
|---|---|
| `stats`, `gcd_lcm`, `prime_factors` | **FREE** |
| `evaluate_expression`, `sequence_lookup` | PREMIUM — do not use |

**Caveat:** the expression evaluator is paywalled, which was the most useful piece. What remains is enough for descriptive statistics over a result series, which is genuinely what balance tuning needs. Arithmetic with a chain of operations still has to be written in Go or in a scratch script — and per §1.2 it belongs in `balance.toml`, not in a throwaway expression.

**Config:**

```jsonc
"math-tools": {
  "type": "local",
  "command": ["node", "/Users/dtaxk/workspaces/awesome-mcps/servers/math-tools-mcp/dist/index.js"],
  "enabled": true,
  "timeout": 120000
}
```

---

## 4. `mcp-for-blender` — the CC0 asset pipeline, keyless paths only

**Why:** `ASSETS.md` plans to source free models with a licence manifest per asset (`CONSTITUTION.md` §5), but the repo holds catalogues and no models. This makes sourcing mechanical.

**The keyless split matters here more than anywhere:**

| Keyless — use these | Needs a credential — do not use |
|---|---|
| `search_polyhaven_assets`, `download_polyhaven_asset`, `get_polyhaven_categories`, `get_polyhaven_asset_preview` | `search_sketchfab_models`, `download_sketchfab_model`, `get_sketchfab_model_preview` |
| `search_polypizza_models`, `download_polypizza_model` | `generate_hyper3d_*`, `generate_tripo_model`, `generate_hunyuan3d_model`, `poll_*_job_status` |
| `export_scene`, `set_texture`, `get_scene_info`, `get_object_info`, `get_viewport_screenshot`, `execute_blender_code` | |
| `bpy_api_lookup`, `describe_node_type`, `get_addon_status` | |

**Poly Haven is 100% CC0 with no key and no attribution obligation.** That is the cheapest possible answer to §5, and it is the path the crew is authorised to use.

**Install:**

```bash
# The old `blender-mcp` PyPI name is a stub that redirects here, so the package
# is `mcp-for-blender`. Most tutorials online use the old name.
uv tool install mcp-for-blender
mcp-for-blender install-addon
```

Then in Blender: Preferences → Add-ons → enable **Interface: MCP for Blender** → restart → N-panel → **Start MCP Server**.

**Config:**

```jsonc
"blender": {
  "type": "local",
  "command": ["/Users/dtaxk/.local/bin/mcp-for-blender"],
  "environment": { "BLENDER_MCP_SAFE_MODE": "1" },
  "enabled": true,
  "timeout": 180000
}
```

**Two blockers, both real and both already hit:**

1. **A GUI Blender must be running.** The addon refuses to start under `blender --background`, by design: it drains commands on Blender's main thread, where background mode never executes them. **Every** tool routes through that bridge, including Poly Haven search, so there is no partial mode. Verified here: with no Blender, all 36 tools return *"Could not connect to Blender"*.
2. **A headless or GPU-less machine cannot run Blender at all.** Verified here: GUI Blender segfaults in `GPU_context_create`. On such a machine this server is dead weight — install it on a desktop with a real GPU.

**Safe mode.** `execute_blender_code` runs arbitrary Python inside Blender with your file permissions. Keep `BLENDER_MCP_SAFE_MODE=1`.

**Manifest duty.** Every Poly Haven or Poly Pizza download still needs an `ASSETS.md` manifest row — source, author, licence, date retrieved, attribution text — and the §5.2 build check. A CC0 licence makes the row easy, not optional.

---

## 5. Explicitly rejected — keyless, but the wrong idea

| Server | Why not |
|---|---|
| `geojs-mcp`, `freegeoip-mcp`, `ip-geo-mcp`, `geolocation-db-mcp` | These geolocate **the machine making the request**. §1.1 requires real geography **imported from datasets**. Swapping "Cleveland" for "wherever this agent runs" is the exact invented-data failure the constitution bans. An agent reaching for one of these is a red flag worth reporting. |
| `migration-map-mcp` | Software-project migrations, not human migration. We do have a human migration system in `CAUSE_EFFECT.md` §3, and this is the wrong source. |
| `nasa-images-mcp` | Imagery with no stated gameplay purpose. |
| `svgl-mcp` (`svgl`, `search_logos`) | A logo library. Our UI direction is grounded and gritty, not brand-marked. |
| Unity / Unreal / Godot / Roblox MCP servers | We own no such project. §1. |

## 6. Rejected because they require a credential

Listed so nobody reinstates one from an old tutorial.

| Server | Credential |
|---|---|
| `figma-mcp` | `FIGMA_ACCESS_TOKEN` — would genuinely help the §3.1 art-direction lockup. Blocked by rule 1. Work the direction in `ART_AND_AUDIO.md` and `design/tokens.ts` instead. |
| `mobygames-mcp` | `MOBYGAMES_API_KEY` — design research; `docs/bannerlord-gap-analysis.md` is already the reference. |
| `polygon-mcp` | `POLYGON_API_KEY` — stock market data, irrelevant regardless. |
| `theaudiodb-mcp` | Tool surface shows no key but its API is normally keyed. Not worth the ambiguity; `musicbrainz` covers §3.3. |

---

## 7. Security rules

1. **This project needs no credentials for any MCP server or any tool in it.** If a committed config asks for a token, that is a bug. Delete it.
2. **This repository is public.** A credential in a committed file is compromised on push. Assume it and rotate it.
3. **Never write a real token into a doc, comment, commit message, or CHANGELOG row.** `${ENV_VAR}` placeholders at most.
4. **Do not "temporarily" add a licence key** to reach a PREMIUM tool. That breaks rule 1 and puts a credential in a config.
5. **MCP servers run with your local permissions.** One that can write files can write files. Read what it does and where it points before enabling it.
6. **These are third-party builds** from a personal collection, not vetted by this project. We hold other people's assets to the §5 licence standard; the same standard applies to the code we run.

> **Live example, 2026-10-01.** A GitHub personal access token was found in plaintext in a shared local opencode config while preparing this document. It was never committed, but it is exactly the failure rule 1 prevents — and under this directive it is simply unnecessary, since `gh` authenticates from the keyring. Rotate it and remove it from the config.

---

## 8. Lane assignments

Each lane adds its own servers. Do not edit another lane's block — the `agents/README.md` "one agent, one folder" rule, applied to configuration.

| Lane | Add | Why |
|---|---|---|
| 1 — world data | **census-geo**, **overpass** | Census to close the 11 unverified spot-check rows blocking Phase 0. Overpass for raw OSM nodes and tag counts while wave 1 is stalled. |
| 2 — simulation | **math-tools**, **package-registry** | Descriptive statistics over balance runs, and dependency checks before adding anything. |
| 3 — campaign client | **playwright**, **image-tools**, **color**, **mdn-search** | Screenshot verification, texture work, mechanical palette generation, current web-platform behaviour. |
| 4 — crowd POC | **playwright**, **blender** | Real viewport for the benchmark; the CC0 asset pipeline. |
| 5 — asset and licence | **blender**, **musicbrainz**, **image-tools** | §5 is the weakest-evidenced rule in the repo. These make it mechanical. |

---

## 9. Definition of done for a server

- [ ] Listed in the lane's config with **no credential and no licence key**.
- [ ] Lane can list its tools, and a **FREE** tool has been run with real output.
- [ ] Real output pasted into `CHANGELOG.md` under **Built**.
- [ ] The lane's build, typecheck, and tests still pass with it enabled.
- [ ] If it cannot be made to work, that goes under **Unresolved** with the actual error — never a claim that it works.