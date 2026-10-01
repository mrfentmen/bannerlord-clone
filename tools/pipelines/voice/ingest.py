"""Voice-line ingestion pipeline.

Drop raw recordings in, get game-ready files out:

  1. decode anything ffmpeg reads to mono 48 kHz float32
  2. trim leading/trailing silence
  3. measure integrated loudness (ITU-R BS.1770 K-weighting + gating)
  4. normalize to the target loudness, peak-limited to -1 dBFS
  5. write a 48 kHz WAV master and a compressed delivery file (mp3)
  6. write the sidecar JSON (see contract.py) and append to the manifest

Batch mode: ``--split-lines transcript.txt`` silence-splits a multi-line
recording into per-line segments. The split only proceeds when the detected
segment count matches the transcript line count; a mismatch is reported and
the file is left alone for manual review. Silence between TTS lines is not
always clean, so this gate is the honest part of the automation.

Usage:
  python3 ingest.py raw/african-1.mp3 --out content/audio/voices \\
      --character "Calm Bridge" --class african --voice-id avocado_v2:NoSugar \\
      --emotion calm --tags idle,town --transcript raw/african-1.txt
"""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np
from scipy.signal import lfilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contract import CONTEXT_TAGS, EMOTIONS, LineMeta, Sidecar  # noqa: E402

SAMPLE_RATE = 48000
TARGET_LUFS = -16.0
PEAK_CEILING_DBFS = -1.0
SILENCE_THRESHOLD_DBFS = -50.0
TRIM_PAD_S = 0.10
MIN_SILENCE_SPLIT_S = 0.30
MIN_SEGMENT_S = 0.40

# ITU-R BS.1770 K-weighting biquads for 48 kHz: pre-filter (high shelf)
# followed by the RLB high-pass.
_PRE_B = [1.53512485958697, -2.69169618940638, 1.19839281085285]
_PRE_A = [1.0, -1.69065929318241, 0.73248077421585]
_RLB_B = [1.0, -2.0, 1.0]
_RLB_A = [1.0, -1.99004745483398, 0.99007225036621]


