# H. Technical Q&A and glossary

Thirty likely questions with answers you can speak in 30–60 seconds, follow-ups
for the technical ones, a glossary, and a ranked list of what to study.

---

## Part 1: Judge questions

### Project and relevance

**1. What problem does AstroLife solve?**
Astronauts on long missions need to check their own health without a doctor
in the room and know when to escalate. AstroLife gives them a structured
check-in: it screens for emergencies, asks the questions that matter most for
their mission, takes a pulse and oxygen reading, and turns that into prompts
with simple steps, when to involve the crew, and a NASA source. It is a
prototype for routine self-assessment, not a diagnostic tool.

**2. Why is it relevant to NASA?**
It is built on NASA's own framework: the Human Research Program's five hazards
and its risk pages, plus the Human Research Roadmap evidence. Those decide what
the check-in covers and explain every result. It also uses NASA OSDR APIs for
radiation and space-biology data, and it works offline, which matters far from
Earth.

**3. How is it different from a fitness tracker?**
A tracker shows numbers and often says you're fine. AstroLife combines a
measurement with structured symptom questions, adapts to the mission, cites a
source for every prompt, shows the chain from NASA hazard to the rule that
fired, and never says you're healthy: anything not reported is "not assessed".
And nothing leaves the computer.

**4. Who would use it?**
An astronaut doing a routine self-check, with escalations aimed at the crew
medical officer. Today it's a demonstrator for judges and students.

### Architecture

**5. How does the system work end to end?**
The ESP32 firmware estimates heart rate and SpO₂ and sends text over USB.
Electron starts our Python backend as a child process. Python reads the
sensor, validates everything, runs the rules, handles NASA data and stores it
in SQLite. React inside Electron shows the guided screens. They exchange JSON
lines over stdin and stdout. The UI never scores anything.
*Follow-up: why stdin/stdout instead of HTTP?* No network port to secure, no
port conflicts, and the backend dies with the app.

**6. Why a native desktop app?**
It must work offline, talk to a USB device and keep data local. A desktop app
does all three. Electron gave us a modern UI and WebGL for the 3D body;
installers make it clickable for users.

**7. Which languages and frameworks?**
C++ on the Arduino framework for the ESP32. Python with PySide6's event loop,
pyserial, pandas, NumPy and Pydantic for the backend. Electron, React 19,
TypeScript, Vite, Tailwind, XState, uPlot and React Three Fiber for the
interface. PyInstaller and electron-builder for installers.

**8. What's the architecture behind the UI?**
Two XState state machines: one for which screen you're on, one for which
question comes next. React components render what the backend returns.
Live pulse samples bypass React state and go into a typed-array ring buffer
drawn by uPlot. *Follow-up: why state machines?* Every transition is explicit
and testable, invalid combinations can't happen, and "Report concern" can
interrupt any step and return to it.

**9. How is it secured?**
Electron runs the page sandboxed with context isolation and no Node access.
The page can call only 23 named functions, each mapped to one backend method;
the main process checks which page sent the request. Navigation and new
windows are blocked; external links open only for `nasa.gov`. The backend
rejects unknown methods and fields and limits message size.

### Hardware

**10. How do hardware and software communicate?**
The MAX30102 talks to the ESP32 over I²C. The ESP32 sends text over USB serial
at 115,200 baud: about 25 `PPG` sample lines and one full report per second.
Python reads it on a background thread with pyserial and parses each line.

**11. How reliable are the sensor measurements?**
Unknown, and we say so. The firmware rejects windows without contact, with
clipping or with bad timing, and the app requires three agreeing reports
before saving. But we haven't compared it with a reference pulse oximeter.
Fingertip readings are also affected by motion, cold, pressure and skin
pigmentation. *Follow-up: what did you verify?* 1,500 consecutive samples at
25 Hz with no gaps, and the no-contact path in the app on the real board. A
finger-on reading in the React app still needs a rehearsal.

