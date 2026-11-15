# Development guide

## Prerequisites

| Tool | Version used | For |
|---|---|---|
| Python | 3.11 or newer | Backend, rules, NASA pipelines |
| Node.js + npm | Current LTS | Electron and the React interface |
| PlatformIO | Current | Firmware only (see [HARDWARE.md](HARDWARE.md)) |

## Set up

From the repository root:

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

On Windows, activate with `.venv\Scripts\activate`.

## Run

| Command (in `desktop/`) | What it does |
|---|---|
| `npm run dev` | Vite dev server plus Electron with hot reload |
| `npm start` | Production build of the interface, then Electron |
| `npm run package:dir` | Unpacked app with a PyInstaller backend sidecar (needs `software/requirements-dev.txt`) |

Electron looks for `.venv/bin/python` at the repository root, then `python3`
on the PATH. Set `ASTROTIP_PYTHON` to use another interpreter. On Windows the
virtual environment's interpreter is `.venv\Scripts\python.exe`, so set
`ASTROTIP_PYTHON` to that path. The React app has been run on macOS only in
this branch; Windows is untested.

The earlier Qt interface still runs with `python software/run.py`.

**Packaging note.** `npm run package:dir` has not been re-run since pandas and
Pydantic were added to the backend. Run it and open the packaged app before
relying on it. The demo uses `npm start`.

## Test cycle

Run all of these before a commit that touches behaviour.

```bash
QT_QPA_PLATFORM=offscreen .venv/bin/python -m unittest discover -s software/tests
```

Then in `desktop/`:

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

```bash
npm run bridge:proof
```

| Suite | Size at the last full cycle | Covers |
|---|---|---|
| Python `unittest` | 184 tests, 2 skipped (opt-in live NASA calls) | Rules, serial parsing, PPG batching, bridge, questionnaire, sessions and storage, RadLab, OSDR, NASA-driven behaviour, history trends, Qt fallback |
| Vitest | 125 tests in 21 files | Question engine and machines, flow pages, Compass, monitor, NASA pages, shell, shortcuts |
| `bridge:proof` | 1 script | Starts the real Python backend from Node and exercises the protocol |

Live NASA checks (network needed):

```bash
ASTROLIFE_LIVE_TESTS=1 .venv/bin/python -m unittest software/tests/test_radlab.py software/tests/test_osdr.py
```

The question engine has one set of cases shared by Python and TypeScript:
`software/resources/question_vectors.json`.

## Environment variables

| Variable | Effect |
|---|---|
| `ASTROTIP_HISTORY_PATH` | Use this SQLite file instead of the real local history. Use it for every manual test. |
| `ASTROTIP_PYTHON` | Python interpreter for the backend |
| `ASTROTIP_REDUCED_MOTION=1` | Disable decorative motion (Qt fallback) |
| `ASTROLIFE_LIVE_TESTS=1` | Enable the tests that call NASA |
| `ASTROTIP_SCREENSHOT=<file.png>` | Development capture: take a screenshot of the built app and exit |
| `ASTROTIP_SCREENSHOT_PAGE`, `_DELAY`, `_SCROLL`, `_SIMULATE`, `_SCRIPT` | Options for the capture: start page, wait, element to scroll to, start the simulated stream, run a local script first |

A capture script can set `document.title = "capture:<name>"` for an extra
screenshot and `document.title = "hover:<x>,<y>"` to move the real pointer, so
hover states can be checked. These hooks run only when `ASTROTIP_SCREENSHOT`
is set.

Internal names keep the earlier "astrotip" spelling (the Python package,
`window.astrotip`, `ASTROTIP_*`, the history folder) so existing records and
the serial parser keep working. Everything the user sees says AstroLife.

## Where things live

```text
desktop/
  electron/           main process, preload API, IPC allowlist
  src/App.tsx         wires the state machines to the screens
  src/flow/           navigation machine
  src/questions/      question engine and questionnaire machine
  src/components/
    flow/             guided screens and shared pieces (badges, trace, sources)
    compass/          3D anatomy viewer, 2D body map, regions
    monitor/          PPG chart, live monitor, sensor dock
    nasa/             Radiation Explorer, series chart, OSDR study card
    pages/            dashboard, NASA data, monitor, history, concern report
    effects/          cursor-reactive pieces, star and astronaut scene
  src/styles.css      design tokens and component styles
software/
  astrotip/           Python backend (see ARCHITECTURE.md)
  resources/          NASA catalog, mission context, questions, evidence, caches
  tests/              unittest suites
electrical/firmware/  ESP32 firmware
docs/                 this documentation
```

## Refreshing NASA data

| Data | Command | Result |
|---|---|---|
| RadLab | "Retrieve again from NASA" in the app | Stored next to the history file; the bundled snapshot stays as the offline fallback |
| OSDR study | `cd software && ../.venv/bin/python -m astrotip.nasa.osdr --refresh` | Replaces `resources/nasa_cache/osdr_<accession>.json` |
| Mission media | `python software/scripts/fetch_nasa_media.py --with-video` | Updates `software/assets/nasa/` |

The catalog, mission context and evidence list are curated files. Review the
linked NASA pages before changing them and advance their `reviewed_on` date.

## Working rules

- The interface never scores. New health logic goes into Python with tests.
- No clinical threshold, score or treatment advice that is not already in the
  reviewed rules.
- Real, manual, unmeasured and simulated values stay distinguishable in the
  data and on screen.
- Historical NASA data is never shown as the astronaut's own.
- No machine learning or language model in the assessment.
- Check licences and attribution before adding a package or an asset, and
  record them in `desktop/THIRD_PARTY_NOTICES.md`.
- At most one WebGL scene at a time. Every animation must stop under "Pause
  motion" and the OS reduced-motion setting.
- Commits follow Conventional Commits and hold one coherent change.

## Python libraries and licences

| Library | Use | Licence (from package metadata) |
|---|---|---|
| PySide6 | Qt event loop in the backend; Qt fallback interface | LGPL-3.0-only OR GPL-2.0-only OR GPL-3.0-only |
| pyserial | ESP32 serial | BSD |
| pandas | NASA dataset processing, history summary | BSD-3-Clause |
| NumPy | Statistics | BSD-3-Clause and others |
| Pydantic | Validation of NASA responses and provenance | MIT |
| pyqtgraph | Charts in the Qt fallback | MIT |
| Pillow | Image handling in the Qt fallback | MIT-CMU |
| qt-material, QtAwesome | Qt fallback theme and icons | BSD-2-Clause, MIT |

JavaScript libraries and bundled assets are listed in
[`desktop/THIRD_PARTY_NOTICES.md`](../desktop/THIRD_PARTY_NOTICES.md).

## AI assistance

Parts of this project were written with AI coding assistants (Claude Code,
and Codex earlier on the UI branch), directed and reviewed by the team.
Commits made that way carry a `Co-Authored-By` line. No AI model runs inside
the app, and none is used to assess health data.
