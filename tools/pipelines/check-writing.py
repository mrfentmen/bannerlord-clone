#!/usr/bin/env python3
"""check-writing.py — style QA gate for game writing.

Enforces Del's non-negotiable style rules on every writing file the agents
produce (content/dialogue, content/lore, content/characters, voice scripts):
  - plain ASCII only (no em dashes, en dashes, curly quotes, or other unicode)
  - no marketing/ad-style hype speak

Usage:
  python3 tools/pipelines/check-writing.py [paths...]   # check files/dirs
  python3 tools/pipelines/check-writing.py --self-test  # run built-in tests

Exit code 0 = clean, 1 = violations found, 2 = usage/file error.
"""

import os
import re
import sys

# Characters that are never allowed in game writing (with plain-English names
# for the report so a non-technical reader knows what to fix).
BANNED_CHARS = {
    "\u2014": "em dash",
    "\u2013": "en dash",
    "\u201c": "curly open quote",
    "\u201d": "curly close quote",
    "\u2018": "curly open single quote",
    "\u2019": "curly close single quote",
    "\u2026": "ellipsis character",
    "\u00a0": "non-breaking space",
}

# Ad/marketing speak patterns (case-insensitive). Kept small and obvious —
# this catches agent hype, not legitimate game text.
HYPE_PATTERNS = [
    r"\bepic\b.{0,20}\b(adventure|journey|quest|saga)\b",
    r"\bultimate\b.{0,20}\b(experience|power|weapon)\b",
    r"\bunleash\b",
    r"\bdelve\b",
    r"\bgame-changer\b",
    r"\bcutting-edge\b",
    r"\bnext-level\b",
]

TEXT_EXTS = {".md", ".txt"}


def check_text(text, path="<input>"):
    """Return a list of violation strings for one text blob."""
    violations = []
    for lineno, line in enumerate(text.splitlines(), 1):
        for ch, name in BANNED_CHARS.items():
            start = 0
            while True:
                col = line.find(ch, start)
                if col < 0:
                    break
                violations.append(
                    f"{path}:{lineno}:{col + 1}: banned {name} {ch!r}"
                )
                start = col + 1
        for i, ch in enumerate(line):
            if ord(ch) > 127 and ch not in BANNED_CHARS:
                violations.append(
                    f"{path}:{lineno}:{i + 1}: non-ASCII character U+{ord(ch):04X} {ch!r}"
                )
                break  # one report per line is enough for exotic unicode
        for pat in HYPE_PATTERNS:
            m = re.search(pat, line, re.IGNORECASE)
            if m:
                violations.append(
                    f"{path}:{lineno}: hype speak {m.group(0)!r} matches {pat!r}"
                )
    return violations


def collect_files(paths):
    files = []
    for p in paths:
        if os.path.isdir(p):
            for root, _dirs, names in os.walk(p):
                for n in names:
                    if os.path.splitext(n)[1].lower() in TEXT_EXTS:
                        files.append(os.path.join(root, n))
        elif os.path.isfile(p):
            files.append(p)
        else:
            print(f"check-writing: not found: {p}", file=sys.stderr)
            return None
    return sorted(files)


def main(argv):
    if "--self-test" in argv:
        return 0 if self_test() else 1
    paths = [a for a in argv[1:] if not a.startswith("-")]
    if not paths:
        paths = ["content/dialogue", "content/lore", "content/characters"]
        paths = [p for p in paths if os.path.isdir(p)]
    files = collect_files(paths)
    if files is None:
        return 2
    if not files:
        print("check-writing: no text files found")
        return 2
    all_violations = []
    for f in files:
        try:
            with open(f, encoding="utf-8") as fh:
                text = fh.read()
        except (OSError, UnicodeDecodeError) as e:
            all_violations.append(f"{f}: cannot read: {e}")
            continue
        all_violations.extend(check_text(text, f))
    if all_violations:
        print(f"check-writing: {len(all_violations)} violation(s) in {len(files)} file(s):")
        for v in all_violations[:50]:
            print("  " + v)
        if len(all_violations) > 50:
            print(f"  ... and {len(all_violations) - 50} more")
        return 1
    print(f"check-writing: clean — {len(files)} file(s) checked")
    return 0


def self_test():
    cases = [
        # (input, expected_violation_count, label)
        ("Plain talking, the way people talk.\n", 0, "clean ascii"),
        ("He said \u2014 wait \u2014 stop.\n", 2, "em dashes"),
        ("range 5\u201310 miles\n", 1, "en dash"),
        ("\u201cHello,\u201d she said.\n", 2, "curly quotes"),
        ("It\u2019s fine.\n", 1, "curly apostrophe"),
        ("Unleash your ultimate power now.\n", 2, "hype speak"),
        ("The epic adventure begins at dawn.\n", 1, "epic adventure hype"),
        ("caf\u00e9 society\n", 1, "non-ascii latin"),
        ("Line one.\nLine two has \u2014 trouble.\nLine three.\n",
         1, "line number is 2"),
    ]
    failed = 0
    for text, expected, label in cases:
        got = check_text(text, "test")
        # for the line-number case, also verify the reported line
        if label == "line number is 2" and got and ":2:" not in got[0]:
            print(f"SELF-TEST FAIL [{label}]: wrong line in {got[0]}")
            failed += 1
            continue
        if len(got) != expected:
            print(f"SELF-TEST FAIL [{label}]: expected {expected}, got {len(got)}: {got}")
            failed += 1
    if failed:
        print(f"self-test: {failed} case(s) failed")
        return False
    print(f"self-test: all {len(cases)} cases passed")
    return True


if __name__ == "__main__":
    sys.exit(main(sys.argv))