**12. Who computes heart rate and SpO₂?**
The ESP32, using Maxim's reference algorithm in the SparkFun library. The
desktop never computes a vital sign from the waveform; the chart's filter is
for display only.

**13. What happens if the finger slips or the cable is unplugged?**
Live values are withdrawn immediately and shown as "No reading". A reading
already saved for the check-in stays, so you can continue. On disconnect the
UI says so, and the simulated stream is available as a clearly labelled demo.

### NASA data

**14. What NASA data do you use?**
HRP hazard and risk pages and Human Research Roadmap evidence reports, encoded
as validated data; the OSDR RadLab API for radiation readings; one OSDR
Biological Data API study. NASA imagery and a NASA 3D astronaut are
decoration.

**15. Do you use NASA APIs in real time?**
One: RadLab, when you press "Retrieve again from NASA". It runs on a worker
thread; if NASA can't be reached, the verified cache is shown with the reason.
The OSDR study is retrieved by a developer command and cached. The HRP pages
aren't APIs; we read and encoded them.

**16. How does NASA information influence the recommendations?**
In two ways. The mission's NASA hazard order decides which topics are asked
first and why. And every prompt is traced to its NASA hazard, Roadmap risk and
evidence report, and many self-care steps cite NASA risk pages. It does not
set the numeric thresholds; those come from MedlinePlus.
*Follow-up: prove the mission doesn't change a finding.* `rules.assess` has no
mission parameter, and `test_changing_the_mission_changes_the_hazard_context_but_not_the_finding`
checks it.

**17. How do you know the NASA data is real and unaltered?**
The request URL, retrieval time, row count and SHA-256 checksums of the
response and of the data are stored and shown in a provenance panel. Every
row passes a Pydantic model; one bad row rejects the response. A changed
cache fails its checksum and is refused.

**18. What does the radiation data say about the astronaut?**
Nothing, and the app says that next to the chart. It's historical readings
from instruments like the Curiosity rover's RAD on one day in 2023. Not the
astronaut's exposure, not live, not a dose total, and the unit isn't stated
by the API.

### Search, AI and analysis

**19. How does the search engine work?**
There isn't one. NASA knowledge is curated JSON with ids, validated at
startup, and the app looks entries up by id, such as the `sleep` topic. We
chose that so every statement is human-checked and linked, and results are
deterministic and offline. The only search call in the repo is a developer
script that uses NASA's image search for decorative photos.

**20. Is any of it AI?**
No machine learning and no language model run in the app. The adaptiveness
comes from state machines and the assessment from a fixed rules engine with a
version number. AI coding assistants helped write code and docs during
development, under our review.
*Follow-up: why not ML?* There's no labelled astronaut dataset for this, and a
health prompt must be traceable to a rule and a source.

**21. How are health risks evaluated?**
A reported symptom maps to a health topic and a level, for example chest pain
is "Act now", dizziness is "Follow up". SpO₂ at or below 92 % is "Medical
review", at or below 88 % "Act now". Resting heart rate outside 60–100 bpm,
sleep under six hours or a missed exercise session give "Follow up". The most
severe level wins. These are prompt priorities, not risk scores or
probabilities.

**22. How do you prevent unsupported medical recommendations?**
Rules are fixed and versioned; nothing is generated. Every step and catalog
entry must have a source or the app won't start. Questions can't add new
cut-offs. Missing data is "not assessed". Urgent prompts show only the
emergency action. The "nothing triggered" summary says it's not a medical
clearance.

**23. What analysis uses pandas and NumPy?**
RadLab: deduplication, grouping by instrument, mean, median, percentiles,
standard deviation, gaps longer than three times the usual interval,
excursions above three times the instrument's median, hourly means. History:
latest, previous, change, range and mean of saved readings, excluding
simulated ones. All descriptive; nothing is interpreted.

### Data, offline, UI

**24. What happens without internet?**
Everything works. NASA knowledge and datasets are bundled and verified. Only
"Retrieve again from NASA" needs the network, and it falls back to the cache.

