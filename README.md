# Beruf B2 exam prep

A static practice site for the **Deutsch-Test für den Beruf B2** (DTB B2): an exam overview, a spaced-repetition flashcard trainer, and eight model tests. Plain HTML, CSS and JavaScript; no build step, no backend. Progress is stored in the browser (`localStorage`).

This is an unofficial study aid. All texts and questions are original. Exam details follow the official telc practice test (Übungstest 1, 2022); always confirm current details with the exam provider.

## File tree

```
index.html              Home page
overview.html           Exam overview (format, timing, scoring, tips)
flashcards.html         Flashcard trainer
tests.html              Model tests (list, and one test via ?test=test-1)
official.html           How to get telc's official recordings, and a player for them
assets/css/style.css    All styles (light and dark mode)
assets/js/common.js     Shared helpers: navigation, data loading, storage
assets/js/srs.js        Spaced-repetition scheduler (simplified SM-2)
assets/js/flashcards.js Flashcard page logic and Anki export
assets/js/tests.js      Test rendering, scoring, timer, listening playback
assets/js/official.js   Player for recordings the visitor downloaded
assets/audio/           Generated listening recordings, one folder per test
assets/img/favicon.svg  Logo mark (browser tab icon)
data/deck.json          Flashcard deck
data/tests/index.json   List of test files
data/tests/test-N.json  One model test each
scripts/validate.py     Data and link checks (run by CI)
scripts/generate_audio.py  Generates the listening recordings
.github/workflows/      CI and GitHub Pages deployment
```

## Local preview

The pages load their data with `fetch()`, which browsers block when a file is opened directly. Start a local server in the project folder:

```
python3 -m http.server 8000
```

Then open http://localhost:8000/.

## Checking your changes

```
python3 scripts/validate.py                          # everything (same as CI)
python3 scripts/validate.py data/tests/test-5.json   # one test file
```

## Adding flashcards

Edit `data/deck.json` and add objects to `cards`:

```json
{
  "id": "vp-001",
  "type": "verb-prep",
  "topic": "bewerbung",
  "front": "sich bewerben",
  "back": "sich bewerben um + Akk.",
  "translation": "to apply for",
  "example": "Ich bewerbe mich um die Stelle als Buchhalterin.",
  "exampleTranslation": "I am applying for the position of accountant."
}
```

| Field | Meaning |
|---|---|
| `id` | Unique and permanent. Saved progress is keyed by it, so never change or reuse an id. |
| `type` | A key of `types` in the deck file (see below). |
| `topic` | A key of `topics` in the deck file. |
| `front` | What the learner sees first: the bare word or phrase, without the grammar being tested. |
| `back` | The full pattern: preposition and case, object case, or article and plural. |
| `translation` | English meaning. |
| `example` | A German sentence using the pattern. |
| `exampleTranslation` | English translation of the example. |

Card types and what `back` shows:

| `type` | Content | `front` → `back` example |
|---|---|---|
| `verb-prep` | Verb with fixed preposition | `sich bewerben` → `sich bewerben um + Akk.` |
| `noun-prep` | Noun with fixed preposition | `die Teilnahme` → `die Teilnahme an + Dat.` |
| `adj-prep` | Adjective with fixed preposition | `zuständig` → `zuständig für + Akk.` |
| `verb-case` | Verb with dative and/or accusative object | `zustimmen` → `zustimmen + Dat.` |
| `reflexive` | Reflexive verb | `sich vorstellen` → `sich (Dat.) etwas vorstellen` |
| `nvv` | Nomen-Verb-Verbindung | `eine Entscheidung …` → `eine Entscheidung treffen` |
| `noun` | Noun with article and plural | `Vertrag` → `der Vertrag, die Verträge` |
| `connector` | Connector and its word order | `trotzdem` → `trotzdem + Verb direkt danach (Hauptsatz, Position 1)` |
| `prep-case` | Preposition and its case | `wegen` → `wegen + Gen.` |
| `phrase` | Set phrase for letters and discussions | `Ich wäre Ihnen dankbar, … Sie …` → the full phrase |

To add a topic or type, add it to `topics` or `types` at the top of the deck file. A new type also needs its question in `QUESTIONS` at the top of `assets/js/flashcards.js` (shown on the front of the card). CI requires at least 250 cards, 20 per topic and 25 per type.

## Adding a model test

1. Copy an existing `data/tests/test-N.json` to a new number and change its `id` and `title`.
2. Add it to `data/tests/index.json`.
3. Run `python3 scripts/validate.py`.

Every test follows the official layout: six sections, items numbered 1–58.

```json
{
  "id": "test-1",
  "title": "Model test 1",
  "sections": [
    { "id": "lesen", "title": "Lesen", "minutes": 45, "parts": [ /* parts */ ] }
  ]
}
```

| Section `id` | Minutes | Parts (`id`) | Items |
|---|---|---|---|
| `lesen` | 45 | `lesen-1` | 1–5 `match`, 8 options a–h |
| | | `lesen-2` | 6 `tf`, 7 `mc`, 8 `tf`, 9 `mc`; 2 text stimuli |
| | | `lesen-3` | 10–13 `match`, 6 options a–f, `allowNone`, exactly one answer `x` |
| | | `lesen-4` | 14–18 `mc`; 1 text stimulus |
| `lesen-schreiben` | 20 | `lesen-schreiben` | 19–20 `mc`; `writing` 21 |
| `hoeren` | 20 | `hoeren-1` | 22 `tf`, 23 `mc`, 24 `tf`, 25 `mc`, 26 `tf`, 27 `mc`; 3 audio stimuli |
| | | `hoeren-2` | 28–31 `match`, 6 options a–f; 4 audio stimuli |
| | | `hoeren-3` | 32–35 `mc`; 1 audio stimulus |
| | | `hoeren-4` | 36–40 `mc`; 5 audio stimuli |
| `hoeren-schreiben` | 5 | `hoeren-schreiben` | 41 `mc`; `notes` 42–45; 1 audio stimulus |
| `sprachbausteine-schreiben` | 35 | `sprachbausteine-1` | 46–51 `match`, 10 options a–j, `gapText` |
| | | `sprachbausteine-2` | 52–57 `mc`, `gapText` |
| | | `schreiben` | `writing` 58 |
| `sprechen` | 16 | `sprechen-1`, `sprechen-2`, `sprechen-3` | `speaking` |

