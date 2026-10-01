# 3D asset pipeline (task 4A - hardened)

3D model intake for the game: validates a GLB, analyzes it through the
local MCP gateway (`3d-asset-processing-mcp`, keyless), checks the
result against asset budgets, and records it in
`content/art/models/manifest.json` so every model carries stats,
source, licence, and a commercial-use flag.

Nothing ships publicly until licensing is resolved - models marked
`UNRESOLVED` are never flagged commercially cleared.

## Quick start

```bash
python3 tools/pipelines/run.py --ci          # full validation pass
python3 tools/pipelines/run.py --self-test   # process-3d.py self-test
python3 tools/pipelines/run.py --tests       # unit tests only

python3 tools/pipelines/process-3d.py model.glb --source chisel --licence CC0-1.0
python3 tools/pipelines/process-3d.py model.glb --source sketchfab --licence UNRESOLVED
```

## Files

| File | What it does |
|---|---|
| `process-3d.py` | Intake entry point. Validates, analyzes, budget-checks, records. |
| `validate.py` | Pure validation: GLB header, size limits, asset budgets, licences. |
| `gateway.py` | Resilient MCP gateway client: health check, retries, error types. |
| `run.py` | CI runner (`--ci`, `--self-test`, `--tests`). |
| `tests/` | 27 unit tests (`test_asset_pipeline.py`). |
| `check-sim.py`, `check-writing.py` | Unrelated pipeline checks (sim determinism, writing). |
| `voice/` | Voice pipeline (separate README inside). |

## Hardening measures (task 4A)

**Input validation** (`validate.py`):
- GLB magic bytes (`glTF`), version 2, header-declared length must
  match the actual file size
- `.glb` extension enforced
- File size limits: 20 bytes minimum, 50 MB maximum (`MAX_FILE_BYTES`)

**Asset budgets** (`validate.py`, `BUDGETS`):
- 100,000 vertices, 200,000 triangles, 64 meshes, 16 textures per model
- Over-budget models are rejected at intake with a plain-English reason.
  The artist decimates and re-submits; the pipeline never silently
  ships a frame-rate killer.
- Unknown (`None`) stats are skipped, not failed - the analyzer may
  not report every field.

**Gateway resilience** (`gateway.py`):
- `MCP_GATEWAY_URL` env var overrides the default
  (`http://127.0.0.1:8931/mcp/`); the gateway dies on VM reboot, so
  this matters
- Fast health check before expensive analysis calls
- Exponential-backoff retries (1s, 2s, 4s) for transient failures
  (timeouts, unparseable responses)
- `GatewayUnreachable` is NOT retried - the error message tells you
  how to restart the gateway instead of hammering a dead process
- `GatewayToolError` is NOT retried - the tool itself failed, so the
  same call would fail identically

**Manifest safety** (`process-3d.py`):
- Atomic writes: temp file in the same directory, then `os.replace`.
  A crash mid-write leaves the old manifest intact; no `.tmp`
  leftovers on success.
- Corrupt manifests raise `ValidationError` with the file named,
  instead of a raw `json.JSONDecodeError`
- Paths stored absolute, so the manifest stays valid regardless of
  the caller's working directory

**Licence handling** (`validate.py`):
- Empty licences and path-traversal strings rejected
- `is_commercially_cleared()` is allowlist-based: only known SPDX
  ids count, and `UNRESOLVED`/`UNKNOWN` never clear. Unknown
  identifiers stay uncleared until a human adds them to the list.

**Error taxonomy** - the CLI exits with distinct messages:
- `validation:` - bad input, over budget, corrupt manifest (exit 1)
- `gateway down:` - gateway not answering, with restart hint (exit 1)
- `analysis:` - gateway answered but the tool failed (exit 1)
- `io:` - filesystem errors (exit 1)
- usage errors (exit 2)

## Budgets rationale

The game must hit 60 fps on campaign and 30 fps in 1,000-unit
battles on mid-range phones. A single 500k-triangle hero asset
blows that budget for everyone. The per-model caps above keep any
one asset from sinking the frame rate; total scene budgets are
enforced separately by the performance scaler in the client.