**25. How is data stored?**
One local SQLite file with four tables: check-ins, the mission profile,
sessions (so you can resume after a restart) and follow-up actions. Each
saved result keeps the rules version and knowledge review dates. Raw pulse
samples are never stored. It's not encrypted yet.

**26. How does the 3D visualization interact with the app?**
The Health Compass loads open anatomy models in React Three Fiber. When you
click a mesh, we map it to one of ten regions, and the panel shows that
region's recorded value, the prompts for its topics with their steps, NASA
research and the OSDR study for muscles, and actions. Skin and reproductive
structures are never rendered. Without WebGL the region buttons still work.

### Engineering and testing

**27. What were the biggest engineering challenges?**
Getting clean paired samples from the sensor (we fixed misaligned red/IR
channels); deduplicating a stale sample the USB adapter repeated at port
open; making sure a saved reading survives finger removal while live values
don't; RadLab quirks (a `+` that couldn't be encoded, no unit field,
documentation returning HTTP 500); and keeping Python and TypeScript question
logic identical with shared test vectors.

**28. How did you test the system?**
197 Python tests and 144 interface tests, all passing at our last run, plus
packaging launch tests, a script that starts the real backend, and one that
launches the packaged app. Hardware was checked manually on the real board.
No clinical or user testing.

**29. How does the installer work?**
PyInstaller freezes the Python backend into one executable; electron-builder
packages it with the UI into a DMG or a Windows Setup EXE with shortcuts. A
GitHub Actions workflow builds on native Mac and Windows runners, runs tests,
launches the packaged app to check it works, and uploads the installers as
artifacts. Publishing a release is manual.

### Limits and future

**30. What are the current limitations, and how could it become mission-ready?**
Not a medical device; sensor not validated; only pulse and oxygen measured;
trends are a table; RadLab unit unverified; storage unencrypted; React app run
on macOS only by us. To get closer to real use: validate the sensor against
reference equipment, have flight surgeons review and set the limits, add more
sensors, encrypt and access-control the data, integrate with crew medical
procedures, and test with crews.

---

## Part 2: Glossary

Format: **Term** — simple definition. *In AstroLife:* how we use it. *Example.*

### Software architecture

- **Architecture** — How a system is divided into parts and how they communicate. *In AstroLife:* firmware, Python backend, Electron shell, React UI. *Example:* "the UI never scores".
- **Separation of concerns** — Each part has one job. *In AstroLife:* rules only in `rules.py`. *Example:* the UI can't change a finding.
- **Child process** — A program started and owned by another. *In AstroLife:* Electron starts Python. *Example:* `spawn(command, args)` in `main.cjs`.
- **Protocol** — Agreed message format. *In AstroLife:* JSON lines, protocol version 2. *Example:* `{"id":7,"method":"session.submit"}`.
- **Event-driven** — Code reacts to events instead of polling. *In AstroLife:* `sensor.reading` events. *Example:* the UI updates when a report arrives.
- **Signals and slots** — Qt's event mechanism connecting an emitter to a handler, safe across threads. *In AstroLife:* `SerialReader.reading_received` → `BridgeService._sensor_reading`.
- **Thread** — A parallel path of execution. *In AstroLife:* serial reading, stdin reading, RadLab refresh.
- **Allowlist** — Only listed items are permitted. *In AstroLife:* 24 bridge methods, 23 IPC channels.
- **Determinism** — Same input, same output. *In AstroLife:* same answers → same questions → same findings.
- **Traceability** — Being able to show why an output happened. *In AstroLife:* `build_trace` and `traceability` ids.
- **Versioning** — Labelling a rule set or file so results can be reproduced. *In AstroLife:* `RULES_VERSION = "2026.11.2"`, registry `2026.11.1`.

### Desktop and UI

