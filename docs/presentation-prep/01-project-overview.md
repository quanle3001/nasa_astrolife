# A. Project overview

What AstroLife is, why it exists, how it answers the NASA Space Apps challenge,
and where it falls short. Read [README.md](README.md) first for the ten facts
that correct common assumptions.

---

## 1. What AstroLife is

AstroLife is a **desktop application plus a fingertip sensor** that walks an
astronaut through a structured health check-in and tells them what to follow
up on, with a reason and a NASA source for every prompt.

It has three parts:

| Part | What it physically is | Job |
|---|---|---|
| Sensor | An ESP32 microcontroller wired to a MAX30102 optical pulse sensor, running C++ firmware | Shines red and infrared light into a fingertip, estimates heart rate and blood oxygen (SpO₂), sends text over USB |
| Backend | A Python program running in the background | Reads the sensor, validates every input, runs the assessment rules, retrieves and analyses NASA radiation data, saves everything in a local SQLite database |
| Interface | A React + TypeScript app inside an Electron desktop window | Guides the astronaut screen by screen and shows results, a live pulse chart, a 3D body and NASA data |

### What inspired it

The NASA Space Apps 2026 challenge "Create Health Monitoring Software for
Astronauts on Space Missions" asks for a visual tool that helps astronauts
assess their own health and gives guidance. On long missions (lunar, Mars) a
crew cannot rely on a quick consultation with a ground flight surgeon: the
communication delay to Mars is many minutes each way. NASA's Human Research
Program organises the dangers of spaceflight into **five hazards** (space
radiation, isolation and confinement, distance from Earth, altered gravity,
hostile and closed environments) and dozens of specific **risks** (bone loss,
vision changes, sleep loss, and so on). AstroLife turns that structure into a
routine check-in.

### Who it is for

