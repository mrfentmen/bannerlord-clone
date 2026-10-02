"""Catalog the repo's existing voice recordings into sidecars + manifest.

For every *.mp3 in content/audio/voices with a matching .txt transcript:
tries the strict silence-split; files that pass get per-line sidecars,
the rest get one batch sidecar. Metadata-only: no audio is rewritten,
the sidecars describe the files as they are (measured loudness).

Per-class default emotion/tags come from a human read of the transcripts
(see DEFAULTS). They are file-level defaults; curate per-line values in
the sidecar JSONs afterwards.

Run from the repo root:
  python3 tools/pipelines/voice/catalog_repo.py
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from ingest import build_manifest, ingest_file  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
VOICES = os.path.join(ROOT, "content", "audio", "voices")

# prefix -> (emotion, [context tags]); from reading the transcripts.
DEFAULTS = {
    "infantry": ("urgent", ["combat", "contact"]),
    "scout": ("urgent", ["combat", "contact"]),
    "gunner": ("angry", ["combat"]),
    "troop": ("urgent", ["combat"]),
    "medic": ("urgent", ["combat", "casualty"]),
    "captain": ("stern", ["combat", "order"]),
    "siege-attacker": ("angry", ["combat"]),
    "siege-defender": ("determined", ["combat"]),
    "companion": ("solemn", ["idle"]),
    "rebel": ("angry", ["threat", "idle"]),
    "execution": ("solemn", ["threat"]),
    "leader": ("stern", ["quest_offer"]),
    "persuade": ("warm", ["bargain", "quest_offer"]),
    "barter": ("warm", ["town", "bargain"]),
    "merchant": ("warm", ["town", "bargain"]),
    "shopkeeper": ("warm", ["town", "bargain"]),
    "bartender": ("warm", ["tavern", "greeting"]),
    "townsman": ("warm", ["town", "greeting"]),
    "townswoman": ("warm", ["town", "greeting"]),
    "announcer": ("neutral", ["radio"]),
    # ethnicity rally callouts
    "african": ("determined", ["rally"]),
    "chinese": ("determined", ["rally"]),
    "german": ("determined", ["rally"]),
    "irish": ("determined", ["rally"]),
    "italian": ("determined", ["rally"]),
    "jamaican": ("determined", ["rally"]),
    "korean": ("determined", ["rally"]),
    "mexican": ("determined", ["rally"]),
    "puertorican": ("determined", ["rally"]),
    "russian": ("determined", ["rally"]),
}
FALLBACK = ("neutral", ["generic"])


def load_voice_table() -> dict:
    """class -> (voice_id, character) from VOICES.md."""
    table = {}
    md_path = os.path.join(VOICES, "VOICES.md")
    with open(md_path, encoding="utf-8") as fh:
        for line in fh:
            m = re.match(r"\|\s*([a-z-]+)\s*\|\s*(avocado_v2:\S+)\s*\|\s*(.+?)\s*\|",
                         line)
            if m:
                cls, vid, desc = m.groups()
                character = desc.split(",")[0].strip()
                table[cls] = (vid, character)
    return table


def prefix_of(filename: str) -> str:
    base = os.path.splitext(filename)[0]
    return re.sub(r"-\d+b?$", "", base)


def main() -> int:
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-existing", action="store_true",
                    help="skip files that already have a sidecar")
    args = ap.parse_args()
    table = load_voice_table()
    batched = 0
    skipped = 0
    for fname in sorted(os.listdir(VOICES)):
        if not fname.endswith(".mp3"):
            continue
        base = os.path.splitext(fname)[0]
        src = os.path.join(VOICES, fname)
        txt = os.path.join(VOICES, base + ".txt")
        transcript = txt if os.path.isfile(txt) else None
        if transcript is None:
            print(f"skip (no transcript): {fname}")
            skipped += 1
            continue
        if args.skip_existing and os.path.isfile(
                os.path.join(VOICES, base + ".voice.json")):
            batched += 1
            continue
        prefix = prefix_of(fname)
        voice_id, character = table.get(prefix, ("unknown",
                                                 prefix.replace("-", " ").title()))
        emotion, tags = DEFAULTS.get(prefix, FALLBACK)
        ingest_file(src, VOICES, character, prefix, voice_id,
                    emotion, tags, transcript=transcript,
                    line_id_prefix=base, batch=True, metadata_only=True)
        batched += 1
    manifest = build_manifest(VOICES, os.path.join(VOICES, "manifest.json"))
    print(f"\n{batched} batch sidecars, {skipped} skipped; "
          f"manifest: {len(manifest['lines'])} sidecars")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