- **Electron** — Desktop apps from web technology. *In AstroLife:* the window and shell.
- **Main process / renderer** — Electron's privileged Node side vs the web page. *In AstroLife:* `main.cjs` vs React.
- **Preload script / contextBridge** — Exposes a controlled API to the page. *In AstroLife:* `window.astrotip`.
- **IPC** — Inter-process communication. *In AstroLife:* `ipcRenderer.invoke("backend:session-submit", ...)`.
- **Sandbox / context isolation** — The page can't reach Node or the OS. *In AstroLife:* enabled in `createWindow`.
- **React component** — A reusable UI piece. *In AstroLife:* `FindingsPage`.
- **State** — Data that changes over time. *In AstroLife:* XState machines, React state, SQLite.
- **State machine (XState)** — Defined states and allowed transitions. *In AstroLife:* `flowMachine`, `questionnaireMachine`.
- **Guard** — A condition on a transition. *In AstroLife:* `onboarded` decides where `BACK` goes.
- **History state** — Remembers the last sub-state. *In AstroLife:* return after "Report concern".
- **Ring buffer** — Fixed-size buffer that overwrites the oldest data. *In AstroLife:* `ppg-buffer.ts`.
- **requestAnimationFrame** — Browser callback before each screen repaint. *In AstroLife:* PPG chart redraw.
- **WebGL** — Browser 3D graphics API. *In AstroLife:* Health Compass.
- **three.js / React Three Fiber / drei** — 3D engine / React binding / helpers. *In AstroLife:* `anatomy-viewer.tsx`.
- **GLB / glTF** — 3D model file format. *In AstroLife:* anatomy and astronaut models.
- **Mesh** — A 3D shape made of triangles. *In AstroLife:* each anatomical structure; click → region.
- **Accessibility (WCAG)** — Guidelines for usable interfaces. *In AstroLife:* AA contrast, pause motion, keyboard use, text with colour.

### APIs and data

- **API** — A defined way for programs to exchange data. *In AstroLife:* RadLab, OSDR.
- **HTTP GET** — Request to read a resource. *In AstroLife:* `fetch()` in `radlab.py`.
- **Endpoint** — A specific API URL. *In AstroLife:* `/radlab/api/`, `/biodata/api/v2/dataset/OSD-104/`.
- **Query parameter** — Key-value after `?` in a URL. *In AstroLife:* `query=timestamp>=...`.
- **Status code** — Numeric HTTP result (200 OK, 500 server error). *In AstroLife:* non-200 → `RadLabError`.
- **Timeout** — Give up after a limit. *In AstroLife:* 15 s for NASA; 8 s per IPC call.
- **JSON / CSV** — Structured text / comma-separated table. *In AstroLife:* knowledge files / RadLab response.
- **Schema validation (Pydantic)** — Check data against declared types and rules. *In AstroLife:* `RadLabReading`, `OsdrStudy`.
- **Cache** — Saved copy for reuse. *In AstroLife:* bundled and user RadLab caches.
- **Checksum (SHA-256)** — Fingerprint of data; any change alters it. *In AstroLife:* `response_sha256`, `data_sha256`.
- **Provenance** — Where data came from and what was done to it. *In AstroLife:* provenance panel.
- **Atomic write** — Write to a temp file then rename, so a crash never leaves half a file. *In AstroLife:* `write_cache`.
- **Data cleaning** — Fix structural issues without changing meaning. *In AstroLife:* only exact duplicates removed.
- **Descriptive statistics** — Summaries like mean, median, percentile. *In AstroLife:* RadLab analysis, trends.
- **Median / 95th percentile** — Middle value / value 95 % of readings are below. *In AstroLife:* stability median; RadLab p95.

### Search, retrieval and AI (and what we don't use)

- **Search engine** — Finds and ranks items matching a query. *In AstroLife:* not used.
- **Full-text search / FTS** — Search inside text fields. *Not used.*
- **Embedding / vector search** — Represent text as numbers and find similar ones. *Not used.*
- **RAG** — Retrieve documents, then have a language model write an answer. *Not used.*
- **Identifier lookup** — Fetch an entry by its key. *In AstroLife:* `hrr["conditions"]["sleep"]`.
- **Curated knowledge base** — Human-reviewed entries with sources. *In AstroLife:* `software/resources/*.json`.
- **Rules engine** — Fixed if-then logic. *In AstroLife:* `rules.assess`.
- **Machine learning** — Models learned from data. *Not used.*

