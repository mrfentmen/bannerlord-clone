#!/usr/bin/env bash
# ci-gate.sh - the Bannerlord-clone pre-review gate.
#
# Runs every check that can run on a plain Linux box and reports
# PASS / FAIL / SKIP per check. Designed for two homes:
#   1. local:  bash tools/ci-gate.sh          (from the repo root)
#   2. CI:     .github/workflows/ci-gate.yml  (runs this same script)
#
# Modes:
#   bash tools/ci-gate.sh                 full gate (default)
#   bash tools/ci-gate.sh --refresh-dry-run
#       scheduled-refresh check: verifies the world-data export pipeline
#       entry point exists and starts (does NOT run the full pipeline).
#
# Environment overrides (mainly for testing):
#   REPO_ROOT            repo checkout to gate (default: parent of tools/)
#   WORLD_DATA_PYTHON    python interpreter for world-data checks
#                        (default: first of the local venv, then python3)
#
# Exit code: 0 if no check failed, 1 otherwise. Individual checks never
# abort the run: failures are collected and reported at the end.
set -u
set -o pipefail
# NOTE: no `set -e` on purpose - every check is independent.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

MODE="full"
if [[ "${1:-}" == "--refresh-dry-run" ]]; then
    MODE="refresh"
elif [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    sed -n '2,20p' "${BASH_SOURCE[0]}"
    exit 0
fi

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
FAILED_CHECKS=()

report() { # report <PASS|FAIL|SKIP> <check-name> [detail...]
    local status="$1"; local name="$2"; shift 2
    case "$status" in
        PASS) PASS_COUNT=$((PASS_COUNT + 1)) ;;
        FAIL) FAIL_COUNT=$((FAIL_COUNT + 1)); FAILED_CHECKS+=("$name") ;;
        SKIP) SKIP_COUNT=$((SKIP_COUNT + 1)) ;;
    esac
    printf '[%s] %s\n' "$status" "$name"
    if [[ $# -gt 0 ]]; then
        printf '       %s\n' "$*"
    fi
}

# ---------------------------------------------------------------- python

find_worlddata_python() {
    # Prefer the local dev venv, then an explicit override, then python3 -
    # but only accept an interpreter that can actually run pytest.
    local candidates=()
    if [[ -n "${WORLD_DATA_PYTHON:-}" ]]; then
        candidates+=("$WORLD_DATA_PYTHON")
    fi
    candidates+=("$HOME/workspace/.venvs/worlddata/bin/python" "python3")
    local py
    for py in "${candidates[@]}"; do
        if [[ -x "$py" ]] && "$py" -c "import pytest" >/dev/null 2>&1; then
            printf '%s' "$py"
            return 0
        fi
    done
    return 1
}

check_worlddata_pytest() {
    local name="world-data pytest"
    if [[ ! -d "$REPO_ROOT/services/world-data" ]]; then
        report SKIP "$name" "services/world-data not in checkout"
        return
    fi
    local py
    if ! py="$(find_worlddata_python)"; then
        report SKIP "$name" "no python with pytest (tried WORLD_DATA_PYTHON, ~/workspace/.venvs/worlddata, python3)"
        return
    fi
    local out rc
    out="$(cd "$REPO_ROOT/services/world-data" && "$py" -m pytest -q 2>&1)"
    rc=$?
    if [[ $rc -eq 0 ]]; then
        local summary
        summary="$(printf '%s\n' "$out" | tail -1)"
        report PASS "$name" "via $py :: $summary"
    else
        report FAIL "$name" "via $py, exit $rc"
        printf '%s\n' "$out" | tail -25 | sed 's/^/       /'
    fi
}

check_worlddata_refresh_entry() {
    local name="world-data refresh entry point"
    if [[ ! -d "$REPO_ROOT/services/world-data" ]]; then
        report SKIP "$name" "services/world-data not in checkout"
        return
    fi
    local py
    if ! py="$(find_worlddata_python)"; then
        report SKIP "$name" "no usable python interpreter"
        return
    fi
    local out rc
    out="$(cd "$REPO_ROOT/services/world-data" && "$py" -m worlddata --help 2>&1)"
    rc=$?
    if [[ $rc -ne 0 ]]; then
        report FAIL "$name" "python -m worlddata --help exited $rc"
        printf '%s\n' "$out" | tail -10 | sed 's/^/       /'
        return
    fi
    local out2 rc2
    out2="$(cd "$REPO_ROOT/services/world-data" && "$py" -m worlddata run --help 2>&1)"
    rc2=$?
    if [[ $rc2 -ne 0 ]]; then
        report FAIL "$name" "'run' subcommand not available (exit $rc2)"
        printf '%s\n' "$out2" | tail -10 | sed 's/^/       /'
        return
    fi
    report PASS "$name" "cli imports; subcommands: $(printf '%s' "$out" | grep -o 'run\|fetch\|schema' | sort -u | tr '\n' ' ')"
}

# ---------------------------------------------------------------- client

client_tooling_ok() {
    command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1
}

check_client() { # check_client <name> <npm-script-args...>
    local name="$1"; shift
    if [[ ! -d "$REPO_ROOT/clients/campaign" ]]; then
        report SKIP "$name" "clients/campaign not in checkout"
        return
    fi
    if ! client_tooling_ok; then
        report SKIP "$name" "node/npm not installed"
        return
    fi
    if [[ ! -d "$REPO_ROOT/clients/campaign/node_modules" ]]; then
        report SKIP "$name" "node_modules missing - run 'npm ci' in clients/campaign first"
        return
    fi
    local out rc
    out="$(cd "$REPO_ROOT/clients/campaign" && npm "$@" 2>&1)"
    rc=$?
    if [[ $rc -eq 0 ]]; then
        report PASS "$name"
    else
        report FAIL "$name" "npm $* exited $rc"
        printf '%s\n' "$out" | tail -25 | sed 's/^/       /'
    fi
}

# ---------------------------------------------------------------- manifests

check_manifests() {
    local name="manifest integrity (SHA-256)"
    local manifests=()
    local m
    for m in "$REPO_ROOT/assets/manifest.json" \
             "$REPO_ROOT/assets/audio-manifest.json" \
             "$REPO_ROOT"/assets/*-manifest.json; do
        [[ -f "$m" ]] || continue
        manifests+=("$m")
    done
    # de-duplicate (the globs can overlap)
    local uniq=()
    for m in "${manifests[@]}"; do
        local seen=0 u
        for u in "${uniq[@]}"; do [[ "$u" == "$m" ]] && seen=1 && break; done
        [[ $seen -eq 0 ]] && uniq+=("$m")
    done
    manifests=("${uniq[@]}")
    if [[ ${#manifests[@]} -eq 0 ]]; then
        report SKIP "$name" "no manifest json found under assets/"
        return
    fi
    if ! command -v python3 >/dev/null 2>&1; then
        report SKIP "$name" "python3 not available for hash verification"
        return
    fi
    local py_out rc
    py_out="$(MANIFESTS="$(printf '%s\n' "${manifests[@]}")" \
        REPO_ROOT="$REPO_ROOT" python3 - <<'EOF' 2>&1
import hashlib, json, os, sys
repo = os.environ["REPO_ROOT"]
bad, missing, checked = [], [], 0
for mpath in os.environ["MANIFESTS"].splitlines():
    try:
        man = json.load(open(mpath))
    except Exception as e:
        print(f"UNREADABLE {mpath}: {e}")
        continue
    entries = man.get("assets", [])
    for e in entries:
        rel, want = e.get("path"), e.get("sha256")
        if not rel or not want:
            continue
        full = os.path.join(repo, rel)
        if not os.path.isfile(full):
            missing.append(rel)  # originals are gitignored by design; not a failure
            continue
        h = hashlib.sha256()
        with open(full, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        checked += 1
        if h.hexdigest() != want.lower():
            bad.append(rel)
print(f"checked={checked} missing={len(missing)} bad={len(bad)}")
for rel in bad:
    print(f"BAD-HASH {rel}")
sys.exit(1 if bad else 0)
EOF
)"
    rc=$?
    if [[ $rc -eq 0 ]]; then
        local summary
        summary="$(printf '%s\n' "$py_out" | grep '^checked=' | tail -1)"
        report PASS "$name" "${summary:-ok} across ${#manifests[@]} manifest(s); missing files are gitignored originals, not failures"
    else
        report FAIL "$name" "hash mismatch detected"
        printf '%s\n' "$py_out" | grep '^BAD-HASH' | sed 's/^/       /'
    fi
}

# ---------------------------------------------------------------- main

printf 'ci-gate :: repo=%s mode=%s\n' "$REPO_ROOT" "$MODE"

if [[ "$MODE" == "refresh" ]]; then
    check_worlddata_refresh_entry
else
    check_worlddata_pytest
    check_client "client vitest" test
    check_client "client tsc --noEmit" run typecheck
    check_client "client vite build" run build
    check_manifests
fi

printf '\nci-gate :: %d passed, %d failed, %d skipped\n' \
    "$PASS_COUNT" "$FAIL_COUNT" "$SKIP_COUNT"
if [[ $FAIL_COUNT -gt 0 ]]; then
    printf 'ci-gate :: FAILED checks: %s\n' "${FAILED_CHECKS[*]}"
    exit 1
fi
printf 'ci-gate :: ALL GREEN (no failures)\n'
exit 0
