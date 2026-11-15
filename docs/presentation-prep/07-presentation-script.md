# G. Presentation script and demo walkthrough

A narrative you can speak, built only on what the app actually does. Speak as
a developer who built it: specific, calm, and upfront about limits. Avoid
words like "revolutionary", "AI-powered", "accurate", "diagnoses" or "ready
for astronauts".

The existing three-minute demo table is in [docs/DEMO.md](../DEMO.md). This
document expands it into a 5-minute and a 10-minute talk.

---

## The 15 topics

### 1. Project introduction

- **Explain:** Name, team (Quan Le, Jayden Nguyen), challenge, one-line idea.
- **Evidence:** README; the running app.
- **Script:** "We're Quan and Jayden. For the Health Monitoring Software
  challenge we built AstroLife: a desktop check-in for astronauts with a real
  fingertip sensor, where NASA's own hazard research decides what's asked and
  every prompt is traced back to a source."
- **Visual:** Welcome screen.
- **Transition:** "Let's start with the problem."

### 2. Problem and motivation

- **Explain:** Long missions, communication delay, many risks, self-assessment.
- **Concepts:** NASA's five hazards.
- **Script:** "On a Mars mission you can't just call a flight surgeon: messages
  take many minutes each way. NASA groups the dangers into five hazards:
  radiation, isolation, distance, gravity and closed environments. They cause
  dozens of specific risks, from bone loss to sleep problems. An astronaut
  needs a routine way to check themselves and know when to escalate."
- **Visual:** The five hazards (Hazards page).
- **Transition:** "Here's what the challenge asked for."

### 3. NASA challenge objectives

- **Explain:** Visual tool; self-assessment; guidance; clickable body idea;
  when to escalate.
- **Script:** "The challenge asks for a visual tool that helps astronauts
  assess their own health and gives guidance on improvements, and suggests a
  clickable human figure. It also asks when a result needs the crew or flight
  surgeon. Those became our requirements."
