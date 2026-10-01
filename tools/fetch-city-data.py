#!/usr/bin/env python3
"""
Fetch city data (building footprints + major streets) for the bannerlord-clone
world-data pipeline.

Queries the Overpass API (OpenStreetMap) for a bounding box and writes a compact
JSON file the campaign client can render as an urban map: real building polygons
and the major street grid.

Data is (c) OpenStreetMap contributors, made available under the Open Database
License (ODbL). The license string is recorded in every output file.

Usage:
    python tools/fetch-city-data.py --bbox "minlon,minlat,maxlon,maxlat" --city NAME [--out DIR]

Example (Lower Manhattan, ~3k buildings):
    python tools/fetch-city-data.py --bbox "-74.0200,40.7000,-73.9900,40.7200" --city manhattan

Output: <out>/<city>.json with schema:
    {
      "city": "manhattan",
      "bbox": {"minlon": ..., "minlat": ..., "maxlon": ..., "maxlat": ...},
      "license": "(c) OpenStreetMap contributors (ODbL) ...",
      "retrieved": "2026-10-01T00:00:00Z",
      "building_count": 3254,
      "street_count": 187,
      "truncated": false,
      "buildings": [
        {"id": 38868195, "coords": [[lon, lat], ...], "levels": "5", "type": "apartments"}
      ],
      "streets": [
        {"id": 12345, "coords": [[lon, lat], ...], "name": "Broadway", "kind": "primary"}
      ]
    }

Notes:
- One Overpass query per run (polite usage): 60s server timeout, descriptive
  User-Agent. Keep bboxes small (a few city blocks); a bbox that returns more
  than MAX_BUILDINGS is truncated with a loud warning.
- HTTP goes through curl via subprocess. Python urllib gets its streams cut
  mid-download by this sandbox's egress proxy (IncompleteRead); curl handles
  it correctly. Never switch this back to urllib.
- The raw Overpass response is JSON-parsed and validated before anything is
  written; a corrupt download never produces a half-written output file.
"""
import argparse
import datetime
import json
import subprocess
import sys
import tempfile
from pathlib import Path

OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter",
]
USER_AGENT = "bannerlord-clone-city-fetch/1.0"
SERVER_TIMEOUT = 60  # seconds; also the [timeout:] in the query
MAX_BUILDINGS = 10_000  # hard cap per call; bigger bboxes must be split

LICENSE = (
    "(c) OpenStreetMap contributors. Data from www.openstreetmap.org, "
    "made available under the Open Database License (ODbL)."
)


def build_query(minlat: float, minlon: float, maxlat: float, maxlon: float) -> str:
    """One Overpass QL query: building footprints + major streets in the bbox.

    Overpass bbox order is (south, west, north, east).
    """
    return f"""[out:json][timeout:{SERVER_TIMEOUT}];
(
  way["building"]({minlat},{minlon},{maxlat},{maxlon});
  way["highway"~"^(primary|secondary|tertiary)$"]({minlat},{minlon},{maxlat},{maxlon});
);
out geom;
"""


def overpass_post(query: str) -> dict:
    """POST the query with curl; return the parsed JSON. Raises on failure.

    Tries each public Overpass mirror in order. Mirrors shed load and this
    sandbox's egress proxy sometimes cuts large transfers mid-stream, so a
    mirror that answers cleanly on this run wins.
    """
    errors: list[str] = []
    for mirror in OVERPASS_MIRRORS:
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        try:
            r = subprocess.run(
                ["curl", "-sS", "--fail", "--retry", "2", "--retry-all-errors",
                 "--retry-delay", "5", "--max-time", str(SERVER_TIMEOUT + 60),
                 "-A", USER_AGENT,
                 "--data-binary", "@-",
                 "-o", str(tmp_path),
                 mirror],
                input=query.encode("utf-8"),
                capture_output=True, timeout=SERVER_TIMEOUT + 90,
            )
            if r.returncode != 0:
                errors.append(f"{mirror}: {r.stderr.decode()[:150]}")
                continue
            raw = tmp_path.read_bytes()
        finally:
            tmp_path.unlink(missing_ok=True)
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            errors.append(f"{mirror}: invalid JSON ({len(raw)} bytes): {e}")
            continue
    raise RuntimeError("Overpass request failed on all mirrors: " + " | ".join(errors))


