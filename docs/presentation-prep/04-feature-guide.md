# D. Feature-by-feature guide

Every user-facing feature found in the repository, in the order an astronaut
meets it, followed by five demonstration scenarios. For each feature: what the
user sees and does, why it exists, what runs behind the UI, where the data
comes from, what the output means, how it fails, and how to demo it.

Screens live in `desktop/src/components/flow/` (guided steps) and
`desktop/src/components/pages/` (dashboard tabs). Bridge methods are in
`software/astrotip/bridge/service.py`.

---

## Feature index

| # | Feature | Status |
|---|---|---|
| 1 | Welcome / intro | Implemented and verified |
| 2 | Mission selection | Implemented and verified |
| 3 | Mission context | Implemented and verified |
| 4 | NASA hazards and check-in plan | Implemented and verified |
| 5 | Safety screen | Implemented and verified |
| 6 | Adaptive questions | Implemented and verified |
| 7 | Measurement (sensor, simulated, manual, none) | Implemented; finger-on-sensor reading in React not yet verified |
| 8 | Findings with evidence trace and colour-coded indicators | Implemented and verified |
| 9 | Health Compass (3D body) | Implemented; 3D rendering not covered by automated tests |
| 10 | Action Center (follow-ups) | Implemented and verified |
| 11 | Dashboard | Implemented and verified |
| 12 | Monitor tab (live sensor, quick assessment) | Implemented and verified |
| 13 | NASA data tab (Radiation Explorer, OSDR study, evidence) | Implemented and verified |
| 14 | History and trends | Implemented and verified (table, not chart) |
| 15 | Report concern (every screen) | Implemented and verified |
| 16 | Resume after restart | Implemented and verified |
| 17 | Keyboard shortcuts, pause motion | Implemented and verified |
| 18 | Demo mode (`npm run demo`) | Implemented |
| 19 | Legacy Qt monitor (`software/run.py`) | Implemented (fallback) |
| — | Camera / photo input | **Planned but not implemented** (empty files) |
| — | Search box / knowledge search | **Not implemented** |
| — | Export / report file | **Not implemented** |
| — | Settings screen | **Not implemented** (environment variables only) |

---

## 1. Welcome / intro

- **Sees:** A space scene with the decorative NASA astronaut, "Begin Mission
  Assessment", and for a returning astronaut "Open Mission Dashboard".
- **Does:** Begin, resume an interrupted check-in, or go to the dashboard.
- **Why:** Every launch starts here by design, so the purpose is clear.
- **Behind the UI:** `App.tsx` calls `currentSession()`; the flow machine's
  `LOADED` event marks the user as onboarded if a mission and a submitted
  check-in exist; `RESUME` jumps to safety, questions or measure.
- **Data:** SQLite (`session.current`).
- **Failure:** If the backend fails to start, a startup error is shown; the
  astronaut model needs WebGL and is decoration only.
- **Demo:** Point out the honesty disclaimer and "Begin".

## 2. Mission selection

- **Sees:** Three mission cards (low Earth orbit, lunar, Mars / deep space)
  with cached NASA imagery and short clips.
- **Does:** Picks one (radio group, keyboard accessible).
- **Why:** Hazards differ by mission; the challenge lists different
  environments as a consideration.
- **Behind the UI:** `mission-selector.tsx` → `saveMission(profile)` →
  `mission.save` → `validate_profile` → `mission_profile` table.
- **Data:** Mission labels from the bridge; imagery from
  `software/assets/nasa/` (NASA Image and Video Library, decorative only).
- **Failure:** Unknown environment → "Choose a supported mission."
- **Demo:** Choose Mars. "The mission changes what matters most."

## 3. Mission context

- **Sees:** Phase (transit, orbit, surface, return as applicable), mission
  day, recent EVA yes/no, recent gravity transition yes/no.
- **Why:** A recent EVA should bring EVA questions to the front.
- **Behind the UI:** `context-page.tsx` → `mission.save`;
  `validate_profile` checks the phase belongs to the mission, mission day is
  a whole number 1–2000 or blank, yes/no fields are booleans.
