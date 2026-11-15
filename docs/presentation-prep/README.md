# AstroLife presentation prep

A study set for presenting AstroLife to NASA Space Apps judges, instructors and
technical audiences. It was written on 2026-11-15 from a read-only audit of the
repository at commit `a610183` (branch `codex/desktop-installers`). The audit
read the source code first and the existing docs second. Where they disagree,
these documents follow the code and say so.

Nothing in the application, firmware, configuration, tests or workflows was
changed to write them.

## Read in this order

| # | Document | Covers (prompt parts) | Use it for |
|---|---|---|---|
| A | [01-project-overview.md](01-project-overview.md) | Purpose, pitches, challenge alignment, gaps (2, 18) | Knowing what AstroLife is and is not |
| B | [02-architecture-handbook.md](02-architecture-handbook.md) | Architecture, run lifecycle, modules, hardware, rules, UI, storage, three-level explanation (3, 7, 8, 9, 10, 14) | Understanding the whole system |
| C | [03-technology-stack.md](03-technology-stack.md) | Every language, framework, library and tool (4) | "Why did you use X?" |
| D | [04-feature-guide.md](04-feature-guide.md) | Screen-by-screen feature audit and five demo scenarios (5, 13) | Demonstrating the app |
| E | [05-nasa-knowledge-search-and-decisions.md](05-nasa-knowledge-search-and-decisions.md) | What the "search" really is, how NASA data meets decisions, three traced scenarios (6) | The hardest judge questions |
| — | [data-sources-and-api-architecture.md](data-sources-and-api-architecture.md) | Every data source and API, pipelines, code walkthrough, value assessment (additional task) | "What NASA data did you use and how?" |
| F | [06-development-and-testing.md](06-development-and-testing.md) | Development phases, tests and what they prove, packaging and releases (11, 12) | "How did you build and test it?" |
| G | [07-presentation-script.md](07-presentation-script.md) | 15-topic narrative, 5- and 10-minute versions, live demo steps (15) | Rehearsing |
| H | [08-qa-and-glossary.md](08-qa-and-glossary.md) | 30 judge questions with answers, glossary, ranked study list (16, 17) | Final preparation |

## The ten facts that matter most

These came out of the audit. Several of them correct assumptions in the
preparation prompt, so learn them before anything else.

1. **There is no search engine.** No keyword, full-text, SQLite FTS, vector,
   embedding or RAG search exists anywhere in the app. NASA knowledge lives in
   curated, validated JSON files. The app looks entries up by their identifier
   (for example the health topic `sleep`). The only call to a NASA *search*
   endpoint is in a developer script, `software/scripts/fetch_nasa_media.py`,
   which uses the NASA Image and Video Library `/search` API to fetch the
   metadata of decorative mission photos. See document E.
2. **There is no AI or machine learning in the app.** The assessment is a
   fixed Python rules engine (`software/astrotip/analysis/rules.py`, version
   `2026.11.2`). `software/astrotip/analysis/local_ai.py` is an empty file and
   `software/requirements-ml.txt` is optional and unused.
3. **NASA data shapes *what is asked and how it is explained*, not the medical
   thresholds.** The mission's NASA hazard order sets the question order and
   the check-in plan. NASA risk pages and Human Research Roadmap evidence
   reports explain every finding. The numeric thresholds (SpO₂ 88 % and 92 %,
   resting heart rate 60–100 bpm) come from MedlinePlus, not NASA.
   `rules.assess` does not receive the mission at all, and a test proves that a
   different mission gives the same findings.
4. **One NASA API is live in the app**: the NASA OSDR **RadLab** API, behind
   the "Retrieve again from NASA" button. The OSDR **Biological Data API** is
   only called by a developer refresh command; the app ships its cached record.
   The HRP and Roadmap pages are web pages that were read and encoded by hand,
   not APIs.
5. **Heart rate and SpO₂ are computed on the ESP32**, by the Maxim algorithm
   shipped with the SparkFun MAX3010x library. The desktop app parses,
   checks and displays them. It never computes a vital sign from the drawn
   waveform.
6. **A reading is saved only when three firmware reports agree**
   (`analysis/reading_stability.py`), and the saved value is their median. The
   renderer cannot send heart rate or SpO₂ for a sensor check-in; the backend
   uses its own captured value.
7. **Not verified**: heart rate and SpO₂ in the React app with a finger on the
   sensor (transport, timing and the no-contact path are verified on the real
   board); accuracy against a reference oximeter; the RadLab unit.
8. **Not implemented**, though files or docs suggest otherwise: camera or image
   input (`inputs/camera_capture.py`, `inputs/image_input.py`,
   `ui/pages/photos.py` are empty), blood pressure, blood sugar and temperature,
   a trend *chart* (trends are a table), reminders, gamification.
9. **Everything runs offline on one computer.** One SQLite file, unencrypted.
   The only network traffic is the optional RadLab refresh and NASA links the
   user chooses to open in their browser.
10. **Tests at this audit:** 197 Python tests passed (2 opt-in live NASA tests
    skipped), 144 Vitest interface tests in 24 files passed, TypeScript
    typecheck clean, 5 packaging tests passed. These prove software behaviour,
    not medical accuracy.

## Evidence labels used in every document

| Label | Meaning |
|---|---|
| **Implemented and verified** | Code exists and a test or a recorded hardware check exercises it |
| **Implemented but not fully tested** | Code exists; part of its behaviour has no test or hardware check |
| **Partially implemented** | Some of the described capability exists |
| **Research/reference only** | Information was read and encoded or linked; no live integration |
| **Planned but not implemented** | Mentioned in docs or stub files; no working code |

## How to check a claim yourself

```bash
QT_QPA_PLATFORM=offscreen .venv/bin/python -m unittest discover -s software/tests
```

```bash
cd desktop && npm run typecheck && npm test && npm run test:packaging
```

```bash
grep -rn "def assess" software/astrotip/analysis/rules.py
```