def extract(data: dict) -> tuple[list, list]:
    """Split Overpass elements into compact building and street records."""
    buildings: list = []
    streets: list = []
    for el in data.get("elements", []):
        if el.get("type") != "way" or "geometry" not in el:
            continue
        tags = el.get("tags", {})
        coords = [[p["lon"], p["lat"]] for p in el["geometry"]]
        if not coords:
            continue
        if "building" in tags:
            buildings.append({
                "id": el["id"],
                "coords": coords,
                "levels": tags.get("building:levels"),
                "type": tags.get("building", "yes"),
            })
        elif "highway" in tags:
            streets.append({
                "id": el["id"],
                "coords": coords,
                "name": tags.get("name"),
                "kind": tags["highway"],
            })
    return buildings, streets


def parse_bbox(text: str) -> tuple[float, float, float, float]:
    parts = [float(p) for p in text.split(",")]
    if len(parts) != 4:
        raise ValueError('bbox must be "minlon,minlat,maxlon,maxlat"')
    minlon, minlat, maxlon, maxlat = parts
    if not (minlon < maxlon and minlat < maxlat):
        raise ValueError("bbox must satisfy minlon<maxlon and minlat<maxlat")
    if not (-180 <= minlon <= 180 and -180 <= maxlon <= 180
            and -90 <= minlat <= 90 and -90 <= maxlat <= 90):
        raise ValueError("bbox coordinates out of range")
    return minlon, minlat, maxlon, maxlat


def main() -> int:
    ap = argparse.ArgumentParser(description="Fetch city building/street data from OpenStreetMap.")
    ap.add_argument("--bbox", required=True, help='"minlon,minlat,maxlon,maxlat"')
    ap.add_argument("--city", required=True, help="City slug used for the output filename")
    ap.add_argument("--out", default="services/world-data/exports/cities",
                    help="Output directory (default: services/world-data/exports/cities)")
    args = ap.parse_args()

    try:
        minlon, minlat, maxlon, maxlat = parse_bbox(args.bbox)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    query = build_query(minlat, minlon, maxlat, maxlon)
    print(f"Querying Overpass for {args.city} bbox {args.bbox} ...")
    try:
        data = overpass_post(query)
    except RuntimeError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    buildings, streets = extract(data)

    truncated = False
    if len(buildings) > MAX_BUILDINGS:
        truncated = True
        print(
            f"WARNING: bbox returned {len(buildings)} buildings, capped at "
            f"{MAX_BUILDINGS}. Split into smaller bboxes and re-run.",
            file=sys.stderr,
        )
        buildings = buildings[:MAX_BUILDINGS]

    output = {
        "city": args.city,
        "bbox": {"minlon": minlon, "minlat": minlat, "maxlon": maxlon, "maxlat": maxlat},
        "license": LICENSE,
        "retrieved": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "building_count": len(buildings),
        "street_count": len(streets),
        "truncated": truncated,
        "buildings": buildings,
        "streets": streets,
    }

    # Round-trip: never write an output file that does not parse.
    try:
        payload = json.dumps(output)
        json.loads(payload)
    except (ValueError, TypeError) as e:
        print(f"error: output failed JSON validation: {e}", file=sys.stderr)
        return 1

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / f"{args.city}.json"
    tmp = dest.with_suffix(".json.part")
    tmp.write_text(payload)
    tmp.replace(dest)

    print(f"Done: {len(buildings)} buildings, {len(streets)} streets -> {dest}"
          + (" (TRUNCATED)" if truncated else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
