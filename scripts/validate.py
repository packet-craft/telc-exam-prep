#!/usr/bin/env python3
"""Static checks for the exam-prep site. Run from the repository root:

    python3 scripts/validate.py

Used by .github/workflows/ci.yml. Uses only the standard library.
Checks, over the files tracked by git:
  1. No copyrighted reference material is committed (reference/ folder).
  2. Every .json file parses.
  3. Every local link in .html files is relative and points to an existing
     file, so the site works from a subpath (username.github.io/repo-name/).
  4. data/deck.json matches the card schema and the minimum deck sizes.
  5. Every data/tests/test-*.json matches the test schema and the official
     item layout (items 1-58), and is listed in data/tests/index.json.

The schemas are documented in README.md.
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


# ---------------------------------------------------------------- flashcards

DECK_PATH = "data/deck.json"
CARD_FIELDS = ("id", "type", "topic", "front", "back", "translation", "example", "exampleTranslation")
MIN_CARDS, MIN_PER_TOPIC, MIN_PER_TYPE = 250, 20, 25


def load(path, errors):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (ValueError, OSError) as exc:
        errors.append(f"{path}: cannot load ({exc})")
        return None


def check_deck(errors, path=DECK_PATH, enforce_minimums=True):
    if not os.path.isfile(path):
        return
    deck = load(path, errors)
    if deck is None:
        return
    topics, types, cards = deck.get("topics", {}), deck.get("types", {}), deck.get("cards", [])
    seen, fronts = set(), set()
    per_topic = dict.fromkeys(topics, 0)
    per_type = dict.fromkeys(types, 0)
    for i, c in enumerate(cards):
        where = f"{path}: card {c.get('id', '#%d' % i)}"
        for f in CARD_FIELDS:
            if not isinstance(c.get(f), str) or not c[f].strip():
                errors.append(f"{where}: missing or empty '{f}'")
        if c.get("id") in seen:
            errors.append(f"{where}: duplicate id")
        seen.add(c.get("id"))
        key = (c.get("type"), c.get("front"))
        if key in fronts:
            errors.append(f"{where}: duplicate front '{c.get('front')}' for type {c.get('type')}")
        fronts.add(key)
        if c.get("topic") not in topics:
            errors.append(f"{where}: unknown topic '{c.get('topic')}'")
        else:
            per_topic[c["topic"]] += 1
        if c.get("type") not in types:
            errors.append(f"{where}: unknown type '{c.get('type')}'")
        else:
            per_type[c["type"]] += 1
    if enforce_minimums:
        if len(cards) < MIN_CARDS:
            errors.append(f"{path}: {len(cards)} cards, need at least {MIN_CARDS}")
        for t, n in per_topic.items():
            if n < MIN_PER_TOPIC:
                errors.append(f"{path}: topic '{t}' has {n} cards, need {MIN_PER_TOPIC}")
        for t, n in per_type.items():
            if n < MIN_PER_TYPE:
                errors.append(f"{path}: type '{t}' has {n} cards, need {MIN_PER_TYPE}")


# --------------------------------------------------------------- model tests

TESTS_DIR = "data/tests"

# Official layout of the Deutsch-Test fuer den Beruf B2: for each part, the
# item numbers with their type, and what else the part must contain.
# (section id, part id, {item number: type}, extras)
LAYOUT = [
    ("lesen", "lesen-1", {n: "match" for n in range(1, 6)}, {"options": 8, "stimuli": 0}),
    ("lesen", "lesen-2", {6: "tf", 7: "mc", 8: "tf", 9: "mc"}, {"stimuli": 2}),
    ("lesen", "lesen-3", {n: "match" for n in range(10, 14)}, {"options": 6, "allowNone": True}),
    ("lesen", "lesen-4", {n: "mc" for n in range(14, 19)}, {"stimuli": 1}),
    ("lesen-schreiben", "lesen-schreiben", {19: "mc", 20: "mc"}, {"writing": 21}),
    ("hoeren", "hoeren-1", {22: "tf", 23: "mc", 24: "tf", 25: "mc", 26: "tf", 27: "mc"}, {"stimuli": 3}),
    ("hoeren", "hoeren-2", {n: "match" for n in range(28, 32)}, {"options": 6, "stimuli": 4}),
    ("hoeren", "hoeren-3", {n: "mc" for n in range(32, 36)}, {"stimuli": 1}),
    ("hoeren", "hoeren-4", {n: "mc" for n in range(36, 41)}, {"stimuli": 5}),
    ("hoeren-schreiben", "hoeren-schreiben", {41: "mc"}, {"stimuli": 1, "notes": [42, 43, 44, 45]}),
    ("sprachbausteine-schreiben", "sprachbausteine-1", {n: "match" for n in range(46, 52)}, {"options": 10, "gaps": True}),
    ("sprachbausteine-schreiben", "sprachbausteine-2", {n: "mc" for n in range(52, 58)}, {"gaps": True}),
    ("sprachbausteine-schreiben", "schreiben", {}, {"writing": 58}),
    ("sprechen", "sprechen-1", {}, {"speaking": True}),
    ("sprechen", "sprechen-2", {}, {"speaking": True}),
    ("sprechen", "sprechen-3", {}, {"speaking": True}),
]


def nonempty(v):
    return isinstance(v, str) and v.strip() != ""


def check_part(where, part, items_spec, extra, errors):
    for f in ("title", "instructions"):
        if not nonempty(part.get(f)):
            errors.append(f"{where}: missing '{f}'")
    stimuli = part.get("stimuli", [])
    stim_ids = {s.get("id") for s in stimuli}
    for s in stimuli:
        sw = f"{where}: stimulus {s.get('id')}"
        if s.get("kind") == "text":
            if not nonempty(s.get("body")):
                errors.append(f"{sw}: text stimulus needs 'body'")
        elif s.get("kind") == "audio":
            tr = s.get("transcript")
            if not isinstance(tr, list) or not tr:
                errors.append(f"{sw}: audio stimulus needs a 'transcript' list")
            else:
                for line in tr:
                    if not nonempty(line.get("speaker")) or not nonempty(line.get("text")) or line.get("voice") not in ("m", "f"):
                        errors.append(f"{sw}: each transcript line needs speaker, text and voice 'm' or 'f'")
                        break
        else:
            errors.append(f"{sw}: kind must be 'text' or 'audio'")
    if "stimuli" in extra and len(stimuli) != extra["stimuli"]:
        errors.append(f"{where}: expected {extra['stimuli']} stimuli, found {len(stimuli)}")

    options = part.get("options", [])
    keys = [o.get("key") for o in options]
    if "options" in extra:
        want = [chr(ord("a") + i) for i in range(extra["options"])]
        if keys != want:
            errors.append(f"{where}: options must have keys {want[0]}-{want[-1]} in order")
        for o in options:
            if not nonempty(o.get("text")):
                errors.append(f"{where}: option {o.get('key')} needs 'text'")
    if extra.get("allowNone") and part.get("allowNone") is not True:
        errors.append(f"{where}: must set \"allowNone\": true")

    items = part.get("items", [])
    found = {it.get("n"): it for it in items}
    if sorted(found) != sorted(items_spec) or len(items) != len(items_spec):
        errors.append(f"{where}: items must be exactly numbers {sorted(items_spec)}")
    used = []
    for n, typ in items_spec.items():
        it = found.get(n)
        if it is None:
            continue
        iw = f"{where}: item {n}"
        if it.get("type") != typ:
            errors.append(f"{iw}: type must be '{typ}'")
        if not nonempty(it.get("explanation")):
            errors.append(f"{iw}: missing 'explanation'")
        if "stimulus" in it and it["stimulus"] not in stim_ids:
            errors.append(f"{iw}: unknown stimulus '{it['stimulus']}'")
        ans = it.get("answer")
        if typ == "tf":
            if not isinstance(ans, bool):
                errors.append(f"{iw}: answer must be true or false")
            if not nonempty(it.get("prompt")):
                errors.append(f"{iw}: missing 'prompt'")
        elif typ == "mc":
            opts = it.get("options")
            if not isinstance(opts, dict) or sorted(opts) != ["a", "b", "c"] or not all(nonempty(v) for v in opts.values()):
                errors.append(f"{iw}: options must be an object with keys a, b, c")
            if ans not in ("a", "b", "c"):
                errors.append(f"{iw}: answer must be a, b or c")
        elif typ == "match":
            allowed = keys + (["x"] if part.get("allowNone") else [])
            if ans not in allowed:
                errors.append(f"{iw}: answer '{ans}' is not one of the options")
            used.append(ans)
    real = [a for a in used if a != "x"]
    if len(real) != len(set(real)):
        errors.append(f"{where}: an option is the answer to more than one item")
    if extra.get("allowNone") and used.count("x") != 1:
        errors.append(f"{where}: exactly one item must have answer 'x'")

    if extra.get("gaps"):
        text = part.get("gapText", "")
        gaps = [int(g) for g in re.findall(r"\[\[(\d+)\]\]", text)]
        if sorted(gaps) != sorted(items_spec):
            errors.append(f"{where}: gapText must contain [[n]] exactly once for each of {sorted(items_spec)}")
    if "notes" in extra:
        notes = part.get("notes", [])
        if [x.get("n") for x in notes] != extra["notes"] or not all(nonempty(x.get("label")) and nonempty(x.get("expected")) for x in notes):
            errors.append(f"{where}: notes must be items {extra['notes']} with 'label' and 'expected'")
    if "writing" in extra:
        w = part.get("writing") or {}
        if w.get("n") != extra["writing"]:
            errors.append(f"{where}: writing.n must be {extra['writing']}")
        for f in ("task", "modelAnswer"):
            if not nonempty(w.get(f)):
                errors.append(f"{where}: writing needs '{f}'")
        if not isinstance(w.get("criteria"), list) or not w.get("criteria"):
            errors.append(f"{where}: writing needs a 'criteria' list")
    if extra.get("speaking"):
        sp = part.get("speaking") or {}
        for f in ("task", "modelAnswer"):
            if not nonempty(sp.get(f)):
                errors.append(f"{where}: speaking needs '{f}'")
        for f in ("prompts", "phrases"):
            if not isinstance(sp.get(f), list) or not sp.get(f):
                errors.append(f"{where}: speaking needs a '{f}' list")


def check_test(path, errors):
    test = load(path, errors)
    if test is None:
        return
    for f in ("id", "title"):
        if not nonempty(test.get(f)):
            errors.append(f"{path}: missing '{f}'")
    sections = {s.get("id"): s for s in test.get("sections", [])}
    order = []
    for sid, _, _, _ in LAYOUT:
        if sid not in order:
            order.append(sid)
    if [s.get("id") for s in test.get("sections", [])] != order:
        errors.append(f"{path}: sections must be exactly {order} in this order")
    for sid in order:
        sec = sections.get(sid)
        if sec is None:
            continue
        if not nonempty(sec.get("title")) or not isinstance(sec.get("minutes"), (int, float)):
            errors.append(f"{path}: section {sid} needs 'title' and numeric 'minutes'")
        want = [pid for s, pid, _, _ in LAYOUT if s == sid]
        if [p.get("id") for p in sec.get("parts", [])] != want:
            errors.append(f"{path}: section {sid} must have parts {want} in this order")
        parts = {p.get("id"): p for p in sec.get("parts", [])}
        for s, pid, items_spec, extra in LAYOUT:
            if s == sid and pid in parts:
                check_part(f"{path}: {pid}", parts[pid], items_spec, extra, errors)


def check_tests(errors):
    if not os.path.isdir(TESTS_DIR):
        return
    files = sorted(f for f in os.listdir(TESTS_DIR) if re.fullmatch(r"test-\d+\.json", f))
    for f in files:
        check_test(os.path.join(TESTS_DIR, f), errors)
    index_path = os.path.join(TESTS_DIR, "index.json")
    index = load(index_path, errors) if os.path.isfile(index_path) else None
    if index is not None:
        listed = [t.get("file") for t in index.get("tests", [])]
        if sorted(listed) != files:
            errors.append(f"{index_path}: must list exactly the test files {files}")


def main():
    # Check a single data file while writing it:
    #   python3 scripts/validate.py data/tests/test-1.json
    #   python3 scripts/validate.py --part some-cards.json   (deck without minimum sizes)
    args = sys.argv[1:]
    if args:
        errors = []
        part_mode = args[0] == "--part"
        for path in args[1:] if part_mode else args:
            if part_mode or os.path.basename(path).startswith("deck"):
                check_deck(errors, path, enforce_minimums=not part_mode)
            else:
                check_test(path, errors)
        for e in errors:
            print(f"  - {e}")
        print(f"{len(errors)} problem(s)." if errors else "All checks passed.")
        return 1 if errors else 0

    files = tracked_files()
    errors = []
    check_forbidden(files, errors)
    check_json(files, errors)
    check_links(files, errors)
    check_deck(errors)
    check_tests(errors)

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