The intended user is an astronaut doing a routine self-check. The secondary
audience is the crew medical officer, who receives the escalations ("When to
involve the crew"). In this hackathon it is demonstrated by students, not used
by astronauts.

### What problems it addresses

| Problem in long-duration spaceflight | What AstroLife does about it |
|---|---|
| Many risks, limited attention | Orders NASA's hazards for the chosen mission and asks about the most relevant topics first |
| Some symptoms are emergencies | A nine-item safety screen runs first, and any "yes" shows emergency guidance immediately |
| Self-assessment without a doctor present | Plain-language prompts with a level (Act now / Medical review / Follow up), simple self-care steps and an escalation step |
| Need to trust the output | Every prompt shows a six-step trace: mission → NASA hazard → NASA risk → your observation → rule → follow-up |
| No network on a spacecraft | Runs fully offline; NASA data is bundled with checksums |
| Sensors can be wrong | A reading is saved only when three firmware reports agree; poor or missing readings are labelled, never shown as normal |

### What differentiates it from a fitness tracker

| A fitness tracker | AstroLife |
|---|---|
| Shows numbers | Combines numbers with structured questions about symptoms, sleep, mood, balance and exercise |
| Same for everyone | Question order follows the mission's NASA hazard order (LEO, lunar, Mars) and mission context (recent EVA, gravity transition) |
| Proprietary algorithm, opaque scores | Deterministic, versioned rules; each prompt cites a source and shows which answer or measurement caused it |
| Often says "you are healthy" | Never says that; unreported topics are "not assessed", and a reading inside a reference "did not trigger a prompt" |
| Cloud sync | Nothing leaves the computer |

### The role of each ingredient

| Ingredient | Role |
|---|---|
| Hardware | The one objective measurement: pulse and oxygen estimates from a real sensor |
| Software | Guides, validates, assesses with rules, stores, explains |
| NASA research | Decides which topics matter for which mission, in what order; supplies the evidence and countermeasures shown with every prompt |
| NASA data (RadLab, OSDR) | Real NASA datasets shown with full provenance, as historical context, never as the astronaut's own data |
| Interactive visualization | A 3D body (Health Compass) to see where each prompt belongs; live pulse chart; radiation chart |

---

## 2. Three pitches

**A. One sentence.**
AstroLife is an offline desktop check-in for astronauts that uses NASA's
spaceflight hazards to decide what to ask, a fingertip sensor to measure pulse
and oxygen, and transparent rules to say what to follow up on, with a NASA
source behind every prompt.

**B. Thirty seconds.**
Astronauts on long missions have to check their own health without a doctor
in the room. AstroLife starts by asking which mission you are on: low Earth
orbit, the Moon or Mars. It uses NASA's five hazards of human spaceflight to
order the check-in, screens for emergencies first, then asks adaptive
questions and takes a pulse and oxygen reading from our ESP32 sensor. Python
rules turn that into prompts like "follow up on short sleep", each with simple
steps, when to involve the crew, and a trace back to NASA's Human Research
Program evidence. It runs offline and stores nothing outside the computer.

**C. Two minutes (for judges).**
The challenge asks for a visual tool that helps astronauts assess their own
health and get guidance. We built AstroLife as one guided flow from "which
mission am I on" to "what should I do next".

First, the astronaut chooses a mission and adds context such as mission day
and a recent spacewalk. NASA's Human Research Program defines five hazards of
spaceflight. We encoded those, plus thirteen health topics linked to NASA risk
pages and Human Research Roadmap evidence reports, into validated data files.
For a Mars mission, radiation and distance come first; for the space station,
altered gravity does. That order is what sets the order of the questions.

Second, a safety screen asks about emergency signs. Any "yes" shows emergency
guidance immediately. Then the check-in asks one question at a time. It is a
state machine, so follow-up questions appear and disappear deterministically,
and each card says why it is asked.

Third, the astronaut rests a fingertip on our sensor: an ESP32 with a MAX30102.
The firmware estimates heart rate and SpO₂ and refuses windows with no
contact, clipping or bad timing. The app saves a reading only after three
reports agree.

Fourth, deterministic Python rules, not AI, turn the answers and the reading
into prompts. Each has a level, self-care steps restated from NASA and
MedlinePlus, and when to involve the crew. Each prompt is traced from the
mission's hazard through the NASA risk to the astronaut's own answer and the
rule that fired.

Finally, a 3D Health Compass shows where each prompt belongs on the body, and
a NASA data tab shows real radiation readings from NASA's OSDR RadLab API with
full provenance, clearly labelled as historical instrument data, not the
astronaut's exposure.

It is an educational prototype. The sensor is not validated against medical
equipment and the app does not diagnose. What we are proud of is that every
output is explainable and honest about what it does not know.

---

## 3. NASA Space Apps challenge alignment

The challenge wording below is quoted from the team's own record in
[docs/CHALLENGE_REVIEW.md](../CHALLENGE_REVIEW.md). The audit did not re-fetch
the official challenge page; check the current page on the Space Apps site
before the presentation in case the wording changed.

### 3.1 What the challenge asks

> Create a visual tool that helps astronauts assess their own health during
> space missions and provides guidance on treatments and health improvements.

The challenge also suggests a clickable human figure, asks teams to consider
which measurements can be done in space, why an exam is needed, how
spaceflight hazards affect health indicators, when a result needs the crew or
a flight surgeon, and what actions prevent a critical condition. Optional
considerations include different environments, routine prompts,
gamification, dynamic charts, colour coding and simple instructions. Example
indicators named in the team's record include heart rate, SpO₂, blood
pressure, blood sugar and temperature.

### 3.2 Problems NASA identifies, and which ones AstroLife addresses

| NASA problem area | Addressed? | How |
|---|---|---|
| Five hazards (radiation, isolation, distance, gravity, environment) | Yes, as context | Ordered per mission in `software/resources/mission_context.json`; drive question order |
| Crew must self-assess far from Earth | Yes | Guided check-in with escalation guidance |
| Specific risks (sleep, behavioural health, SANS, vestibular, bone, muscle, cardiovascular, immune, nutrition, EVA, radiation, hypoxia, medical readiness) | Partly | Asked about through questions; only pulse and SpO₂ are measured |
| Radiation exposure | Context only | Historical RadLab data; the app cannot measure the astronaut's dose and says so |

### 3.3 Requirement → feature → implementation → evidence

| Challenge requirement | AstroLife feature | Technical implementation | Evidence | Status |
|---|---|---|---|---|
| Visual tool | Guided Electron app, live pulse chart, 3D body, colour-coded indicators, radiation chart | React 19, uPlot, React Three Fiber, `open-anatomy-3d` | 144 interface tests; screens in `desktop/src/components` | Implemented and verified |
| Gather health indicators | Pulse + SpO₂ from sensor; sleep hours, exercise, mood, symptoms from questions | Firmware `main.cpp`; `inputs/sensor_serial.py`; `question_registry.json` (27 questions) | `test_sensor_serial.py`, `test_questionnaire.py`; hardware check 2026-11-14/15 | Partially implemented (no blood pressure, blood sugar, temperature) |
| Astronauts assess their own health | Findings with level and reason; indicator colour status | `analysis/rules.py` `assess()`, `indicator_status()` | `test_rules.py` | Implemented and verified |
| Guidance on treatment and improvement | "What you can do now" and "When to involve the crew" per prompt; follow-up actions | `care_guidance.json` + `care_guidance.py`; `AppStateStore.complete_session` | `test_rules.py`, `guidance.test.tsx` | Implemented and verified (general guidance, not prescriptions) |
| Clickable human figure | Health Compass 3D anatomy, region pins, hover summaries | `components/compass/anatomy-viewer.tsx`, `regions.ts` | `regions.test.ts` | Implemented (3D rendering not covered by jsdom tests) |
| Which measurements can be done in space | Fingertip optical sensor; catalog "monitoring" notes per risk | `nasa_sources.json` `monitoring` field | Catalog validation in `test_catalog.py` | Implemented |
| Why an exam is needed | "Why this question" on every card | `evidence_ids`, `parent` in registry; `questions-page.tsx` | `flow-pages.test.tsx` | Implemented and verified |
| How hazards affect indicators | Hazards page with plan; trace per finding | `assessment_plan.build_plan`, `build_trace` | `test_nasa_functional.py` | Implemented and verified |
| When to involve crew / flight surgeon | Three levels; SpO₂ ≤ 88 % urgent, ≤ 92 % review; emergency symptoms urgent | `rules.py` constants and `OBSERVATION_RULES` | `test_rules.py` | Implemented and verified |
| Actions to prevent a critical condition | NASA countermeasures and self-care steps as tracked actions | `nasa_sources.json` countermeasures; `followup_actions` table | `test_app_state.py` | Implemented and verified |
| Different environments (optional) | LEO, lunar, Mars / deep space with phases | `mission_context.json`, `mission_context.py` | `test_nasa_functional.py` | Implemented and verified |
| Routine prompts (optional) | Dashboard shows whether today's check-in is done | `dashboard-page.tsx` | Interface tests | Partially implemented (no timed reminders) |
| Dynamic charts over time (optional) | Live PPG chart; RadLab chart; history trend table | uPlot; `history_trends.py` | `ppg-chart.test.tsx`, `test_history.py` | Partially implemented (trends are a table, not a chart) |
| Colour coding (optional) | Teal / amber / red with text labels | `indicator_status()` | `test_rules.py` | Implemented and verified |
| Gamification (optional) | — | — | — | Not implemented |
| Use NASA data | RadLab API, OSDR study, HRP hazards/risks, HRR evidence | `software/astrotip/nasa/`, `resources/` | `test_radlab.py`, `test_osdr.py`, `test_nasa_functional.py` | Implemented and verified (details in [data-sources-and-api-architecture.md](data-sources-and-api-architecture.md)) |
| Use the provided ESP32 | MAX30102 → firmware → serial → app | `electrical/firmware/...`, `sensor_serial.py` | `docs/HARDWARE.md` verification table | Implemented; transport verified, finger-on reading in React not yet verified |

### 3.4 Where NASA data contributes

1. **Choosing and ordering topics.** Mission → NASA hazard order → question order and check-in plan.
2. **Explaining every finding.** NASA risk title, risk page and Roadmap evidence report attached to each prompt.
3. **Countermeasures.** NASA-sourced countermeasure text in the catalog and the self-care steps.
4. **Historical context.** RadLab radiation readings and one OSDR mouse-muscle study, labelled as not the astronaut's data.

NASA data does **not** set the numeric thresholds. That distinction is
explained in document E.

### 3.5 Practical benefits on a long mission (if it were developed further)

- A consistent routine that does not depend on a ground connection.
- Emergencies surfaced first, every time.
- A record of what was observed, when and why a prompt fired, which the crew
  medical officer can audit.
- Honest labelling: missing data is "unassessed", simulated data is labelled,
  historical NASA data is never shown as personal exposure.

### 3.6 Strength of evidence per requirement

| Strong evidence | Weaker evidence |
|---|---|
| Rules, question engine, traceability, NASA data pipelines, storage, offline operation (all tested) | Sensor accuracy (never compared with a reference device) |
| Mission-dependent question order (tested on both Python and TypeScript sides) | Finger-on-sensor reading in the React app (not yet run) |
| RadLab retrieval, validation, cache integrity (tested, including failure paths) | Packaged installers (workflow and scripts exist; this audit could not confirm a CI run) |
| Simulated data labelling (tested) | 3D Compass rendering (not reachable by jsdom tests) |

---

## 4. Gaps, limitations and future work (prompt part 18)

### What AstroLife does well

- One coherent flow covering gather → assess → explain → act → follow up.
- Strict separation of responsibilities: the interface never scores anything.
- Every health statement has a source; every finding has a trace.
- Defensive data handling: Pydantic validation, checksums, bounded requests,
  explicit "unavailable" instead of invented data.
- Honest labelling of simulated, manual, missing and historical data.
- Offline by design.

### Fully functional (in software)

Mission setup, hazards and plan, safety screen, adaptive questions with
back-and-change, measurement capture (sensor, simulated, manual, or none with
a reason), findings with trace, Health Compass, follow-up actions, dashboard,
history list and trend table, Radiation Explorer with live refresh, Report
concern, resume after restart, keyboard shortcuts, pause-motion control.

### Depends on simulated or sample data

- The **simulated sensor stream** (72 bpm, 98 %, `inputs/simulated_reader.py`)
  is a demo fallback, labelled everywhere and excluded from trends.
- The **RadLab dataset** is one fixed day (2023-01-01), not current data.
- `npm run demo` uses a throwaway database in the system temp folder.

### Missing from challenge alignment

- Blood pressure, blood sugar, body temperature.
- Camera or image input (stub files are empty).
- Trend chart over time (table only), timed reminders, gamification.
- A crew or flight-surgeon view.

### Is NASA data meaningfully integrated?

Yes, in two specific ways: NASA hazard and risk knowledge **changes which
questions are asked and in what order**, and NASA evidence **is attached to
every finding**. NASA datasets (RadLab, OSDR) are integrated with real
retrieval, validation and analysis, but they are **context**: no rule reads
them. Say this precisely; do not claim NASA data computes a health score.

### Experimental

- Sensor estimates (firmware algorithm, engineering quality gates).
- The 3D Compass on machines without good WebGL (falls back to region buttons).

### Technical concerns

- One unexplained Electron crash was seen once in an automated run, on a
  Compass 3D-to-2D switch that has since been removed (`docs/DEMO.md`).
- A leftover Electron process can slow relaunch; close it before a demo.
- The React app has been run on macOS only; Windows is covered only by the
  CI workflow, which this audit could not confirm has run.
- Python and TypeScript both implement question eligibility; shared test
  vectors (`question_vectors.json`, 13 cases) keep them aligned, but it is
  still duplicated logic.

### Hardware and measurement limits

- Fingertip PPG is sensitive to motion, pressure, cold fingers, ambient light
  and skin pigmentation. The app states this on screen.
- The contact threshold (infrared > 50,000 counts) is an engineering value
  that may need adjusting per module.
- The Maxim algorithm assumes 25 samples per second; windows outside 20–30 Hz
  are rejected rather than corrected.

### Privacy and security

- Data stays on the computer in one SQLite file, **not encrypted**. The app
  says so.
- Electron is sandboxed with context isolation; the renderer has no Node
  access; IPC is an allowlist; external links open only for `*.nasa.gov`.
- The backend opens no network port. It talks to Electron over stdin/stdout.
- Outbound traffic: only the optional RadLab refresh, which sends a fixed
  query and a generic User-Agent, no personal data.

### What actual astronaut use would require

Clinical validation of the sensor against reference equipment; flight-surgeon
review of every rule and threshold; mission-specific limits set by the medical
team; encrypted, access-controlled storage; integration with spacecraft
medical systems and crew procedures; human-factors testing with crews;
regulatory review (it would be a medical device).

### Reasonable future improvements

1. Validate the sensor against a reference pulse oximeter and record results.
2. Manual entry for temperature and blood pressure with cited references.
3. A trend chart once several real readings exist.
4. More OSDR studies per topic (bone, immune) via `osdr_studies.json`.
5. Verified RadLab unit once RadLab's documentation is reachable.
6. Encrypted storage and a crew-medical-officer review view.

---

## How I would explain this during the presentation

"AstroLife is our answer to the health monitoring challenge. It is a desktop
app plus an ESP32 fingertip sensor. The big idea is that NASA's own hazard and
risk research decides what the check-in asks first for each mission, and our
rules then turn the astronaut's answers and pulse-oxygen reading into prompts
that always say why and cite a source. It runs offline. It is a prototype: it
does not diagnose, the sensor is not clinically validated, and we are upfront
about which challenge indicators we did not collect."