A part can contain these fields; the page renders them in this order:

```json
{
  "id": "hoeren-1",
  "title": "Hören Teil 1",
  "goal": "Arbeitsabläufe, Probleme und Vorschläge verstehen",
  "instructions": "German task instructions shown to the learner.",

  "stimuli": [
    { "id": "t1", "kind": "text", "title": "Optional heading", "body": "Paragraph one.\n\nParagraph two." },
    { "id": "g1", "kind": "audio", "title": "Gespräch 1", "audio": null,
      "transcript": [
        { "speaker": "Frau Demir", "voice": "f", "text": "Guten Morgen, Herr Lang." },
        { "speaker": "Herr Lang", "voice": "m", "text": "Guten Morgen." }
      ] }
  ],

  "options": [ { "key": "a", "title": "Optional heading", "text": "Shared option for match items." } ],
  "allowNone": true,

  "gapText": "Text with numbered gaps like [[46]] and [[47]].",

  "items": [
    { "n": 22, "type": "tf", "stimulus": "g1", "prompt": "Statement.", "answer": true, "explanation": "Why (English)." },
    { "n": 23, "type": "mc", "stimulus": "g1", "prompt": "Sentence start or question",
      "options": { "a": "…", "b": "…", "c": "…" }, "answer": "b", "explanation": "Why (English)." },
    { "n": 1, "type": "match", "prompt": "Person or question to match.", "answer": "h", "explanation": "Why (English)." }
  ],

  "notes": [ { "n": 42, "label": "Name / Firma", "expected": "Herr Okafor, Firma Lindner Bau" } ],

  "writing": { "n": 21, "task": "Task text.", "points": ["Point to cover"], "wordHint": "ca. 120 Wörter",
               "modelAnswer": "Full model answer.", "criteria": ["Self-check question (English)"] },

  "speaking": { "task": "Task text.", "prompts": ["Topic or question"], "phrases": ["Useful German phrase"],
                "modelAnswer": "Sample answer.", "criteria": ["Self-check question (English)"] }
}
```

Notes:

- `stimulus` on an item places it under that text or audio clip. Items without it are listed after the stimuli.
- A `match` answer is the `key` of one of the part's `options`, or `"x"` when `allowNone` is true and nothing fits. No option may be the answer to two items.
- `tf` answers are `true` (richtig) or `false` (falsch).
- `explanation` is shown after checking; write it in English.
- Lines in a text `body` are separated by `\n`; a blank line (`\n\n`) starts a new paragraph.

### Listening audio

Each audio stimulus has an `audio` field with the path of its MP3 (`assets/audio/<test>/<part>-<stimulus>.mp3`). The recordings shipped with the site are generated from the transcripts with [Piper](https://github.com/OHF-Voice/piper1-gpl), an offline text-to-speech engine, using one male and one female German voice (both published under CC0).

After you add a test or change a transcript, generate the recordings (needs Python 3.9+ and `ffmpeg`):

```
python3 -m venv .venv && .venv/bin/pip install piper-tts
.venv/bin/python -m piper.download_voices --data-dir .voices de_DE-thorsten-high de_DE-kerstin-medium
.venv/bin/python scripts/generate_audio.py --voices-dir .voices           # new clips only
.venv/bin/python scripts/generate_audio.py --voices-dir .voices --force   # regenerate all
```

The script writes the MP3s and sets the `audio` fields. `--dry-run` shows how dates, phone numbers and abbreviations will be spoken. To use your own recordings instead, save them under the same file names.

If `audio` is `null` or the file cannot be loaded, the page falls back to the browser's built-in German voice, which sounds robotic on many devices.

### Scoring

The page scores what it can check automatically, with the official point values: 3 points per Lesen and Hören item (items 1–20 and 22–41, 60 points each) and 0.5 per Sprachbausteine item (46–57, 6 of the 60 Schreiben points). Writing, the phone note and speaking are self-assessed against model answers and are not included in the score.

## Importing the deck into Anki

1. On the Flashcards page, choose **Download for Anki**. This creates `beruf-b2-deck.txt` from the current deck.
2. In Anki: **File → Import**, select the file.
3. The file declares its own settings (tab-separated, HTML allowed, tags in the last column). Check that field 1 maps to **Front** and field 2 to **Back**, then import.

## Publishing on GitHub Pages

1. Create a repository and push this folder: `gh repo create <repo-name> --public --source=. --remote=origin --push`
2. In the repository: **Settings → Pages → Source: GitHub Actions**.
3. Push to `main` (or merge a pull request). The "Deploy to GitHub Pages" workflow publishes the site at `https://<username>.github.io/<repo-name>/`.

The workflow publishes only the site files. `README.md`, `TODO.md`, `requirements.txt`, `scripts/` and `.github/` are left out; edit the exclude list in `.github/workflows/pages.yml` to change that.