### NASA

- **HRP** — NASA Human Research Program. *In AstroLife:* hazards and risks catalog.
- **Five hazards** — Radiation, isolation and confinement, distance from Earth, gravity fields, hostile/closed environments. *In AstroLife:* ordered per mission.
- **Human Research Roadmap (HRR)** — NASA site listing risks and evidence reports. *In AstroLife:* risk ids per topic.
- **OSDR** — NASA Open Science Data Repository. *In AstroLife:* RadLab and Biological Data APIs.
- **RadLab** — OSDR's radiation data service. *In AstroLife:* Radiation Explorer.
- **OSD-104** — An OSDR study accession (mouse soleus muscle, Rodent Research-1). *In AstroLife:* Compass Muscles card.
- **SANS** — Spaceflight-associated neuro-ocular syndrome (vision changes). *In AstroLife:* `sans` topic.
- **EVA** — Extravehicular activity (spacewalk). *In AstroLife:* mission context; promotes EVA questions.
- **LEO** — Low Earth orbit. *In AstroLife:* one of three missions.

### Embedded systems

- **Microcontroller (ESP32)** — Small computer on a chip. *In AstroLife:* runs the firmware.
- **Firmware** — Software on the microcontroller. *In AstroLife:* `astro-life-ppg-2`.
- **I²C** — Two-wire chip bus (SDA data, SCL clock). *In AstroLife:* GPIO21/22.
- **UART / USB serial** — Byte stream over a virtual COM port. *In AstroLife:* 115,200 baud.
- **Baud rate** — Symbols per second on a serial line. *In AstroLife:* 115,200.
- **FIFO** — First-in-first-out buffer on the sensor. *In AstroLife:* paired red/IR samples.
- **ADC / 18-bit / clipping** — Analog-to-digital converter; max value 262,143; a reading at the max is clipped. *In AstroLife:* `clipped` status.
- **PPG** — Photoplethysmography, the light signal that changes with blood volume. *In AstroLife:* the live chart.
- **SpO₂** — Estimated blood oxygen saturation. *In AstroLife:* from the Maxim algorithm.
- **Sample rate** — Samples per second. *In AstroLife:* 25 Hz (100 Hz with 4× averaging).
- **DTR/RTS** — Serial control lines that can reset an ESP32. *In AstroLife:* set low before opening.

### Databases

- **SQLite** — Embedded single-file SQL database. *In AstroLife:* `history.sqlite3`.
- **Table / row / column** — Spreadsheet-like structure. *In AstroLife:* `checkins`, `followup_actions`.
- **Query** — A SQL statement. *In AstroLife:* `SELECT ... ORDER BY id DESC`.
- **Migration / schema version** — Upgrade steps for the database structure. *In AstroLife:* `PRAGMA user_version = 2`.
- **Persistence** — Data survives restarts. *In AstroLife:* resume a check-in.

### Testing and deployment

- **Unit / integration test** — Test one function / several parts together. *In AstroLife:* `test_rules.py` / `test_bridge.py`.
- **Mock / fake opener** — Stand-in for a real dependency. *In AstroLife:* `fetch(opener=...)` in tests.
- **Test vectors** — Shared input/expected-output cases. *In AstroLife:* `question_vectors.json`.
- **Vitest / jsdom / Testing Library** — UI test runner / simulated browser / user-like queries.
- **Typecheck** — Compiler checks types without running. *In AstroLife:* `tsc -b`.
- **PyInstaller** — Freezes Python into an executable. *In AstroLife:* `astrotip-backend`.
- **electron-builder, DMG, NSIS** — Installer tool; Mac disk image; Windows installer system.
- **CI / GitHub Actions** — Automated builds on hosted machines. *In AstroLife:* `desktop-installers.yml`.
- **Runner** — The machine a CI job runs on. *In AstroLife:* `macos-15`, `macos-15-intel`, `windows-latest`.
- **Artifact vs Release** — Temporary CI output vs published downloadable version.
- **Code signing / notarization** — Proving publisher identity to the OS. *In AstroLife:* not configured; unsigned builds may warn.
- **Conventional Commits** — `type(scope): summary` commit style. *In AstroLife:* the whole history.

