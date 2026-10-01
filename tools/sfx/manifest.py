#!/usr/bin/env python3
"""Task 119: generate content/audio/sfx/audio-manifest.json.

One entry per WAV cue with: file, duration, format, loop flag, category,
trigger, license, source, generator, synthesis parameters, LUFS, sha256.

Existing cues (packs 1-3) get their trigger/category from the SFX.md /
SFX2.md / SFX3.md doc tables and point at gen_sfx.py as their generator.
New pack-4 cues get full synthesis parameters from synth.CUE_SPECS.

Also exposes loop_names() for check_loops.py.
"""
import glob
import hashlib
import json
import os
import re
import wave

SFX_DIR = os.path.expanduser("~/workspace/bannerlord/content/audio/sfx")
MANIFEST_PATH = os.path.join(SFX_DIR, "audio-manifest.json")
DOCS = ["SFX.md", "SFX2.md", "SFX3.md", "SFX4.md"]

LICENSE = "CC0"
SOURCE = "original, procedurally generated on project VM (numpy synthesis)"
AUTHOR = "Milo audio synth"


def _parse_docs():
    """Parse doc tables -> {filename: {trigger, category, loop}}."""
    info = {}
    for doc in DOCS:
        path = os.path.join(SFX_DIR, doc)
        if not os.path.exists(path):
            continue
        category = "uncategorized"
        with open(path) as f:
            for line in f:
                m = re.match(r"^#{1,3}\s+(.*)", line)
                if m:
                    category = _categorize(m.group(1))
                    continue
                cells = [c.strip() for c in line.strip().strip("|").split("|")]
                if len(cells) >= 2 and cells[0].endswith(".wav"):
                    fname = cells[0]
                    text = " ".join(cells[1:])
                    info[fname] = {
                        "trigger": text,
                        "category": category,
                        "loop": ("loop" in fname.lower()
                                 or "loop" in text.lower()),
                    }
    return info


def _categorize(header):
    h = header.lower()
    for key, cat in [
        ("weapon", "weapons"), ("gun", "weapons"), ("tier", "weapons"),
        ("movement", "movement"), ("footstep", "movement"),
        ("ui", "ui"), ("event", "events"), ("horn", "events"),
        ("ambien", "ambience"), ("bed", "ambience"),
        ("vehicle", "vehicles"), ("engine", "vehicles"),
        ("siege", "siege"), ("ram ", "siege"), ("breach", "siege"),
        ("weather", "weather"), ("thunder", "weather"), ("wind", "weather"),
        ("animal", "animals"), ("horse", "animals"), ("dog", "animals"),
        ("crow", "animals"),
        ("tavern", "tavern"), ("bar", "tavern"), ("dice", "tavern"),
        ("campaign", "campaign"), ("march", "campaign"), ("convoy", "campaign"),
        ("music", "music"), ("piano", "music"), ("drum", "music"),
        ("battle layer", "battle"), ("crowd", "crowd"),
        ("melee", "melee"), ("shield", "melee"),
        ("stinger", "stingers"), ("fanfare", "stingers"), ("chime", "stingers"),
    ]:
        if key in h:
            return cat
    return "uncategorized"


def _wav_info(path):
    with wave.open(path, "rb") as w:
        n = w.getnframes()
        sr = w.getframerate()
        ch = w.getnchannels()
        sw = w.getsampwidth()
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return {"duration_s": round(n / sr, 3), "sample_rate": sr,
            "channels": ch, "bits": sw * 8, "sha256": h.hexdigest()}


def _lufs_of(path):
    import numpy as np
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from loudness import integrated_lufs
    with wave.open(path, "rb") as w:
        raw = w.readframes(w.getnframes())
    x = np.frombuffer(raw, dtype=np.int16).astype(float) / 32768.0
    l = integrated_lufs(x)
    return None if l == float("-inf") else round(l, 2)


def build_manifest():
    from synth import CUE_SPECS
    doc_info = _parse_docs()
    new_specs = {s["name"] + ".wav": s for s in CUE_SPECS}
    entries = []
    for path in sorted(glob.glob(os.path.join(SFX_DIR, "*.wav"))):
        fname = os.path.basename(path)
        info = _wav_info(path)
        d = doc_info.get(fname, {})
        if fname in new_specs:
            spec = new_specs[fname]
            generator = "tools/sfx/synth.py"
            synthesis = {"function": spec["fn"], **spec["params"]}
            category = spec.get("category", d.get("category", "uncategorized"))
            trigger = spec.get("trigger", d.get("trigger", ""))
            loop = spec.get("loop", d.get("loop", False))
        else:
            generator = "content/audio/sfx/gen_sfx.py"
            synthesis = {"note": "parameters live in gen_sfx.py; "
                                 "see SFX.md / SFX2.md / SFX3.md"}
            category = d.get("category", "uncategorized")
            trigger = d.get("trigger", "")
            loop = d.get("loop", "loop" in fname.lower())
        entries.append({
            "name": fname[:-4],
            "file": f"content/audio/sfx/{fname}",
            **info,
            "loop": bool(loop),
            "category": category,
            "trigger": trigger,
            "license": LICENSE,
            "source": SOURCE,
            "author": AUTHOR,
            "generator": generator,
            "synthesis": synthesis,
            "lufs": _lufs_of(path),
        })
    return {"version": 1,
            "description": "Procedural SFX catalog for the Bannerlord-style game",
            "cues": entries}


def loop_names():
    """Filenames (not paths) of all cues meant to loop."""
    manifest = build_manifest_light()
    return [c["file"].split("/")[-1] for c in manifest["cues"] if c["loop"]]


def build_manifest_light():
    """Manifest without LUFS/sha256 (fast path for check_loops)."""
    from synth import CUE_SPECS
    doc_info = _parse_docs()
    new_specs = {s["name"] + ".wav": s for s in CUE_SPECS}
    entries = []
    for path in sorted(glob.glob(os.path.join(SFX_DIR, "*.wav"))):
        fname = os.path.basename(path)
        d = doc_info.get(fname, {})
        if fname in new_specs:
            spec = new_specs[fname]
            loop = spec.get("loop", d.get("loop", False))
        else:
            loop = d.get("loop", "loop" in fname.lower())
        entries.append({"file": f"content/audio/sfx/{fname}", "loop": bool(loop)})
    return {"cues": entries}


def main():
    manifest = build_manifest()
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    loops = sum(1 for c in manifest["cues"] if c["loop"])
    print(f"wrote {MANIFEST_PATH}: {len(manifest['cues'])} cues, {loops} loops")


if __name__ == "__main__":
    main()