- **Visual:** Requirement table from [01-project-overview.md](01-project-overview.md#33-requirement--feature--implementation--evidence).
- **Transition:** "Our solution is one guided flow."

### 4. AstroLife's solution

- **Explain:** Mission → hazards → safety → questions → measure → findings →
  Compass → actions.
- **Script:** "AstroLife takes you from 'which mission am I on' to 'what should
  I do next'. You pick a mission, NASA's hazards order the check-in, a safety
  screen catches emergencies, adaptive questions and a sensor reading gather
  data, and rules produce prompts you can act on."
- **Visual:** Journey table from README.
- **Transition:** "Let me show the main features."

### 5. Main features

- **Explain:** Adaptive questions; three-report capture; findings with steps
  and trace; Health Compass; NASA data tab; offline history.
- **Script:** "Five things to look for: the questions adapt and explain
  themselves; the sensor reading is saved only when three reports agree; each
  prompt has simple steps and when to involve the crew; the 3D Health Compass;
  and real NASA radiation data with provenance."
- **Transition:** "First, the hardware."

### 6. Hardware architecture

- **Concepts:** PPG, I²C, USB serial, firmware estimate vs validated measurement.
- **Evidence:** `main.cpp`, `docs/HARDWARE.md` verification table.
- **Script:** "The MAX30102 shines red and infrared light into the fingertip.
  The ESP32 reads it over I²C at 25 samples a second, runs Maxim's algorithm on
  a four-second window, and refuses windows with no contact, clipping or bad
  timing. It streams raw samples and a report over USB. We verified the
  transport on the real board. We haven't compared accuracy with a medical
  oximeter, so we call them estimates."
- **Visual:** Hardware flow diagram ([02 §4.1](02-architecture-handbook.md#41-end-to-end-flow)); the board.
- **Transition:** "On the computer, three programs work together."

### 7. Software architecture

- **Concepts:** Child process, JSON lines, IPC allowlist, separation of concerns.
- **Script:** "Electron starts our Python backend as a private child process.
  They talk in JSON lines over stdin and stdout, so there's no server and no
  port. Python owns everything that has to be correct: parsing, validation,
  rules, NASA data, storage. React only guides and displays. The interface
  never scores anything."
- **Visual:** Level 2 diagram ([02 §8](02-architecture-handbook.md#level-2-undergraduate-engineering-preferred)).
- **Transition:** "Now, where NASA data comes in."

### 8. NASA data and API integration

- **Concepts:** Encoded research vs API data; validation; checksums; provenance.
- **Evidence:** `nasa_sources.json`, `hrr_evidence.json`, `nasa/radlab.py`.
- **Script:** "Two kinds. We encoded NASA's HRP hazards and risks and the Human
  Research Roadmap into validated data: five hazards, 13 topics, 23 NASA
  sources, with a Roadmap evidence report for every topic. And we use NASA
  APIs: the OSDR RadLab API for radiation readings, validated row by row with
  Pydantic, cleaned with pandas, stored with SHA-256 checksums, and
  retrievable live; plus one cached study from the OSDR Biological Data API."
- **Visual:** Data architecture diagram ([data-sources §10](data-sources-and-api-architecture.md#data-architecture-diagram)).
- **Transition:** "Here's how that turns into decisions."

### 9. Search and decision-making

- **Concepts:** Lookup by id (no search engine); rules; decision vs explanation data.
- **Script:** "There's no search engine and no AI. NASA knowledge is looked up
  by topic id. NASA's hazard order for your mission sets the question order. A
  fixed, versioned Python rules engine sets the prompt levels using general
  MedlinePlus references, because NASA doesn't publish universal vital-sign
  cutoffs. Then each finding is traced to its NASA hazard, risk and evidence
  report. A test proves changing the mission changes the questions but never
  the finding."
- **Visual:** Decision diagram ([05 §2.1](05-nasa-knowledge-search-and-decisions.md#21-the-real-pipeline)).
- **Transition:** "The interface makes that visible."

### 10. Interactive UI/UX

- **Concepts:** XState, uPlot, React Three Fiber.
- **Script:** "Navigation and questions are state machines, so the flow is
  deterministic: same answers, same questions. The live pulse is drawn with
  uPlot outside React so it stays smooth. The Health Compass is a 3D anatomy
  model; hovering gives a summary, clicking a region shows your values,
  prompts and NASA research for it."
- **Visual:** Compass screenshot.
- **Transition:** "How we built and tested it."

### 11. Development and testing

- **Evidence:** 197 Python, 144 interface tests; CI workflow.
- **Script:** "We built it in phases: firmware, a Qt monitor, the Electron
  interface, the real sensor stream, the question engine, NASA pipelines, and
  installers. 197 Python tests and 144 interface tests pass. The important
  ones are behavioural: one bad NASA row rejects the response; a damaged cache
  is refused; simulated data never reaches trends."
- **Transition:** "Let me show it."

### 12. Live demonstration

See the walkthrough below.

### 13. Results and limitations

- **Script:** "What works: the full flow offline, the real sensor path, NASA
  pipelines, traceable prompts, installers. What doesn't yet: sensor accuracy
  isn't validated; we collect pulse and oxygen but not blood pressure,
  glucose or temperature; trends are a table, not a chart; the RadLab unit
  isn't stated by the API; storage isn't encrypted. It is not a medical
  device."
- **Transition:** "Here's what we'd do next."

### 14. Future improvements

- **Script:** "Validate the sensor against a reference oximeter. Add
  temperature and blood pressure with cited references. Chart trends. Add more
  OSDR studies per topic. Encrypt storage and add a view for the crew medical
  officer. And, for real use, have flight surgeons review every rule."
- **Transition:** "To close."

### 15. Final impact and conclusion

- **Script:** "AstroLife shows that a self-check can be both adaptive and
  explainable. NASA's research decides what matters for your mission, a real
  sensor adds measurements, and every prompt says why, with a source, and
  admits what it doesn't know. Thank you."

---

## 5-minute structure

| Time | Topic | Notes |
|---|---|---|
| 0:00–0:25 | 1 + 2 | Intro and problem in one breath |
| 0:25–0:45 | 3 + 4 | Challenge → one guided flow |
| 0:45–3:15 | 12 | Live demo, short path (below) |
| 3:15–3:50 | 7 + 9 | Architecture and "no AI, rules + NASA trace" |
| 3:50–4:20 | 8 | NASA data: encoded research + RadLab API |
| 4:20–4:45 | 13 | Limits, plainly |
| 4:45–5:00 | 15 | Close |

## 10-minute structure

| Time | Topic |
|---|---|
| 0:00–0:30 | 1 Introduction |
| 0:30–1:15 | 2 Problem |
| 1:15–1:45 | 3 Challenge |
| 1:45–2:15 | 4 + 5 Solution and features |
| 2:15–3:00 | 6 Hardware |
| 3:00–3:45 | 7 Software architecture |
| 3:45–4:30 | 8 NASA data |
| 4:30–5:15 | 9 Decisions |
| 5:15–5:45 | 10 UI |
| 5:45–8:30 | 12 Live demo, full path |
| 8:30–9:00 | 11 Development and testing |
| 9:00–9:30 | 13 Limitations |
| 9:30–9:50 | 14 Future |
| 9:50–10:00 | 15 Close |

---

## Live demo walkthrough

### Before you start

1. Plug in the ESP32; close PlatformIO's serial monitor (only one program can hold the port).
2. Close any leftover AstroLife or Electron process.
3. `cd desktop && npm run demo` (fresh database in the temp folder).
4. Rehearse a finger-on-sensor reading; time how long "Saved measurement" takes. **This path has not been verified in the React app yet.**
5. Decide whether you will press "Retrieve again from NASA" (needs internet; the bundled data works offline).
6. Large window (screens checked at 1440 × 888).

### Short path (2.5 minutes)

| Do | Say |
|---|---|
| Begin → Mars → Continue | "The mission changes what matters most." |
| Day 120, In transit, EVA yes → Save | |
| Hazards page: point at order and plan | "For Mars, radiation and distance come first; because I logged an EVA, its questions come first. That's NASA's hazard order driving the check-in." |
| Start check-in → None of these | "Emergencies first, same on every mission." |
| EVA "No"; press `2` through; sleep "Poorly" | "'Poorly' adds follow-up questions; each card says why." |
| Back → "Okay" | "Change it and the follow-ups disappear. State machine, not AI." |
| Finish; exercise "Missed" → Measurement | |
| Finger on sensor → "Saved measurement" → remove finger | "Saved once three reports agree. Live values withdraw when I lift my finger; the saved reading stays." |
| Use saved reading → Findings; open one trace | "Rules produce prompts with steps and when to involve the crew. Here's the trace: mission, NASA hazard, Roadmap risk, my answer, the rule, the follow-up." |
| Health Compass → Muscles → NASA research | "Real NASA OSDR study, labelled mouse data, not mine." |
| NASA data tab → `MSL-RAD-Surface` → provenance | "Real RadLab API data, validated and checksummed, labelled historical, not my exposure." |

### Full path additions (10-minute version)

- Monitor tab: show the raw PPG wave and the `no_contact` state.
- Tick a safety item to show the urgent panel, then "Change my answers".
- Mark an action done; quit; `npm run demo:resume`; Open Mission Dashboard; History tab.
- Press "Retrieve again from NASA" if online.

### If the hardware fails

Use **Run simulated stream** and say: "The sensor isn't giving a reading, so
this is our built-in simulated stream. It goes through the same parser as the
real firmware, and it's labelled simulated everywhere, including history, and
excluded from trends." If Electron will not start: `python software/run.py`
opens the Qt fallback that still reads the sensor.

### Suggested slides or screenshots

| Slide | Content |
|---|---|
| 1 | Title, team, challenge |
| 2 | Five hazards + the self-assessment problem |
| 3 | The journey (8 steps) |
| 4 | Hardware flow diagram + board photo |
| 5 | Level 2 architecture diagram |
| 6 | NASA data architecture (decision vs explanation) |
| 7 | Limits and next steps |

(The Space Apps submission checklist mentions a seven-slide presentation or a
30-second video; neither exists in the repository yet.)

## How I would explain this during the presentation

"I'll show you the whole check-in for a Mars mission in about two and a half
minutes, then explain how it works and where NASA data comes in, and finish
with what it can't do yet."