---

## Part 3: The 20 concepts to study first, ranked

| Rank | Concept | Why it matters for your talk | Read |
|---|---|---|---|
| 1 | "The UI never scores": the three-part architecture | Every architecture question starts here | [02 §1](02-architecture-handbook.md#1-the-big-picture) |
| 2 | Decision data vs explanation data | The hardest NASA question | [05 §2.2](05-nasa-knowledge-search-and-decisions.md#22-data-used-to-make-a-decision-vs-data-used-to-explain-it) |
| 3 | No search engine, no AI: identifier lookup + rules | Prevents overclaiming | [05 §1](05-nasa-knowledge-search-and-decisions.md#1-what-kind-of-search-system-is-it) |
| 4 | How NASA hazard order drives question order (`build_plan`) | Your strongest NASA integration | [data-sources §2.1](data-sources-and-api-architecture.md#21-five-hazards-of-human-spaceflight) |
| 5 | The rules engine and its thresholds' sources | "How are risks evaluated?" | [02 §5.2](02-architecture-handbook.md#52-the-rules-engine-rulesassess-version-2026112) |
| 6 | The evidence trace (six steps) | Shows explainability | [05 §3](05-nasa-knowledge-search-and-decisions.md#3-three-scenarios-traced-through-the-code) |
| 7 | RadLab pipeline (Retrieve → Validate → Clean → Analyze → Store → Explain) | The live NASA API | [data-sources §4.1](data-sources-and-api-architecture.md#41-radlab-live-api) |
| 8 | Sensor chain and estimate vs validated measurement | ESP32 rubric and accuracy questions | [02 §4](02-architecture-handbook.md#4-hardware-firmware-and-sensor-data) |
| 9 | Three-report agreement and backend-owned measurement | Trust in the reading | [02 §4.4](02-architecture-handbook.md#44-quality-checks-layer-by-layer) |
| 10 | Electron + Python child process + JSON lines | "Why desktop / how do they talk?" | [02 §2](02-architecture-handbook.md#2-how-the-application-runs-start-to-finish) |
| 11 | XState state machines | "How is it adaptive?" | [02 §6](02-architecture-handbook.md#6-uiux-and-interactive-visualization) |
| 12 | Pydantic validation and SHA-256 provenance | "How do you know the data is real?" | [03](03-technology-stack.md) |
| 13 | Handling missing, simulated and historical data | Honesty questions | [02 §5.4](02-architecture-handbook.md#54-uncertainty-missing-data-and-false-alarms) |
| 14 | SQLite tables and persistence | "How is data stored?" | [02 §7](02-architecture-handbook.md#7-data-storage) |
| 15 | Health Compass mesh → region mapping | 3D questions | [04 §9](04-feature-guide.md#9-health-compass-3d-body) |
| 16 | Electron security (sandbox, allowlist) | Security questions | [02 §8 Level 3](02-architecture-handbook.md#level-3-technical-judge-questions) |
| 17 | What the tests prove and don't | "How did you test?" | [06 §2](06-development-and-testing.md#2-testing) |
| 18 | PyInstaller + electron-builder + CI | "How does the installer work?" | [06 §3](06-development-and-testing.md#3-packaging-and-release) |
| 19 | Challenge requirement coverage and gaps | Relevance score | [01 §3.3](01-project-overview.md#33-requirement--feature--implementation--evidence) |
| 20 | Future work for real missions | Closing questions | [01 §4](01-project-overview.md#4-gaps-limitations-and-future-work-prompt-part-18) |