- **Output meaning:** Changes which topics are promoted (`promote_if` in the
  registry) and whether the EVA question exists.
- **Failure:** Readable validation messages.
- **Demo:** Day 120, In transit, recent EVA yes.

## 4. NASA hazards and check-in plan

- **Sees:** All five NASA hazards, ordered for the mission, emphasised ones
  with a NASA rationale; expandable details with NASA links and Roadmap
  evidence reports; the plan: topic order with a reason each ("Moved to the
  front because your mission context reports: eva recent"; "Linked to the
  NASA hazard 'Space radiation', presented first for a Mars mission").
- **Why:** Answers the challenge question "how do spaceflight hazards affect
  these indicators?" and makes the order of the check-in explainable.
- **Behind the UI:** `hazards-page.tsx` → `planMission()` → `mission.plan` →
  `assessment_plan.build_plan(catalog, mission_context, registry, indicators, hrr, profile)`.
- **Data:** `nasa_sources.json`, `mission_context.json`,
  `question_registry.json`, `health_indicators.json`, `hrr_evidence.json`.
- **Output meaning:** Presentation and question order, not risk. The
  catalog's `priority_note` says the order is not a NASA ranking.
- **Failure:** No mission saved → "Choose a mission to see its assessment plan."
- **Demo:** Open "Space radiation"; show the link to the NASA page and the
  Roadmap evidence report.

## 5. Safety screen

- **Sees:** Nine urgent items on one screen: chest pain; difficulty
  breathing; fainting; new confusion; sudden vision loss; sudden dizziness,
  weakness or vision change; new symptoms after an EVA or pressure change;
  active radiation alert; active cabin air/CO₂ alert. Plus "None of these".
- **Why:** Emergencies must be caught before anything else, the same on every
  mission.
- **Behind the UI:** `safety-page.tsx` sends `SET_ANSWERS` to the
  questionnaire machine, then `previewSession` → `session.preview` →
  `checkin_from_answers(require_complete=False)` → `rules.assess`. If the level
  is `urgent`, the urgent panel appears.
- **Output meaning:** "Act now" with the emergency action ("Contact the crew
  medical officer or emergency medical service now… Do not wait for another
  sensor reading or this app"). Radiation and cabin alerts have their own
  procedure text.
- **Failure:** The registry validation refuses to start if the safety screen
  does not cover every urgent rule.
- **Demo:** Tick "None of these". Optionally tick one to show the urgent panel,
  then "Change my answers".

## 6. Adaptive questions

- **Sees:** One card at a time with options (yes/no, choice, 3-point scale,
  number), "Not sure" and "Skip" where allowed, and "Why this question".
- **Does:** Answers with the mouse or number keys; goes back and changes.
- **Why:** Gathers the indicators a fingertip sensor cannot (sleep, mood,
  balance, vision, exercise, illness) without overwhelming the user.
- **Behind the UI:** `questions-page.tsx` → `ANSWER` →
  `applyAnswer` → `questionnaireView` (in `questions/engine.ts`) recomputes
  visible questions from `show_if`, removes answers to questions that no
  longer apply and reports them in `dropped`. Progress is saved with
  `session.save`; Python re-validates with `registry.validate_answer` and
  `applicable_answers`.
- **Data:** 27 questions in 8 topics (`question_registry.json`, version
  `2026.11.1`); 6 have a `show_if`.
- **Output meaning:** Nothing is scored here.
- **Failure:** Invalid answers rejected by Python; required questions block
  submission.
- **Demo:** Sleep "Poorly" adds two follow-ups (hours, duration); go back,
  change to "Okay", follow-ups disappear with a note.

## 7. Measurement

- **Sees:** Live optical pulse chart, heart rate and SpO₂ values, progress
  toward three agreeing reports, "How to take a good fingertip reading", what
  the two numbers mean, then "Saved measurement". Alternatives: "Run simulated
  stream"; "Enter values from another approved instrument"; "A stable reading
  could not be obtained"; "The sensor is not available".
- **Why:** The challenge asks for measurable indicators; the ESP32 is part of
  the judging.
- **Behind the UI:** Port chosen → `sensor.connect` → `SerialReader` thread.
  Each report → `OpticalSignalQuality.evaluate` → `ReadingStability.update` →
  when `steady`, a `CheckIn` with the medians → `_capture_session_measurement`
  writes `measurement_json` once. "Measure again" → `session.remeasure`.
  Submit → `session.submit` with `{use: "sensor"}`, `{use: "manual", ...}` or
  `{use: "none", reason}`.
- **Data:** Firmware estimates; manual entry is stored as `manual`; simulated
  as `simulated`.
- **Output meaning:** A saved reading means three consecutive firmware
  reports agreed (HR within max(6 bpm, 8 %), SpO₂ within 2 points, over at
  least 1.8 s). It is not proof of accuracy.
- **Failure:** No contact → "No reading" and values withdrawn; port busy →
  visible error; no reading → must pick a reason, stored as unassessed.
- **Demo:** Finger on, wait for "Saved measurement", remove finger (values
  withdraw, saved reading stays), continue.

## 8. Findings

- **Sees:** Overall summary; each prompt with its level (Act now / Medical
  review / Follow up), reason, "What you can do now", "When to involve the
  crew", sources; colour-coded indicator chips (teal, amber, red, always with
  text); measurement quality; what was reported; history trends; NASA
  context; the six-step trace (mission → hazard → NASA risk → your
  observation → rule → follow-up) with "Audit details".
- **Why:** Self-assessment with guidance, explained and auditable.
- **Behind the UI:** `session.submit` returns `assessment`,
  `evidence_trace`, `actions`; `findings-page.tsx` and `guidance.tsx` render.
- **Data:** Rules output; `care_guidance.json`; `nasa_sources.json`;
  `hrr_evidence.json`.
- **Output meaning:** Prompts are not diagnoses; "info" means nothing
  reported, not "healthy".
- **Failure:** A submitted result is final; there is no way back into its
  answers (by design).
- **Demo:** Open the trace for the sleep prompt; read the Roadmap risk.

## 9. Health Compass (3D body)

- **Sees:** A 3D anatomy model (male or female model), toggleable systems,
  labelled pins (Brain, Eyes, Heart, Lungs, Nutrition, Immune, Muscles,
  Bones), a list of 10 regions as buttons; hover card; region panel.
- **Does:** Drag to rotate, scroll to zoom, hover, click a region, "Reset view".
- **Why:** The challenge suggests a clickable human figure.
- **Behind the UI:** `anatomy-viewer.tsx` loads `open-anatomy-3d` GLBs with
  `useGLTF`, removes skin and reproductive meshes, maps a clicked mesh to a
  region with `regionForStructure`, flies the camera with drei `Bounds`.
  `compass-page.tsx` builds the panel from the current result, actions and
  knowledge: measurements for that region (`heart_rate` → Heart,
  `spo2` → Lungs), prompts for its `conditionIds`, NASA risk text, Roadmap
  reports, the OSDR study for Muscles, actions.
- **Output meaning:** A highlighted region means "you have a prompt to review
  here", never "this structure is diseased" (comment in `regions.ts`).
- **Failure:** No WebGL → message; region buttons still work.
- **Demo:** Muscles → "Show NASA research" → OSDR mouse study card
  ("Animal study · not human data · not a measurement of you").

## 10. Action Center

- **Sees:** Follow-up actions grouped by prompt; checkboxes; "Reassess".
- **Behind the UI:** Created by `AppStateStore.complete_session` from each
  non-info finding's self-care steps and crew steps; `actions.update` sets
  `open`/`done`.
- **Demo:** Tick one action; the dashboard count updates.

## 11. Dashboard

- **Sees:** Mission, latest check-in summary, whether today's check-in is
  done, live sensor values, open actions, buttons to start a check-in, change
  mission or view the last result.
- **Behind the UI:** `dashboard-page.tsx` from `session.current`.
- **Failure:** No reminders or schedule; it only shows status.

## 12. Monitor tab

- **Sees:** Port picker, connect/disconnect, sensor dock (state in plain
  words), live PPG chart, diagnostics (signal status, rate, firmware
  version), and a quick assessment of a stable live reading that can be saved.
- **Behind the UI:** `sensor-page.tsx`; `ports.list`, `sensor.connect`,
  `sensor.simulate`; stable readings run `rules.assess` live (`_assess` keeps
  them in memory until `health.save`).
- **Demo:** Useful to show the raw waveform and the `no_contact` state.

## 13. NASA data tab

- **Sees:** Radiation Explorer: instruments for your mission environment
  first ("for comparison, not your mission" for others), a day chart,
  statistics, plain statements, provenance panel (request URL, retrieval time,
  row count, SHA-256 checksums, pipeline versions, transformation steps),
  "Retrieve again from NASA". Space-biology study card (OSD-104). Every health
  topic with its NASA risk and Roadmap evidence reports.
- **Behind the UI:** `radiation-explorer.tsx` → `getRadLab(false)` →
  `RadLabService.cached()`; refresh → worker thread → `RadLabService.refresh()`
  → event `nasa.radlab.updated`. OSDR card from `knowledge.osdr_studies`.
- **Output meaning:** Historical instrument readings. Not the astronaut's
  exposure, not live telemetry, not a dose total. Unit "not stated by the API".
- **Failure:** Offline → verified cache with the reason; damaged cache →
  refused; nothing cached → "unavailable".
- **Demo:** Select `MSL-RAD-Surface` (Curiosity rover) for a Mars mission;
  open provenance.

## 14. History and trends

- **Sees:** Saved check-ins newest first with priority labels and source
  badges; a trend table for heart rate and SpO₂ (latest, previous, change,
  range, mean, count) with simulated entries excluded and counted.
- **Behind the UI:** `history.list` → `HistoryStore.list_entries` (read-only
  SQLite); `history.trends` → `summarize_history` (pandas).
- **Output meaning:** Descriptive only; no baseline, no interpretation.
- **Gap:** No chart over time.

## 15. Report concern

- **Sees:** A button on every screen; a symptom form; an assessment; "Return
  to where I was".
- **Behind the UI:** `REPORT_URGENT` → `urgent` state; `health.assess` on the
  form's `CheckIn`; optional `health.save`; `CLOSE_URGENT` → history state.

## 16. Resume after restart

Answers, position and the captured measurement are saved in
`assessment_sessions`. On relaunch the intro offers to resume at safety,
questions or measure.

## 17. Keyboard shortcuts and motion

`Ctrl/Cmd+1…5` tabs, `1–9` answers, `Ctrl/Cmd+Enter` review a concern,
`Ctrl/Cmd+S` save, `?` list, `Esc` close (`lib/shortcuts.ts`). "Pause
motion" and the OS reduced-motion setting stop decorative animation.

## 18. Demo mode

`npm run demo` builds and starts with a fresh database in the system temp
folder; `npm run demo:resume` reopens it (`desktop/scripts/demo.mjs`).

## 19. Legacy Qt monitor

`python software/run.py` opens the PySide6 window with Sensor, Check-in,
Assessment and History tabs using the same Python modules. Fallback if
Electron fails.

---

## Five demonstration scenarios

Prerequisites for all: app running (`npm run demo` recommended), no internet
needed unless noted.

### Scenario 1: Measure vital signs

| | |
|---|---|
| Objective | Get a pulse and SpO₂ reading into a check-in |
| Prerequisites | ESP32 with `astro-life-ppg-2` on USB; PlatformIO monitor closed. Fallback: simulated stream |
| Input | Fingertip on the sensor |
| UI actions | Measurement step → pick port → connect → rest finger → wait for "Saved measurement" → remove finger → "Use saved reading and see my findings" |
| Modules | Firmware → `SerialReader`/`ReportParser` → `OpticalSignalQuality` → `ReadingStability` → `BridgeService._capture_session_measurement` → `AppStateStore.save_measurement` → `session.submit` → `rules.assess` |
| Data source | Sensor (or simulated, labelled) |
| Logic | Firmware gates; parser validation; 3-report agreement; median; references from MedlinePlus |
| Result | Heart rate and SpO₂ chips colour coded with their reference text; prompts if outside references |
| Value | An objective input, never silently stale or invented |
| Say | "It only saves when three reports agree. Watch: I remove my finger, the live values disappear, but the saved reading for this check-in stays." |

### Scenario 2: Mission-driven self-assessment

| | |
|---|---|
| Objective | Complete a check-in that adapts to a Mars mission with a recent EVA |
| Input | Mars, day 120, in transit, EVA yes; safety "None"; sleep "Poorly", 5 h; exercise "Missed" |
| UI actions | Mission → Context → Hazards → Safety → Questions → Measurement → Findings |
| Modules | `validate_profile`, `build_plan`, `questionnaire-machine`, `checkin_from_answers`, `assess`, `build_trace` |
| Data sources | `mission_context.json` (hazard order), `question_registry.json`, `nasa_sources.json`, `hrr_evidence.json`, `care_guidance.json` |
| Logic | EVA topic promoted; radiation/distance topics before gravity; rules raise `watch` for sleep, fitness, bone |
| Result | Three "Follow up" prompts with self-care steps, crew step and trace to NASA risks (sleep → Roadmap 100; fitness → 180; bone → 77) |
| Value | Shows NASA research shaping the check-in and explaining the result |
| Say | "Because I logged an EVA, it asks about that first. The sleep prompt traces to NASA's sleep-loss risk and its evidence report." |

### Scenario 3: Explore the radiation data

| | |
|---|---|
| Objective | See real NASA data with provenance, in context |
| Prerequisites | None; internet only for "Retrieve again" |
| UI actions | Dashboard → NASA data → select `MSL-RAD-Surface` → open provenance → optional "Retrieve again from NASA" |
| Modules | `RadLabService.cached/refresh`, `radlab.read_rows`/`clean`, `radlab_analysis.analyze` |
| Data source | NASA OSDR RadLab API, 2023-01-01, absorbed dose rate |
| Logic | Pydantic validation; pandas dedupe and grouping; NumPy statistics, gaps and excursions |
| Result | Chart, statistics, plain statements, checksums, "not your exposure" label |
| Value | Mission-relevant context and trustworthy data handling |
| Say | "This is the Curiosity rover's radiation detector on one day. It's labelled historical. It tells you nothing about your own dose, and the app says so." |

### Scenario 4: Use the Health Compass

| | |
|---|---|
| Objective | Understand where prompts belong on the body |
| Prerequisites | A submitted check-in (scenario 2) |
| UI actions | Explore the Health Compass → hover Heart → click Muscles → Show NASA research |
| Modules | `anatomy-viewer.tsx`, `regions.ts`, `compass-page.tsx`, `osdr-study.tsx` |
| Data sources | Latest result, actions, catalog, HRR, `osdr_OSD-104.json` |
| Result | Hover summary; region panel with prompts, steps, NASA research and the OSD-104 mouse muscle study labelled "not human data" |
| Say | "Each region shows what was recorded, the prompts and the NASA research. Here's a real NASA space-biology study, clearly marked as mouse data." |

### Scenario 5: Review history and follow-ups after a restart

| | |
|---|---|
| Objective | Show persistence and follow-up tracking |
| UI actions | Mark one action done → quit → `npm run demo:resume` → Open Mission Dashboard → History |
| Modules | `AppStateStore`, `HistoryStore`, `summarize_history` |
| Data source | Local SQLite |
| Result | Mission, latest findings and action states intact; trend table (simulated entries excluded and counted) |
| Say | "Everything is stored locally and offline. It opens on the intro, and my mission, findings and follow-ups are still here." |

## How I would explain this during the presentation

"The app is one guided path: mission, context, hazards, safety screen,
adaptive questions, measurement, findings, Health Compass and actions. Behind
every screen is a named backend method, and the medical decisions happen in
exactly one place, the Python rules. The dashboard tabs let you go back to the
live monitor, the 3D Compass, NASA data and history at any time."
