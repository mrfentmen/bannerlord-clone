"""Blender step: the class texture budget from ASSETS.md section 5.1 and the step 6 colour grade.

Run by tools/build-assets.mjs as:
    blender --background --factory-startup --python tools/blender/textures.py -- <spec.json>

The spec lists each source map and the target resolution and grade for it. Downscaling and grading
happen here because Blender has a working image pipeline on this machine, and doing it in one
place is what makes step 6 ("apply the shared colour grade so every asset sits in the same light")
an actual operation rather than a note in a document.
"""

import json
import sys

import bpy


def log(*a):
    print(" ".join(str(x) for x in a), flush=True)


def grade(img, g):
    """Saturation, gamma, black lift and a warm tint, applied to base colour only.

    Gamma first so the curve lands where intended, then saturation in linear-ish space, then the
    tint. This is the neutral placeholder grade described in config/crowd.json; ART_AND_AUDIO.md
    section 2 has not chosen a style yet.
    """
    px = list(img.pixels)
    sat, lift, gam = g["saturation"], g["lift"], g["gamma"]
    tr, tg, tb = g["tint"]
    for i in range(0, len(px), 4):
        for c, t in ((0, tr), (1, tg), (2, tb)):
            v = px[i + c]
            v = max(0.0, min(1.0, v)) ** (1.0 / gam)
            px[i + c] = v * t
        lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
        for c in range(3):
            px[i + c] = lum + (px[i + c] - lum) * sat + lift
        px[i + 3] = 1.0
    img.pixels = px


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1 :]
    spec = json.loads(open(argv[0]).read())
    out_dir = argv[1]
    results = []

    for job in spec["jobs"]:
        src = job["src"]
        bpy.ops.wm.read_factory_settings(use_empty=True)
        img = bpy.data.images.load(src)
        before = tuple(img.size)
        if job.get("grade"):
            grade(img, spec["grade"])
        target = int(job["size"])
        if max(before) > target:
            k = target / max(before)
            img.scale(max(1, round(before[0] * k)), max(1, round(before[1] * k)))
        elif job.get("upscale_to"):
            img.scale(int(job["upscale_to"]), int(job["upscale_to"]))
        img.file_format = "PNG"
        dst = f"{out_dir}/{job['out']}"
        img.filepath_raw = dst
        img.save()
        log(f"TEXTURE {job['out']} {before[0]}x{before[1]} -> {tuple(img.size)} "
            f"graded={'yes' if job.get('grade') else 'no'}")
        results.append({"out": job["out"], "source_size": list(before),
                        "final_size": list(img.size), "graded": bool(job.get("grade"))})

    print("TEXTURES_JSON " + json.dumps(results), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
