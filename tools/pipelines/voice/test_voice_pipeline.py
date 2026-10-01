"""Tests for the voice pipeline: contract, ingest DSP, lookup, coverage.

All audio is synthesized in-memory; no fixtures, no network.
Run: python3 -m pytest test_voice_pipeline.py -q
"""

import json
import os
import re
import sys
import traceback
import tempfile
import wave

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contract import LineMeta, Sidecar, validate_file  # noqa: E402
from ingest import (  # noqa: E402
    SAMPLE_RATE,
    ingest_file,
    integrated_loudness,
    normalize_loudness,
    split_segments,
    trim_silence,
    write_wav,
)
from lookup import lookup  # noqa: E402
from coverage import compute_coverage  # noqa: E402


def tone(freq: float, seconds: float, dbfs: float = -20.0) -> np.ndarray:
    t = np.arange(int(SAMPLE_RATE * seconds)) / SAMPLE_RATE
    amp = 10.0 ** (dbfs / 20.0)
    return (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(SAMPLE_RATE * seconds), dtype=np.float32)


def write_wav_file(path: str, x: np.ndarray) -> None:
    write_wav(path, x)


# --- silence trimming -------------------------------------------------------

def test_trim_silence_removes_leading_and_trailing():
    x = np.concatenate([silence(1.0), tone(440, 1.0), silence(1.0)])
    y = trim_silence(x)
    dur = len(y) / SAMPLE_RATE
    assert 0.95 < dur < 1.25, f"trimmed to {dur}s, expected ~1s"


def test_trim_silence_all_silence_returns_empty():
    y = trim_silence(silence(0.5))
    assert len(y) == 0


# --- loudness ---------------------------------------------------------------

def test_integrated_loudness_of_silence_is_neg_inf():
    assert integrated_loudness(silence(1.0)) == float("-inf")


def test_normalize_hits_target_within_1_lufs():
    x = tone(440, 2.0, dbfs=-34.0)
    y = normalize_loudness(x, target_lufs=-16.0)
    measured = integrated_loudness(y)
    assert abs(measured - (-16.0)) < 1.0, f"measured {measured} LUFS"


def test_normalize_peak_limited():
    x = tone(440, 2.0, dbfs=-3.0)
    y = normalize_loudness(x, target_lufs=-16.0)
    peak_dbfs = 20.0 * np.log10(float(np.max(np.abs(y))) + 1e-12)
    assert peak_dbfs <= -1.0 + 0.05, f"peak {peak_dbfs} dBFS exceeds ceiling"


# --- contract ----------------------------------------------------------------

def _good_sidecar_dict(tmpdir: str) -> dict:
    audio = os.path.join(tmpdir, "infantry-1.mp3")
    with open(audio, "wb") as fh:
        fh.write(b"fake")
    return {
        "schema_version": 1,
        "id": "infantry-1",
        "kind": "line",
        "file": "infantry-1.mp3",
        "voice_id": "avocado_v2:vincent",
        "character": "Gruff Brick",
        "class": "infantry",
        "format": "mp3",
        "role": "delivery",
        "sample_rate_hz": 44100,
        "duration_s": 3.2,
        "loudness_lufs": -16.1,
        "lines": [{"index": 0, "text": "Contact front.",
                   "emotion": "urgent",
                   "context_tags": ["combat", "contact"]}],
    }


def test_contract_accepts_valid_sidecar():
    with tempfile.TemporaryDirectory() as td:
        d = _good_sidecar_dict(td)
        p = os.path.join(td, "infantry-1.voice.json")
        with open(p, "w", encoding="utf-8") as fh:
            json.dump(d, fh)
        assert validate_file(p) == []


def test_contract_rejects_bad_emotion():
    with tempfile.TemporaryDirectory() as td:
        d = _good_sidecar_dict(td)
        d["lines"][0]["emotion"] = "spicy"
        p = os.path.join(td, "infantry-1.voice.json")
        with open(p, "w", encoding="utf-8") as fh:
            json.dump(d, fh)
        errors = validate_file(p)
        assert any("spicy" in e for e in errors)


def test_contract_rejects_master_not_48k():
    sc = Sidecar(id="x", kind="line", file="x.wav", voice_id="v",
                 character="C", unit_class="infantry", fmt="wav",
                 role="master", sample_rate_hz=44100,
                 lines=[LineMeta(0, "Hello.", "neutral", ["generic"])])
    errors = sc.validate()
    assert any("48000" in e for e in errors)


def test_contract_rejects_em_dash_in_text():
    sc = Sidecar(id="x", kind="line", file="x.mp3", voice_id="v",
                 character="C", unit_class="infantry", fmt="mp3",
                 role="delivery",
                 lines=[LineMeta(0, "Hello \u2014 there.", "neutral",
                                 ["generic"])])
    errors = sc.validate()
    assert any("em dash" in e for e in errors)


def test_contract_rejects_unknown_context_tag():
    sc = Sidecar(id="x", kind="line", file="x.mp3", voice_id="v",
                 character="C", unit_class="infantry", fmt="mp3",
                 role="delivery",
                 lines=[LineMeta(0, "Hello.", "neutral", ["underwater"])])
    assert any("underwater" in e for e in sc.validate())


# --- segmentation ------------------------------------------------------------

