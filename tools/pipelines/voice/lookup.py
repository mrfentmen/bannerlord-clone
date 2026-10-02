"""Dialogue voice lookup.

Given a notable id, a topic, and a relationship state, return the
best-matching line set from the voice manifest. Scoring is explicit and
deterministic:

  +3  notable (character) matches
  +2  topic matches one of the line's context tags
  +1  relationship matches a relationship tag on the line

Ties break by manifest order, so the same query always returns the same
line. An unknown notable falls back to the generic pool (lines tagged
"generic"); a lookup never raises on unknown input. If the manifest has
no usable line at all, the result carries ``line=None`` instead of
raising: silence by choice, never silence by crash.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass


def _norm(s: str) -> str:
    return re.sub(r"[-_\s]+", " ", (s or "")).strip().lower()

@dataclass
class LookupResult:
    sidecar_id: str | None
    file: str | None
    character: str | None
    text: str | None
    emotion: str | None
    score: int
    fallback: bool

    def to_dict(self) -> dict:
        return {
            "sidecar_id": self.sidecar_id,
            "file": self.file,
            "character": self.character,
            "text": self.text,
            "emotion": self.emotion,
            "score": self.score,
            "fallback": self.fallback,
        }


def _iter_lines(manifest: dict):
    for sc in manifest.get("lines", []):
        for ln in sc.get("lines", []):
            yield sc, ln


def _is_generic(ln: dict) -> bool:
    return "generic" in ln.get("context_tags", [])


def lookup(manifest: dict, notable_id: str, topic: str,
           relationship: str = "neutral") -> LookupResult:
    """Return the best-matching voiced line for the query."""
    best: LookupResult | None = None
    generic: LookupResult | None = None

    for sc in manifest.get("lines", []):
        for ln in sc.get("lines", []):
            score = 0
            notable_hit = (
                notable_id
                and _norm(notable_id) in (
                    _norm(sc.get("character", "")),
                    _norm(sc.get("id", "")),
                    _norm(sc.get("class", "")),
                )
            )
            if notable_hit:
                score += 3
            if topic and _norm(topic) in [_norm(t) for t in ln.get("context_tags", [])]:
                score += 2
            rel_tags = [_norm(t) for t in ln.get("context_tags", [])]
            if relationship and _norm(relationship) in rel_tags:
                score += 1
            if score == 0 and generic is None and _is_generic(ln):
                generic = LookupResult(
                    sidecar_id=sc.get("id"), file=sc.get("file"),
                    character=sc.get("character"), text=ln.get("text"),
                    emotion=ln.get("emotion"), score=0, fallback=True,
                )
            if score > 0 and (best is None or score > best.score):
                best = LookupResult(
                    sidecar_id=sc.get("id"), file=sc.get("file"),
                    character=sc.get("character"), text=ln.get("text"),
                    emotion=ln.get("emotion"), score=score, fallback=False,
                )

    if best is not None:
        return best
    if generic is not None:
        return generic
    return LookupResult(None, None, None, None, None, 0, True)


def load_manifest(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)

