# TODO

Tracks the build described in `requirements.txt`.

## 0. Decisions to confirm (before building)

- [ ] Confirm the exam is the **Deutsch-Test für den Beruf B2 (DTB B2)** and not "telc Deutsch B2+ Beruf"
- [ ] Confirm hosting on **GitHub Pages** (the project sits under `gitlab_projects`; GitLab Pages would need a `.gitlab-ci.yml` instead)
- [ ] Decide who proofreads the German (native speaker or teacher)

## 1. Research the official format

- [x] Download official telc DTB B2 practice material into `reference/official/` (git-ignored, private use only; see `reference/official/INDEX.md`)
- [x] Find the current official DTB B2 model test (`reference/official/telc-modelltest/`)
- [ ] Find the exam handbook (scoring and pass criteria)
- [ ] Decide how audio for the site's own tests is produced (pre-generated MP3s vs. speech synthesis)
- [ ] Link to the official telc audio from the site (do not copy it)
- [ ] Record subtests, parts, task types, item counts, timing, scoring, and pass criteria
- [ ] Note the date checked and anything that could not be verified

## 2. Project skeleton

- [ ] `index.html` landing page with navigation to the three sections
- [ ] Shared CSS (responsive down to 360 px, light/dark mode, focus styles)
- [ ] Shared JS (navigation, data loading with error message, `localStorage` helpers)
- [x] `git init`, `.gitignore`
- [x] CI pipeline: `scripts/validate.py` on every pull request (`.github/workflows/ci.yml`)
- [x] Deploy pipeline: publish to GitHub Pages on push to `main` (`.github/workflows/pages.yml`)
- [ ] Extend `scripts/validate.py` with deck and test schema checks once the schemas exist

## 3. Exam overview page

- [ ] Subtests and parts as officially defined
- [ ] Timing, scoring, pass criteria
- [ ] Preparation tips
- [ ] "Confirm with the official provider" note and last-checked date

## 4. Flashcards

- [ ] Define and document the card schema (stable `id`, type, topic, grammar pattern, translation, example)
- [ ] Write the deck: 250+ cards, at least 20 per topic, at least 25 per card type
- [ ] Simplified SM-2 scheduler with Again / Hard / Good / Easy and interval previews
- [ ] Progress saved in `localStorage` by card `id`
- [ ] Daily new-card limit setting
- [ ] Flip (click, tap, space) and rating keys 1–4
- [ ] Filters by topic and card type
- [ ] Progress view (due, new, learning, mature, total)
- [ ] Reset progress (with confirmation), export/import progress as JSON
- [ ] Anki `.txt` export generated in the browser from the JSON deck

## 5. Model tests

- [ ] Define and document the test schema
- [ ] Test engine: render parts, select answers, check, score, explanations
- [ ] Save last result per test in `localStorage`
- [ ] Listening: hidden transcript, speech-synthesis playback (`de-DE`), fallback message, optional audio file support
- [ ] Writing and speaking: prompts, model answers, self-assessment criteria (not auto-scored)
- [ ] Optional countdown timer per subtest
- [ ] Write test set 1 (original content)
- [ ] Write test set 2
- [ ] Write test set 3
- [ ] Write test set 4

## 6. Verification

- [ ] Script check: all JSON parses and matches the schemas (unique ids, required fields, one correct answer per item)
- [ ] Deck meets size and distribution minimums
- [ ] Each test has the official number of parts and items
- [ ] All links and data paths work when served from a subpath
- [ ] Manual check on a phone-sized screen, in light and dark mode, keyboard only
- [ ] Anki import of the exported file works in the real Anki app
- [ ] German proofread

## 7. Documentation and publishing

- [ ] `README.md`: local preview, schemas, adding cards and tests, Anki import, GitHub Pages steps
- [ ] Check `gh` is installed and logged in (`gh auth status`)
- [ ] Confirm the repository name and that it should be public
- [ ] Merge the finished site into `main` through a pull request
- [ ] Create the GitHub repository from this folder and push (`gh repo create <repo-name> --public --source=. --remote=origin --push`)
- [ ] Set Pages source to GitHub Actions (Settings → Pages)
- [ ] Check the live site at `username.github.io/repo-name/`