def test_split_segments_finds_two_tones():
    x = np.concatenate([tone(440, 0.8), silence(0.6), tone(660, 0.8)])
    segs = split_segments(x)
    assert len(segs) == 2, f"found {len(segs)} segments"


def test_ingest_split_mismatch_raises():
  with tempfile.TemporaryDirectory() as td:
    wav = os.path.join(td, "raw.wav")
    write_wav_file(wav, np.concatenate([tone(440, 0.8), silence(0.6),
                                        tone(660, 0.8)]))
    txt = os.path.join(td, "t.txt")
    with open(txt, "w", encoding="utf-8") as fh:
        fh.write("one\ntwo\nthree\n")
    out = os.path.join(td, "out")
    try:
        ingest_file(wav, out, "C", "infantry", "v", "neutral", ["generic"],
                    transcript=txt)
    except RuntimeError as exc:
        assert re.search(r"2.*segments.*3.*lines", str(exc)), str(exc)
    else:
        raise AssertionError("expected RuntimeError on split mismatch")


def test_ingest_split_match_writes_sidecars():
  with tempfile.TemporaryDirectory() as td:
    wav = os.path.join(td, "raw.wav")
    write_wav_file(wav, np.concatenate([tone(440, 0.8), silence(0.6),
                                        tone(660, 0.8)]))
    txt = os.path.join(td, "t.txt")
    with open(txt, "w", encoding="utf-8") as fh:
        fh.write("First line.\nSecond line.\n")
    out = os.path.join(td, "out")
    sidecars = ingest_file(wav, out, "Gruff Brick", "infantry",
                           "avocado_v2:vincent", "urgent",
                           ["combat", "contact"],
                           transcript=txt, line_id_prefix="inf-1")
    assert len(sidecars) == 2
    assert sidecars[0].lines[0].text == "First line."
    assert os.path.isfile(os.path.join(out, "inf-1-1.voice.json"))
    assert os.path.isfile(os.path.join(out, "inf-1-1.master.wav"))
    assert os.path.isfile(os.path.join(out, "inf-1-1.mp3"))


# --- lookup ------------------------------------------------------------------

def _manifest():
    def sc(sid, character, cls, lines):
        return {"id": sid, "file": f"{sid}.mp3", "character": character,
                "class": cls,
                "lines": [{"text": t, "emotion": e, "context_tags": tags}
                          for t, e, tags in lines]}
    return {"lines": [
        sc("g1", "Generic Joe", "townsman",
           [("Welcome.", "warm", ["generic", "greeting"])]),
        sc("b1", "Gruff Brick", "infantry",
           [("Contact front.", "urgent", ["combat", "contact"]),
            ("We hold here.", "stern", ["combat"])]),
    ]}


def test_lookup_exact_beats_generic():
    r = lookup(_manifest(), "Gruff Brick", "contact")
    assert r.text == "Contact front."
    assert not r.fallback
    assert r.score == 5  # 3 notable + 2 topic


def test_lookup_unknown_notable_falls_back_to_generic():
    r = lookup(_manifest(), "Nobody In Particular", "no-such-topic")
    assert r.fallback
    assert r.text == "Welcome."


def test_lookup_generic_line_can_win_on_topic():
    r = lookup(_manifest(), "Nobody In Particular", "greeting")
    assert r.text == "Welcome."
    assert r.score == 2  # topic match on the generic pool line


def test_lookup_never_raises_on_empty_manifest():
    r = lookup({"lines": []}, "x", "y")
    assert r.text is None and r.fallback


# --- coverage -----------------------------------------------------------------

def _registry():
    return {"notables": [
        {"id": "gruff-brick", "topics": ["combat", "greeting"]},
        {"id": "generic-joe", "topics": ["greeting"]},
    ]}


def test_coverage_counts_pairs():
    rep = compute_coverage(_manifest(), _registry())
    assert rep["total_pairs"] == 3
    assert rep["covered_pairs"] == 2
    assert abs(rep["coverage_pct"] - 66.7) < 0.1
    assert {"notable": "gruff-brick", "topic": "greeting"} in rep["missing"]



def test_ingest_batch_mode_emits_one_sidecar():
  import ingest as ing
  with tempfile.TemporaryDirectory() as td:
    wav = os.path.join(td, "raw.wav")
    write_wav_file(wav, np.concatenate([tone(440, 0.8), silence(0.6),
                                        tone(660, 0.8)]))
    txt = os.path.join(td, "t.txt")
    with open(txt, "w", encoding="utf-8") as fh:
        fh.write("First line.\nSecond line.\n")
    out = os.path.join(td, "out")
    scs = ing.ingest_file(wav, out, "Gruff Brick", "infantry",
                          "avocado_v2:vincent", "urgent", ["combat"],
                          transcript=txt, line_id_prefix="b1", batch=True)
    assert len(scs) == 1
    sc = scs[0]
    assert sc.kind == "batch"
    assert len(sc.lines) == 2
    assert sc.lines[1].text == "Second line."
    assert sc.validate(base_dir=out) == []

def main() -> int:
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith("test_") and callable(fn)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
        except Exception:
            failed += 1
            print(f"FAIL {name}")
            traceback.print_exc()
        else:
            print(f"ok   {name}")
    print(f"{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

