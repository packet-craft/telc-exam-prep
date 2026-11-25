# TODO

Tracks the build described in `requirements.txt`.

## 0. Decisions to confirm (before building)

- [ ] Confirm the exam is the **Deutsch-Test für den Beruf B2 (DTB B2)** and not "telc Deutsch B2+ Beruf"
- [ ] Confirm hosting on **GitHub Pages** (the project sits under `gitlab_projects`; GitLab Pages would need a `.gitlab-ci.yml` instead)
- [ ] Decide who proofreads the German (native speaker or teacher)

## 1. Research the official format

- [x] Download official telc DTB B2 practice material into `reference/official/` (git-ignored, private use only; see `reference/official/INDEX.md`)
- [x] Find the current official DTB B2 model test (`reference/official/telc-modelltest/`)
- [x] Scoring and pass criteria taken from the official practice test (pp. 47–49)
- [x] Listening audio: browser speech synthesis by default, MP3 per clip when the data names one
- [x] Generate MP3s for all listening clips with Piper neural voices (`scripts/generate_audio.py`)
- [x] Official-audio page: links to telc's free practice tests and a player for the visitor's own downloaded files (`official.html`)
- [ ] Optional: more voice variety (every male speaker currently has the same voice, and every female speaker too)
- [x] Link to the official telc audio from the site (do not copy it)
- [x] Record subtests, parts, task types, item counts, timing, scoring, and pass criteria
- [x] Note the date checked and anything that could not be verified

## 2. Project skeleton

- [x] `index.html` landing page with navigation to the three sections
- [x] Shared CSS (responsive down to 360 px, light/dark mode, focus styles)
- [x] Shared JS (navigation, data loading with error message, `localStorage` helpers)
- [x] `git init`, `.gitignore`
- [x] CI pipeline: `scripts/validate.py` on every pull request (`.github/workflows/ci.yml`)
- [x] Deploy pipeline: publish to GitHub Pages on push to `main` (`.github/workflows/pages.yml`)
- [x] Extend `scripts/validate.py` with deck and test schema checks once the schemas exist

## 3. Exam overview page

- [x] Subtests and parts as officially defined
- [x] Timing, scoring, pass criteria
- [x] Preparation tips
- [x] "Confirm with the official provider" note and last-checked date

## 4. Flashcards

- [x] Define and document the card schema (stable `id`, type, topic, grammar pattern, translation, example)
- [x] Write the deck: 250+ cards, at least 20 per topic, at least 25 per card type
- [x] Simplified SM-2 scheduler with Again / Hard / Good / Easy and interval previews
- [x] Progress saved in `localStorage` by card `id`
- [x] Daily new-card limit setting
- [x] Flip (click, tap, space) and rating keys 1–4
- [x] Filters by topic and card type
- [x] Progress view (due, new, learning, mature, total)
- [x] Reset progress (with confirmation), export/import progress as JSON
- [x] Anki `.txt` export generated in the browser from the JSON deck

## 5. Model tests

- [x] Define and document the test schema
- [x] Test engine: render parts, select answers, check, score, explanations
- [x] Save last result per test in `localStorage`
- [x] Listening: hidden transcript, speech-synthesis playback (`de-DE`), fallback message, optional audio file support
- [x] Writing and speaking: prompts, model answers, self-assessment criteria (not auto-scored)
- [x] Optional countdown timer per subtest
- [x] Write test set 1 (original content)
- [x] Write test set 2
- [x] Write test set 3
- [x] Write test set 4

## 6. Verification

- [x] Script check: all JSON parses and matches the schemas (unique ids, required fields, one correct answer per item)
- [x] Deck meets size and distribution minimums
- [x] Each test has the official number of parts and items
- [x] All links and data paths work when served from a subpath
- [ ] Manual check on a phone-sized screen, in light and dark mode, keyboard only
- [ ] Anki import of the exported file works in the real Anki app
- [ ] German proofread

## 7. Documentation and publishing

- [x] `README.md`: local preview, schemas, adding cards and tests, Anki import, GitHub Pages steps
- [x] Check `gh` is installed and logged in (`gh auth status`)
- [x] Confirm the repository name and that it should be public
- [x] Merge the finished site into `main` through a pull request
- [x] Create the GitHub repository from this folder and push (`gh repo create <repo-name> --public --source=. --remote=origin --push`)
- [x] Set Pages source to GitHub Actions (Settings → Pages)
- [x] Check the live site at `packet-craft.github.io/telc-exam-prep/`
- [ ] Turn on "Keep my email addresses private" in GitHub settings, so merges made on github.com do not show a personal email
