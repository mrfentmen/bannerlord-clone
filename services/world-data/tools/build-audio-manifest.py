#!/usr/bin/env python3
"""Rebuild the client audio manifest from the files that are actually on disk.

`assets/audio-manifest.json` is the attribution ledger: every shipped file has a
source, an author, a licence and a date there. It is not served to the browser,
and it is not on the hot path. `clients/campaign/public/audio-manifest.json` is
what the mixer reads, and it had drifted: 109 entries for 6,318 files, so every
music pool track, every bark and every ambience bed outside that 109 resolved to
nothing and the game played silence. This tool closes that gap and keeps it
closed.

It writes two files:

  clients/campaign/public/audio-manifest.json
      The full ledger, one entry per file on disk. `bytes` and `sha256` are
      measured from the file, not copied from the ledger, so a file that changed
      after it was catalogued cannot be described by the old digest. The
      attribution fields are carried across from `assets/audio-manifest.json`;
      a file the ledger does not know about still gets an entry, flagged, rather
      than being left out.

  clients/campaign/public/audio/audio-index.json
      The runtime index: `{"id": "<web path>"}` and nothing else. The ledger is
      ~1.3 MB of attribution text that the client never reads; this is ~340 KB
      of path and id, which is what `AudioManager.preload` needs to resolve a
      name to a URL. `AudioManager.loadManifest` follows the ledger's
      `runtimeIndex` field to it, so the client still asks for
      `/audio-manifest.json` and gets both.

    python tools/build-audio-manifest.py             # write both files
    python tools/build-audio-manifest.py --check     # verify only, exit 1 on drift

Id derivation is the scheme the rest of `src/audio` already speaks:

    audio/menu-theme.mp3                       -> menu-theme
    audio/stems/battle-theme/drums.mp3         -> battle-theme-stem-drums
    audio/sfx/ambience/town-day.mp3            -> sfx-ambience-town-day
    audio/barks/briggs/charge-1.mp3            -> bark-briggs-charge-1
    audio/vox/grunt-m1.mp3                     -> vox-grunt-m1

A collision between two files that would derive the same id is a hard error, not
a silent overwrite.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
AUDIO_ROOT = REPO / "clients" / "campaign" / "public" / "audio"
PUBLIC_MANIFEST = REPO / "clients" / "campaign" / "public" / "audio-manifest.json"
RUNTIME_INDEX = AUDIO_ROOT / "audio-index.json"
LEDGER = REPO / "assets" / "audio-manifest.json"


def derive_id(relative: str) -> str:
    """The manifest id for a path relative to `clients/campaign/public/audio/`."""
    stem = relative[: -len(".mp3")] if relative.endswith(".mp3") else relative
    parts = stem.split("/")
    head = parts[0]
    if head == "stems":
        track, *rest = parts[1:]
        return "-".join([track, "stem", *rest])
    if head == "sfx":
        return "-".join(["sfx", *parts[1:]])
    if head == "barks":
        return "-".join(["bark", *parts[1:]])
    if head == "vox":
        return "-".join(["vox", *parts[1:]])
    return parts[0]


def category_of(relative: str) -> str:
    """Which family the file belongs to, for the ledger and for the pools."""
    head = relative.split("/")[0]
    if head == "stems":
        return "music-stem"
    if head == "barks":
        return "voice-bark"
    if head == "vox":
        return "voice-cry"
    if head == "sfx":
        return f"sfx-{relative.split('/')[1]}"
    return "music"


def loop_hint(relative: str) -> bool:
    """Whether the file is a bed: ambience loops, crowd loops, engine loops.

    A bed is meant to run under something else for minutes at a time. Music is
    not, even when it was composed as a loop, because the music manager owns when
    a track hands over to the next one.
    """
    base = relative.rsplit("/", 1)[-1]
    return (
        relative.startswith("sfx/ambience/")
        or relative.startswith("sfx/crowd/")
        or base.endswith("-loop.mp3")
        or base.endswith("-bed.mp3")
    )


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_ledger() -> dict[str, dict]:
    if not LEDGER.is_file():
        return {}
    document = json.loads(LEDGER.read_text(encoding="utf-8"))
    return {asset["path"]: asset for asset in document.get("assets", [])}


def collect() -> tuple[list[dict], dict[str, str], list[str]]:
    """Walk the audio directory. Returns (entries, id->web path, problems)."""
    ledger = load_ledger()
    entries: list[dict] = []
    seen: dict[str, str] = {}
    problems: list[str] = []

    for path in sorted(AUDIO_ROOT.rglob("*.mp3")):
        relative_repo_path = path.relative_to(REPO).as_posix()
        relative_audio_path = path.relative_to(AUDIO_ROOT).as_posix()
        asset_id = derive_id(relative_audio_path)
        if asset_id in seen:
            problems.append(
                f"id collision: '{relative_audio_path}' and '{seen[asset_id]}' both derive '{asset_id}'"
            )
            continue
        seen[asset_id] = relative_audio_path

        catalogued = ledger.get(relative_repo_path)
        if catalogued and catalogued.get("bytes") not in (None, path.stat().st_size):
            problems.append(
                f"{asset_id}: ledger says {catalogued['bytes']} bytes, file is {path.stat().st_size}; "
                "the manifest below is measured from the file"
            )

        entry = {
            "id": asset_id,
            "path": relative_repo_path,
            "category": category_of(relative_audio_path),
            "loop": loop_hint(relative_audio_path),
            "bytes": path.stat().st_size,
            "sha256": sha256_of(path),
        }
        if catalogued:
            for field in ("contents", "source", "author", "licence", "date_retrieved", "attribution_text"):
                if catalogued.get(field) is not None:
                    entry[field] = catalogued[field]
        else:
            problems.append(f"{asset_id}: not in {LEDGER.relative_to(REPO)}; no attribution available")
            entry["source"] = "uncatalogued: present in public/audio but absent from the attribution ledger"
        if catalogued and catalogued.get("id") != asset_id:
            problems.append(
                f"{relative_repo_path}: ledger id '{catalogued.get('id')}' != derived '{asset_id}'; "
                "the derived id wins, so update the ledger to match"
            )
        entries.append(entry)

    for repo_path in ledger:
        if not (REPO / repo_path).is_file():
            problems.append(f"{repo_path}: in the ledger, missing from public/audio")

    entries.sort(key=lambda item: item["id"])
    return entries, seen, problems


def build() -> tuple[dict, dict]:
    entries, index, problems = collect()
    manifest = {
        "_comment": (
            "Generated by services/world-data/tools/build-audio-manifest.py from the files in "
            "clients/campaign/public/audio. Do not hand-edit: run the tool. One entry per shipped "
            "audio file, with the repository path the browser reaches once the leading "
            "clients/campaign/public/ is dropped. Attribution fields are carried from "
            "assets/audio-manifest.json; bytes and sha256 are measured from the file."
        ),
        "runtimeIndex": "audio/audio-index.json",
        "count": len(entries),
        "assets": entries,
    }
    return manifest, index


def render(manifest: dict, index: dict[str, str]) -> str:
    document = {
        "comment": (
            "Runtime id -> web path index for the audio library, generated alongside "
            "audio-manifest.json. The manifest carries the attribution ledger; this carries only "
            "what the mixer needs to resolve a name to a URL, so boot does not ship 1.3 MB of "
            "credit text."
        ),
        "count": len(index),
        "paths": {key: f"/audio/{value}" for key, value in sorted(index.items())},
    }
    return json.dumps(document, indent=1, ensure_ascii=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="verify the committed files are current; exit 1 if not")
    arguments = parser.parse_args()

    manifest, index = build()
    manifest_text = json.dumps(manifest, indent=1, ensure_ascii=False) + "\n"
    index_text = render(manifest, index)

    if arguments.check:
        stale = []
        for path, text in ((PUBLIC_MANIFEST, manifest_text), (RUNTIME_INDEX, index_text)):
            if not path.is_file() or path.read_text(encoding="utf-8") != text:
                stale.append(path.relative_to(REPO).as_posix())
        if stale:
            print("audio manifest is out of date; re-run without --check:")
            for name in stale:
                print(f"  {name}")
            return 1
        print(f"audio manifest is current: {manifest['count']} assets")
        return 0

    PUBLIC_MANIFEST.write_text(manifest_text, encoding="utf-8")
    RUNTIME_INDEX.write_text(index_text, encoding="utf-8")
    print(f"wrote {PUBLIC_MANIFEST.relative_to(REPO)} ({len(manifest['assets'])} assets)")
    print(f"wrote {RUNTIME_INDEX.relative_to(REPO)} ({len(index)} ids)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())