def decode_audio(path: str) -> np.ndarray:
    """Decode any ffmpeg-readable file to mono 48 kHz float32."""
    cmd = [
        "ffmpeg", "-v", "error", "-i", path,
        "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "-",
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed on {path}: {proc.stderr.decode()[:200]}")
    return np.frombuffer(proc.stdout, dtype=np.float32).copy()


def _frame_rms_dbfs(x: np.ndarray, frame_s: float = 0.02) -> np.ndarray:
    n = max(1, int(SAMPLE_RATE * frame_s))
    nframes = max(1, len(x) // n)
    frames = x[: nframes * n].reshape(nframes, n)
    rms = np.sqrt(np.mean(frames ** 2, axis=1) + 1e-12)
    return 20.0 * np.log10(rms)


def trim_silence(x: np.ndarray) -> np.ndarray:
    """Cut leading/trailing sub-threshold audio, keeping a short pad."""
    if len(x) == 0:
        return x
    db = _frame_rms_dbfs(x)
    loud = np.nonzero(db > SILENCE_THRESHOLD_DBFS)[0]
    if len(loud) == 0:
        return x[:0]
    n = int(SAMPLE_RATE * 0.02)
    pad = int(SAMPLE_RATE * TRIM_PAD_S) // n
    start = max(0, (loud[0] - pad) * n)
    end = min(len(x), (loud[-1] + 1 + pad) * n)
    return x[start:end]


def _k_weight(x: np.ndarray) -> np.ndarray:
    return lfilter(_RLB_B, _RLB_A, lfilter(_PRE_B, _PRE_A, x))


def integrated_loudness(x: np.ndarray) -> float:
    """BS.1770 integrated loudness in LUFS (mono). Returns -inf for silence."""
    if len(x) == 0:
        return float("-inf")
    y = _k_weight(x)
    block = int(SAMPLE_RATE * 0.4)
    hop = int(SAMPLE_RATE * 0.1)
    if len(y) < block:
        blocks = [y]
    else:
        blocks = [y[i: i + block] for i in range(0, len(y) - block + 1, hop)]
    energies = np.array([np.mean(b ** 2) for b in blocks])
    # Absolute gate at -70 LUFS.
    gated = energies[10.0 * np.log10(energies + 1e-12) > -70.0 + 0.691]
    if len(gated) == 0:
        return float("-inf")
    # Relative gate at -10 LU below the absolute-gated mean.
    rel = -0.691 + 10.0 * np.log10(np.mean(gated) + 1e-12) - 10.0
    gated = gated[10.0 * np.log10(gated + 1e-12) > rel + 0.691]
    if len(gated) == 0:
        return float("-inf")
    return float(-0.691 + 10.0 * np.log10(np.mean(gated) + 1e-12))


def normalize_loudness(x: np.ndarray, target_lufs: float = TARGET_LUFS) -> np.ndarray:
    """Gain to the target integrated loudness, then peak-limit."""
    loud = integrated_loudness(x)
    if loud == float("-inf") or not np.isfinite(loud):
        return x
    gain = 10.0 ** ((target_lufs - loud) / 20.0)
    y = x * gain
    peak = float(np.max(np.abs(y))) if len(y) else 0.0
    ceiling = 10.0 ** (PEAK_CEILING_DBFS / 20.0)
    if peak > ceiling:
        y = y * (ceiling / peak)
    return y.astype(np.float32)


def write_wav(path: str, x: np.ndarray) -> None:
    pcm = np.clip(x, -1.0, 1.0)
    pcm16 = (pcm * 32767.0).astype(np.int16)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm16.tobytes())


def write_mp3(path: str, x: np.ndarray, bitrate: str = "128k") -> None:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        write_wav(tmp_path, x)
        cmd = ["ffmpeg", "-v", "error", "-y", "-i", tmp_path,
               "-codec:a", "libmp3lame", "-b:a", bitrate, path]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if proc.returncode != 0:
            raise RuntimeError(f"mp3 encode failed: {proc.stderr.decode()[:200]}")
    finally:
        os.unlink(tmp_path)


def split_segments(x: np.ndarray) -> list[tuple[int, int]]:
    """Split on silence into (start, end) sample ranges."""
    db = _frame_rms_dbfs(x)
    n = int(SAMPLE_RATE * 0.02)
    min_sil_frames = int(MIN_SILENCE_SPLIT_S / 0.02)
    min_seg_frames = int(MIN_SEGMENT_S / 0.02)
    is_sound = db > SILENCE_THRESHOLD_DBFS
    segments: list[tuple[int, int]] = []
    start = None
    sil_run = 0
    for i, s in enumerate(is_sound):
        if s:
            if start is None:
                start = i
            sil_run = 0
        else:
            if start is not None:
                sil_run += 1
                if sil_run >= min_sil_frames:
                    end = i - sil_run + 1
                    if end - start >= min_seg_frames:
                        segments.append((start * n, min(len(x), end * n)))
                    start = None
                    sil_run = 0
    if start is not None and len(is_sound) - start >= min_seg_frames:
        segments.append((start * n, len(x)))
    return segments


def process_audio(path: str) -> tuple[np.ndarray, float]:
    """Decode, trim, normalize. Returns (samples, measured_lufs_after)."""
    x = decode_audio(path)
    x = trim_silence(x)
    if len(x) == 0:
        raise RuntimeError(f"{path}: no audible content after silence trim")
    y = normalize_loudness(x)
    return y, integrated_loudness(y)


def _read_transcript(path: str) -> list[str]:
    with open(path, "r", encoding="utf-8") as fh:
        return [ln.strip() for ln in fh if ln.strip()]


def ingest_file(src: str, out_dir: str, character: str, unit_class: str,
                voice_id: str, emotion: str, tags: list[str],
                transcript: str | None = None,
                line_id_prefix: str | None = None,
                batch: bool = False,
                metadata_only: bool = False) -> list[Sidecar]:
    """Ingest one raw recording. Returns the sidecars written.

    With a transcript, silence-splits into per-line segments; the split
    only proceeds when the segment count matches the transcript line
    count. With batch=True, skips splitting and emits one batch sidecar
    (file-level emotion/tags apply to every line; curate per-line values
    in the sidecar afterwards). With metadata_only=True, no audio is
    written: the sidecar describes the existing file as-is (measured
    duration/loudness), for cataloguing recordings already in the repo.
    """
    if emotion not in EMOTIONS:
        raise ValueError(f"emotion {emotion!r} not in taxonomy")
    for t in tags:
        if t not in CONTEXT_TAGS:
            raise ValueError(f"context tag {t!r} not in taxonomy")
    os.makedirs(out_dir, exist_ok=True)
    base = os.path.splitext(os.path.basename(src))[0]
    prefix = line_id_prefix or base

    if metadata_only:
        # Cataloguing: describe the existing file as-is, never split or
        # rewrite. A transcript makes it a batch sidecar.
        lines_text = _read_transcript(transcript) if transcript else [prefix]
        return [_catalog(src, out_dir, prefix, character, unit_class,
                         voice_id, emotion, tags, lines_text,
                         kind="batch" if transcript else "line")]

    if transcript and not batch:
        lines_text = _read_transcript(transcript)
        raw = trim_silence(decode_audio(src))
        segments = split_segments(raw)
        if len(segments) != len(lines_text):
            raise RuntimeError(
                f"{src}: split found {len(segments)} segments but transcript "
                f"has {len(lines_text)} lines; leaving for manual review"
            )
        sidecars = []
        for i, ((a, b), text) in enumerate(zip(segments, lines_text)):
            seg = normalize_loudness(raw[a:b])
            lid = f"{prefix}-{i + 1}"
            sidecars.append(_emit(seg, out_dir, lid, character, unit_class,
                                 voice_id, emotion, tags, text))
        return sidecars

    if transcript and batch:
        lines_text = _read_transcript(transcript)
        y, _ = process_audio(src)
        return [_emit_batch(y, out_dir, prefix, character, unit_class,
                            voice_id, emotion, tags, lines_text)]

    y, _ = process_audio(src)
    text = prefix
    return [_emit(y, out_dir, prefix, character, unit_class, voice_id,
                  emotion, tags, text)]


def _catalog(src: str, out_dir: str, lid: str, character: str,
             unit_class: str, voice_id: str, emotion: str, tags: list[str],
             lines_text: list[str], kind: str) -> Sidecar:
    """Describe an existing in-repo file without rewriting its audio."""
    raw = decode_audio(src)
    duration_s = round(len(raw) / SAMPLE_RATE, 2)
    loudness = integrated_loudness(raw)
    sc = Sidecar(
        id=lid, kind=kind, file=os.path.basename(src), voice_id=voice_id,
        character=character, unit_class=unit_class,
        fmt=os.path.splitext(src)[1].lstrip(".").lower() or "mp3",
        role="delivery", sample_rate_hz=SAMPLE_RATE,
        duration_s=duration_s,
        loudness_lufs=round(loudness, 1) if loudness != float("-inf") else None,
        lines=[LineMeta(index=i, text=t, emotion=emotion,
                        context_tags=list(tags))
               for i, t in enumerate(lines_text)],
    )
    violations = sc.validate(base_dir=os.path.dirname(src) or ".")
    if violations:
        raise RuntimeError(f"catalog sidecar for {lid} is invalid: {violations}")
    sidecar_path = os.path.join(out_dir, f"{lid}.voice.json")
    with open(sidecar_path, "w", encoding="utf-8") as fh:
        json.dump(sc.to_dict(), fh, indent=2, ensure_ascii=True)
        fh.write("\n")
    return sc


def _emit_batch(y: np.ndarray, out_dir: str, lid: str, character: str,
                unit_class: str, voice_id: str, emotion: str, tags: list[str],
                lines_text: list[str]) -> Sidecar:
    """Emit one batch sidecar: whole-file audio, per-line transcripts.

    File-level emotion/tags apply to every line; curate per-line values
    in the sidecar JSON afterwards.
    """
    master_name = f"{lid}.master.wav"
    delivery_name = f"{lid}.mp3"
    write_wav(os.path.join(out_dir, master_name), y)
    write_mp3(os.path.join(out_dir, delivery_name), y)
    sc = Sidecar(
        id=lid, kind="batch", file=delivery_name, voice_id=voice_id,
        character=character, unit_class=unit_class, fmt="mp3",
        role="delivery", sample_rate_hz=SAMPLE_RATE,
        duration_s=round(len(y) / SAMPLE_RATE, 2),
        loudness_lufs=round(integrated_loudness(y), 1),
        lines=[LineMeta(index=i, text=t, emotion=emotion,
                        context_tags=list(tags))
               for i, t in enumerate(lines_text)],
    )
    violations = sc.validate(base_dir=out_dir)
    if violations:
        raise RuntimeError(f"emitted sidecar for {lid} is invalid: {violations}")
    sidecar_path = os.path.join(out_dir, f"{lid}.voice.json")
    with open(sidecar_path, "w", encoding="utf-8") as fh:
        json.dump(sc.to_dict(), fh, indent=2, ensure_ascii=True)
        fh.write("\n")
    return sc


def _emit(y: np.ndarray, out_dir: str, lid: str, character: str,
          unit_class: str, voice_id: str, emotion: str, tags: list[str],
          text: str) -> Sidecar:
    master_name = f"{lid}.master.wav"
    delivery_name = f"{lid}.mp3"
    write_wav(os.path.join(out_dir, master_name), y)
    write_mp3(os.path.join(out_dir, delivery_name), y)
    sc = Sidecar(
        id=lid, kind="line", file=delivery_name, voice_id=voice_id,
        character=character, unit_class=unit_class, fmt="mp3",
        role="delivery", sample_rate_hz=SAMPLE_RATE,
        duration_s=round(len(y) / SAMPLE_RATE, 2),
        loudness_lufs=round(integrated_loudness(y), 1),
        lines=[LineMeta(index=0, text=text, emotion=emotion,
                        context_tags=list(tags))],
    )
    violations = sc.validate(base_dir=out_dir)
    if violations:
        raise RuntimeError(f"emitted sidecar for {lid} is invalid: {violations}")
    sidecar_path = os.path.join(out_dir, f"{lid}.voice.json")
    with open(sidecar_path, "w", encoding="utf-8") as fh:
        json.dump(sc.to_dict(), fh, indent=2, ensure_ascii=True)
        fh.write("\n")
    return sc


def build_manifest(out_dir: str, manifest_path: str) -> dict:
    """Collect every sidecar in out_dir into one manifest JSON."""
    entries = []
    for name in sorted(os.listdir(out_dir)):
        if not name.endswith(".voice.json"):
            continue
        with open(os.path.join(out_dir, name), encoding="utf-8") as fh:
            entries.append(json.load(fh))
    manifest = {"schema_version": 1, "lines": entries}
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=True)
        fh.write("\n")
    return manifest


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Ingest raw voice recordings.")
    ap.add_argument("src", help="raw recording (any ffmpeg-readable audio)")
    ap.add_argument("--out", required=True, help="output directory")
    ap.add_argument("--character", required=True)
    ap.add_argument("--class", dest="unit_class", required=True)
    ap.add_argument("--voice-id", required=True)
    ap.add_argument("--emotion", required=True, choices=EMOTIONS)
    ap.add_argument("--tags", default="generic",
                    help="comma-separated context tags")
    ap.add_argument("--transcript", default=None,
                    help="txt transcript; enables silence-split per line")
    ap.add_argument("--batch", action="store_true",
                    help="emit one batch sidecar instead of splitting")
    ap.add_argument("--metadata-only", action="store_true",
                    help="catalog the existing file without rewriting audio")
    ap.add_argument("--id-prefix", default=None)
    ap.add_argument("--manifest", default=None,
                    help="rebuild the manifest at this path after ingest")
    args = ap.parse_args(argv)

    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    try:
        sidecars = ingest_file(
            args.src, args.out, args.character, args.unit_class,
            args.voice_id, args.emotion, tags,
            transcript=args.transcript, line_id_prefix=args.id_prefix,
            batch=args.batch, metadata_only=args.metadata_only,
        )
    except (RuntimeError, ValueError) as exc:
        print(f"ingest failed: {exc}", file=sys.stderr)
        return 1
    for sc in sidecars:
        print(f"ok: {sc.id} ({sc.duration_s}s, {sc.loudness_lufs} LUFS)")
    if args.manifest:
        m = build_manifest(args.out, args.manifest)
        print(f"manifest: {len(m['lines'])} sidecars -> {args.manifest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
