# CI Gate

One script, one workflow, one meaning of green. `tools/ci-gate.sh` runs every
check that can run on a plain Linux box; `.github/workflows/ci-gate.yml` runs
that same script on every push and pull request. If it's green locally, it's
green in CI.

## What it runs

| Check | What it does | Needs |
|---|---|---|
| `world-data pytest` | Full pytest suite in `services/world-data` | python + pytest (uses the local venv at `~/workspace/.venvs/worlddata` if present, else `python3`) |
| `client vitest` | `npm test` in `clients/campaign` | node + npm + `node_modules` |
| `client tsc --noEmit` | `npm run typecheck` | same as above |
| `client vite build` | `npm run build` (tsc + vite + no-fixtures check) | same as above |
| `manifest integrity (SHA-256)` | Re-hashes every file listed in `assets/manifest.json`, `assets/audio-manifest.json`, and any other `assets/*-manifest.json` that exists in the checkout | python3 |

Missing tooling never fails the gate — the check reports **SKIP** with the
reason (e.g. "node/npm not installed"). A check only **FAIL**s when it ran and
something was actually wrong.

**Manifest nuance:** entries whose files are missing from the checkout are
counted, not failed — asset originals are intentionally gitignored and
re-fetched by `tools/fetch-assets.py`. A failure means a file that *is*
present does not match its recorded SHA-256.

## Run it locally

```bash
bash tools/ci-gate.sh                 # full gate
bash tools/ci-gate.sh --refresh-dry-run   # scheduled-refresh check only
```

`--refresh-dry-run` is the lightweight mode for cron/scheduled jobs: it only
verifies the world-data pipeline entry point (`python -m worlddata --help`
and the `run` subcommand) exists and starts. It does not run the pipeline.

## Interpreting output

```
[PASS] world-data pytest
       via /home/hatch/workspace/.venvs/worlddata/bin/python :: 85 passed, 9 skipped in 3.2s
[SKIP] client vitest
       node/npm not installed
[FAIL] manifest integrity (SHA-256)
       hash mismatch detected
       BAD-HASH assets/processed/demo/foo.glb

ci-gate :: 1 passed, 1 failed, 1 skipped
ci-gate :: FAILED checks: manifest integrity (SHA-256)
```

Exit code is `0` when nothing failed, `1` otherwise. Failing output is
trimmed to the last 25 lines per check — re-run the underlying command
directly for the full log.

## One-liners for the crew

```bash
# gate the branch I'm about to push
bash tools/ci-gate.sh

# gate a different checkout without cd-ing
REPO_ROOT=~/my-checkout bash ~/my-checkout/tools/ci-gate.sh

# just the world-data side
WORLD_DATA_PYTHON=$(which python3) bash tools/ci-gate.sh

# what would the scheduled world-data refresh hit?
bash tools/ci-gate.sh --refresh-dry-run
```

## Design notes

- No `set -e`: each check is wrapped so one failure can never abort the run.
- The GitHub workflow installs exactly what the script needs (python 3.11,
  world-data `[dev,parquet]` extras, node 20, `npm ci`) and then runs the
  unmodified script — CI and local share one code path.
