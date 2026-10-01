"""Voice-line coverage tracking.

Answers: which (notable, topic) pairs have a voiced line, and which fall
back to generic? The registry (``registry.json``) lists the notables the
game needs lines for and the topics each one must cover. Coverage is the
fraction of pairs with at least one real line.

``--check baseline.json`` fails (exit 1) when coverage drops below the
recorded baseline, so CI catches a regression. Coverage may stay flat or
rise; it may never silently fall.

Registry format:
  {"notables": [{"id": "gruff-brick", "class": "infantry",
                 "topics": ["greeting", "combat", "victory"]}, ...]}
"""

from __future__ import annotations

import argparse
import json
import re
import sys


def _norm(s: str) -> str:
    return re.sub(r"[-_\s]+", " ", (s or "")).strip().lower()

def compute_coverage(manifest: dict, registry: dict) -> dict:
    # (character/class/id lower, topic) -> True when a non-generic line covers it.
    covered: set[tuple[str, str]] = set()
    for sc in manifest.get("lines", []):
        names = {_norm(sc.get("character", "")), _norm(sc.get("id", "")),
                 _norm(sc.get("class", ""))}
        for ln in sc.get("lines", []):
            tags = {_norm(t) for t in ln.get("context_tags", [])} - {"generic"}
            for name in names:
                for tag in tags:
                    covered.add((name, tag))

    total = 0
    hit = 0
    missing: list[dict] = []
    for notable in registry.get("notables", []):
        nid = _norm(notable["id"])
        for topic in notable.get("topics", []):
            total += 1
            if (nid, _norm(topic)) in covered:
                hit += 1
            else:
                missing.append({"notable": notable["id"], "topic": topic})
    pct = (hit / total * 100.0) if total else 100.0
    return {
        "total_pairs": total,
        "covered_pairs": hit,
        "coverage_pct": round(pct, 1),
        "missing": missing,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Report voice-line coverage.")
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--registry", required=True)
    ap.add_argument("--check", default=None,
                    help="baseline JSON; exit 1 if coverage regresses")
    ap.add_argument("--write-baseline", default=None,
                    help="write current coverage as the new baseline")
    args = ap.parse_args(argv)

    with open(args.manifest, encoding="utf-8") as fh:
        manifest = json.load(fh)
    with open(args.registry, encoding="utf-8") as fh:
        registry = json.load(fh)
    report = compute_coverage(manifest, registry)
    print(f"coverage: {report['covered_pairs']}/{report['total_pairs']} "
          f"({report['coverage_pct']}%)")
    for m in report["missing"][:20]:
        print(f"  missing: {m['notable']} / {m['topic']}")
    if len(report["missing"]) > 20:
        print(f"  ... and {len(report['missing']) - 20} more")

    if args.write_baseline:
        with open(args.write_baseline, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2)
            fh.write("\n")
        print(f"baseline written to {args.write_baseline}")

    if args.check:
        with open(args.check, encoding="utf-8") as fh:
            baseline = json.load(fh)
        if report["coverage_pct"] < baseline.get("coverage_pct", 0):
            print(f"REGRESSION: {report['coverage_pct']}% < "
                  f"baseline {baseline.get('coverage_pct')}%",
                  file=sys.stderr)
            return 1
        print("no regression vs baseline")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

