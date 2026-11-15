# AstroLife

**A guided health check-in for astronauts, built for the 2026 NASA Space Apps
Challenge ("Health Monitoring Software").**

AstroLife takes an astronaut from *which mission am I on* to *what should I do
next*. NASA's hazards for that mission shape an adaptive check-in. A fingertip
sensor on an ESP32 adds pulse and blood-oxygen estimates. Explainable rules
turn the answers and the reading into follow-up prompts, and every prompt is
traced back to NASA evidence and to the astronaut's own observations.

It runs offline on one computer. Nothing is sent anywhere.

> AstroLife is an educational prototype. It is not a medical device, it does
> not diagnose, and its sensor estimates have not been validated against
> reference equipment. NASA does not endorse it.

## The journey

| Step | What the astronaut does | What AstroLife does |
|---|---|---|
| 1. Mission | Chooses low Earth orbit, lunar, or Mars / deep space, and adds phase, mission day and recent EVA | Stores a mission profile |
| 2. Hazards | Reads NASA's five hazards of human spaceflight | Orders them for the mission and shows the check-in plan that follows from that order |
| 3. Safety screen | Ticks urgent symptoms or "none of these" | Shows emergency guidance immediately if anything is ticked |
| 4. Questions | Answers one question at a time | Adapts: follow-ups appear and disappear, and each card says why it is asked |
| 5. Measurement | Rests a fingertip on the sensor until three reports agree | Saves their median for the open check-in, then allows the fingertip to be removed before continuing |
| 6. Findings | Reads the prompts | Runs the Python rules. Each prompt lists simple steps the astronaut can take and when to involve the crew, and is traced: mission → hazard → NASA risk → observation → rule → follow-up. Each measured value is colour coded against a cited general reference. |
| 7. Health Compass | Explores a 3D body | Shows recorded values, prompts and NASA research per body region |
| 8. Actions | Marks follow-ups done, or reassesses | Stores them locally |
| Later | Opens the app again | Opens on the intro page, then one step to a dashboard with the mission, latest check-in, live values and open actions |

A "Report concern" button is on every screen.

## What is real

| Part | Status |
|---|---|
| ESP32 + MAX30102 firmware, serial stream, live chart | Real hardware path. Transport and timing verified on the board. Accuracy not validated. |
| NASA radiation data | Retrieved from the NASA OSDR **RadLab API**, validated, analysed with pandas and NumPy, cached with checksums. Can be retrieved again live from the app. |
| NASA space-biology study | Retrieved from the NASA OSDR **Biological Data API** (study OSD-104), validated and cached. |
| NASA hazards, risks and evidence | Curated from NASA Human Research Program pages and Human Research Roadmap evidence reports, with a link for every statement. |
| Assessment | Deterministic Python rules. No machine learning and no language model. |
| Self-care steps and measuring instructions | Restated from cited sources (NASA risk pages, MedlinePlus, FDA) in `software/resources/care_guidance.json`. General guidance, not prescriptions. |
| Simulated sensor stream | A demo fallback. It is labelled "simulated · not a measurement" everywhere, including in saved history. |

AstroLife always separates four kinds of information: **NASA scientific
evidence**, **historical research measurements**, **your own measurements**
and **rule-based prompts**. Historical NASA data is never shown as the
astronaut's exposure.

## Quick start

For a clickable application, see [Desktop installers and releases](docs/RELEASING.md).
The packaging commands produce a macOS DMG or a Windows Setup EXE with the
AstroLife icon; the Windows installer creates desktop and Start Menu shortcuts.
Python and Node.js are bundled for users of the installed app. GitHub Actions
is configured to build macOS Apple Silicon, macOS Intel, and Windows x64 packages.

You need Python 3.11+ and Node.js. From the repository root:

```bash
python3 -m venv .venv
```

```bash
source .venv/bin/activate
```

```bash
python -m pip install -r software/requirements.txt
```

```bash
cd desktop && npm install
```

```bash
npm start
```

To start from nothing every time, without touching your real local history:

```bash
npm run demo
```

`npm run demo:resume` reopens the same demo data, to show that the app
remembers the mission, findings and follow-up actions. In normal use
(`npm start`) the app always remembers; from the intro page a returning
astronaut can open the dashboard or start a new mission assessment.

No sensor? Use **Run simulated stream** on the Measurement screen.

To build and flash the firmware, see [docs/HARDWARE.md](docs/HARDWARE.md).

## How it is built

```text
ESP32 + MAX30102  ──USB serial──►  Python backend  ──JSON lines──►  Electron  ──►  React interface
   firmware estimates               rules, NASA pipelines,           private          guided flow,
   heart rate and SpO₂              SQLite storage                   child process    3D Compass, charts
```

