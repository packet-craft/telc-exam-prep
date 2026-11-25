#!/usr/bin/env python3
"""Static checks for the exam-prep site. Run from the repository root:

    python3 scripts/validate.py

Used by .github/workflows/ci.yml. Uses only the standard library.
Checks, over the files tracked by git:
  1. No copyrighted reference material is committed (reference/ folder).
  2. Every .json file parses.
  3. Every local link in .html files is relative and points to an existing
     file, so the site works from a subpath (username.github.io/repo-name/).
"""
import json
import os
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit

# Folders that must never be committed (third-party, private-use-only files).
FORBIDDEN_PREFIXES = ("reference/",)

LINK_RE = re.compile(r"""(?:href|src)\s*=\s*["']([^"']+)["']""", re.IGNORECASE)


def tracked_files():
    out = subprocess.run(
        ["git", "ls-files", "-z"], check=True, stdout=subprocess.PIPE
    ).stdout.decode("utf-8")
    return [f for f in out.split("\0") if f]


def check_forbidden(files, errors):
    for f in files:
        if f.startswith(FORBIDDEN_PREFIXES):
            errors.append(f"{f}: must not be committed (copyrighted reference material)")


def check_json(files, errors):
    for f in files:
        if not f.endswith(".json"):
            continue
        try:
            with open(f, encoding="utf-8") as fh:
                json.load(fh)
        except (ValueError, OSError) as exc:
            errors.append(f"{f}: invalid JSON ({exc})")


def check_links(files, errors):
    for f in files:
        if not f.endswith(".html"):
            continue
        with open(f, encoding="utf-8") as fh:
            html = fh.read()
        for link in LINK_RE.findall(html):
            parts = urlsplit(link)
            # External links, anchors on the same page, mailto:, data: etc.
            if parts.scheme or parts.netloc or not parts.path:
                continue
            if parts.path.startswith("/"):
                errors.append(f"{f}: '{link}' is root-absolute; use a relative path")
                continue
            target = os.path.normpath(os.path.join(os.path.dirname(f), unquote(parts.path)))
            if os.path.isdir(target):
                target = os.path.join(target, "index.html")
            if not os.path.isfile(target):
                errors.append(f"{f}: '{link}' points to a missing file")


def main():
    files = tracked_files()
    errors = []
    check_forbidden(files, errors)
    check_json(files, errors)
    check_links(files, errors)

    n_json = sum(f.endswith(".json") for f in files)
    n_html = sum(f.endswith(".html") for f in files)
    print(f"Checked {len(files)} tracked files ({n_json} JSON, {n_html} HTML).")
    if errors:
        print(f"\n{len(errors)} problem(s):")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
