"""Voice-line asset contract for the bannerlord-clone dialogue pipeline.

Every voice audio file in the repo carries a sidecar JSON file with the same
basename (``infantry-2.mp3`` -> ``infantry-2.voice.json``). The sidecar holds
per-line metadata: character, emotion, and context tags, plus the technical
facts the client needs (format, sample rate, loudness).

Two roles:
  master    - 48 kHz WAV, the archival recording. format must be "wav" and
              sample_rate_hz must be 48000.
  delivery  - compressed game file. format must be "mp3" or "ogg".

Two kinds:
  line      - one file, one spoken line. ``lines`` has exactly one entry.
  batch     - one file, several lines spoken in order (the TTS batches).
              ``lines`` has one entry per spoken line, in order.

The writing rules from check-writing.py apply to line text: plain ASCII,
no em dashes or curly quotes. The validator rejects them so bad text can
never ship in a sidecar.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field

SCHEMA_VERSION = 1

FORMATS = ("wav", "mp3", "ogg")
KINDS = ("line", "batch")
ROLES = ("master", "delivery")

# Starter emotion taxonomy. Extend by appending; never rename or remove an
# entry that shipped, sidecars in the wild reference these strings.
EMOTIONS = (
    "neutral", "calm", "warm", "stern", "angry", "afraid", "determined",
    "urgent", "mocking", "weary", "triumphant", "joking", "solemn",
)

# Context tags: where/when the line is appropriate. Same rule as emotions.
CONTEXT_TAGS = (
    "generic",
    "combat", "contact", "taking_fire", "flanking", "casualty", "victory",
    "rout", "rally", "order", "kill_shout",
    "greeting", "farewell", "idle",
    "quest_offer", "quest_turnin", "rumor", "threat", "bargain",
    "tavern", "town", "campfire",
    "radio",
)

# Characters that may never appear in shipped line text.
BANNED_CHARS = {
    "\u2014": "em dash",
    "\u2013": "en dash",
    "\u2018": "left single quote",
    "\u2019": "right single quote",
    "\u201c": "left double quote",
    "\u201d": "right double quote",
}


class ContractError(ValueError):
    """A sidecar violates the asset contract."""


@dataclass
class LineMeta:
    index: int
    text: str
    emotion: str
    context_tags: list = field(default_factory=list)

    def validate(self) -> list[str]:
        errors = []
        if not isinstance(self.text, str) or not self.text.strip():
            errors.append(f"line {self.index}: text is empty")
        else:
            for ch, name in BANNED_CHARS.items():
                if ch in self.text:
                    errors.append(f"line {self.index}: text contains {name}")
                    break
        if self.emotion not in EMOTIONS:
            errors.append(
                f"line {self.index}: emotion {self.emotion!r} not in taxonomy "
                f"(allowed: {', '.join(EMOTIONS)})"
            )
        for tag in self.context_tags:
            if tag not in CONTEXT_TAGS:
                errors.append(
                    f"line {self.index}: context tag {tag!r} not in taxonomy"
                )
        return errors


@dataclass
class Sidecar:
    id: str
    kind: str
    file: str
    voice_id: str
    character: str
    unit_class: str
    fmt: str
    role: str
    sample_rate_hz: int | None = None
    duration_s: float | None = None
    loudness_lufs: float | None = None
    lines: list = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: dict) -> "Sidecar":
        return cls(
            id=d.get("id", ""),
            kind=d.get("kind", ""),
            file=d.get("file", ""),
            voice_id=d.get("voice_id", ""),
            character=d.get("character", ""),
            unit_class=d.get("class", ""),
            fmt=d.get("format", ""),
            role=d.get("role", ""),
            sample_rate_hz=d.get("sample_rate_hz"),
            duration_s=d.get("duration_s"),
            loudness_lufs=d.get("loudness_lufs"),
            lines=[LineMeta(
                index=i,
                text=ln.get("text", ""),
                emotion=ln.get("emotion", ""),
                context_tags=list(ln.get("context_tags", [])),
            ) for i, ln in enumerate(d.get("lines", []))],
        )

    def to_dict(self) -> dict:
        return {
            "schema_version": SCHEMA_VERSION,
            "id": self.id,
            "kind": self.kind,
            "file": self.file,
            "voice_id": self.voice_id,
            "character": self.character,
            "class": self.unit_class,
            "format": self.fmt,
            "role": self.role,
            "sample_rate_hz": self.sample_rate_hz,
            "duration_s": self.duration_s,
            "loudness_lufs": self.loudness_lufs,
            "lines": [
                {"index": ln.index, "text": ln.text, "emotion": ln.emotion,
                 "context_tags": ln.context_tags}
                for ln in self.lines
            ],
        }

    def validate(self, base_dir: str = "") -> list[str]:
        """Return a list of contract violations; empty means valid."""
        errors = []
        if not self.id:
            errors.append("id is empty")
        if self.kind not in KINDS:
            errors.append(f"kind {self.kind!r} not in {KINDS}")
        if self.fmt not in FORMATS:
            errors.append(f"format {self.fmt!r} not in {FORMATS}")
        if self.role not in ROLES:
            errors.append(f"role {self.role!r} not in {ROLES}")
        if self.role == "master":
            if self.fmt != "wav":
                errors.append("master role requires wav format")
            if self.sample_rate_hz != 48000:
                errors.append(
                    f"master role requires 48000 Hz, got {self.sample_rate_hz}"
                )
        if self.role == "delivery" and self.fmt not in ("mp3", "ogg"):
            errors.append("delivery role requires mp3 or ogg format")
        if not self.file:
            errors.append("file is empty")
        elif base_dir and not os.path.isfile(os.path.join(base_dir, self.file)):
            errors.append(f"file {self.file!r} does not exist in {base_dir}")
        if not self.character:
            errors.append("character is empty")
        if not self.unit_class:
            errors.append("class is empty")
        if self.kind == "line" and len(self.lines) != 1:
            errors.append(
                f"kind 'line' needs exactly 1 line entry, got {len(self.lines)}"
            )
        if self.kind == "batch" and len(self.lines) < 2:
            errors.append(
                f"kind 'batch' needs 2+ line entries, got {len(self.lines)}"
            )
        for i, ln in enumerate(self.lines):
            if ln.index != i:
                errors.append(f"line index {ln.index} out of order at {i}")
            errors.extend(ln.validate())
        return errors


def load_sidecar(path: str) -> Sidecar:
    with open(path, "r", encoding="utf-8") as fh:
        d = json.load(fh)
    if d.get("schema_version") != SCHEMA_VERSION:
        raise ContractError(
            f"{path}: schema_version {d.get('schema_version')} "
            f"!= {SCHEMA_VERSION}"
        )
    return Sidecar.from_dict(d)


def validate_file(path: str) -> list[str]:
    """Validate one sidecar JSON file. Returns violations (empty = valid)."""
    try:
        sc = load_sidecar(path)
    except (json.JSONDecodeError, ContractError) as exc:
        return [str(exc)]
    return sc.validate(base_dir=os.path.dirname(path) or ".")