| Layer | Technology |
|---|---|
| Firmware | C++, Arduino framework, PlatformIO, SparkFun MAX3010x library |
| Backend | Python, PySide6 (event loop), pyserial, pandas, NumPy, Pydantic, SQLite |
| Desktop shell | Electron (sandboxed, context isolation, IPC allowlist) |
| Interface | React 19, TypeScript, Vite, Tailwind v4, Motion, XState, uPlot, React Three Fiber |

The interface never scores anything. Answers and measurements go to Python,
and Python runs the rules.

## Hardware and mechanical housing

AstroLife's hardware has three parts:

| Part | What it does |
|---|---|
| Electronics | An ESP32 microcontroller wired to a MAX30102 optical pulse sensor over I²C. The firmware estimates heart rate and SpO₂ from the fingertip and sends them to the computer over USB |
| Mechanical housing | Designed by Ben Vo. The enclosure that holds the ESP32, the MAX30102 and their wiring in one unit, keeps the sensor open for a fingertip, and lets the USB cable run out to the computer |
| Desktop app | Reads the sensor over USB, runs the check-in and shows the results |

The housing design files are not in this repository yet. Wiring and
flashing are in [docs/HARDWARE.md](docs/HARDWARE.md).

## Repository layout

```text
desktop/      React + Electron interface
software/     Python backend, NASA resources and caches, tests, Qt fallback
electrical/   ESP32 firmware
docs/         Documentation
```

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Parts, data flow, bridge contract, storage, traceability, analytics tools |
| [docs/NASA_DATA.md](docs/NASA_DATA.md) | Every NASA source: dataset ids, API addresses, retrieval dates, pipelines, limits, and the feature each one drives |
| [docs/QUESTION_ENGINE.md](docs/QUESTION_ENGINE.md) | The adaptive questionnaire |
| [docs/HARDWARE.md](docs/HARDWARE.md) | Wiring, flashing, serial format, verification status |
| [docs/UI_UX.md](docs/UI_UX.md) | Design system, reused components and licenses, Health Compass, motion, design reviews |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup, test cycle, environment variables, working rules |
| [docs/DEMO.md](docs/DEMO.md) | Three-minute demo script, fallback plan, known limitations |
| [docs/CHALLENGE_REVIEW.md](docs/CHALLENGE_REVIEW.md) | The app checked against the challenge statement, the judging rubric and the submission checklist |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Commit history by phase |
| [docs/presentation-prep/](docs/presentation-prep/README.md) | Presentation study set: architecture handbook, technology stack, feature guide, NASA data and API audit, script, judge Q&A |
| [desktop/THIRD_PARTY_NOTICES.md](desktop/THIRD_PARTY_NOTICES.md) | Licenses and attribution |

## Tests

```bash
QT_QPA_PLATFORM=offscreen .venv/bin/python -m unittest discover -s software/tests
```

```bash
cd desktop && npm run typecheck && npm test && npm run build && npm run bridge:proof
```

At the last full cycle: 197 Python tests (2 opt-in live NASA tests skipped) and
144 interface tests in 24 files passed.

## Known limitations

- Not a medical device. No clinical validation.
- Sensor accuracy has not been compared with a reference pulse oximeter.
- The RadLab API states no unit for its values and its documentation was
  unavailable, so the unit is shown as "not stated by the API".
- Local history is stored unencrypted.
- The React app has been run on macOS only on this branch. The packaged app
  was not re-verified after the last backend changes; run from source.

The full list is in [docs/DEMO.md](docs/DEMO.md#known-limitations).

## Credits

- **Team:** Ben Vo, Jayden Nguyen, and Quan Le.
- **NASA:** Human Research Program hazard and risk pages, Human Research
  Roadmap evidence reports, the Open Science Data Repository (RadLab and
  Biological Data APIs), the NASA Image and Video Library and NASA 3D
  Resources. Used under NASA's media usage guidelines. No endorsement implied.
- **Anatomy models:** BodyParts3D © The Database Center for Life Science
  (CC BY 4.0); Human Reference Atlas 3D Reference Organs, HuBMAP (CC BY 4.0);
  MakeHuman (CC0); modified by open-anatomy-3d (CC BY 4.0).
- **General health guidance:** MedlinePlus (U.S. National Library of Medicine)
  and the U.S. Food and Drug Administration, restated in plain words with a
  source on every step.
- **Interface:** Space Portfolio, Space UI, Magic UI, shadcn/ui, Radix UI (all
  MIT) and the libraries listed in the third-party notices.
- **AI assistance:** parts of the code and documentation were written with AI
  coding assistants under the team's direction and review. No AI model runs
  inside the app.
