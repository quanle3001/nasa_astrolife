# C. Technology stack reference

Every significant technology in AstroLife, checked against what the code
actually imports. Each entry answers: what it is, what it normally does, why
we used it, how we use it, what it talks to, why not an alternative, and a
one-line answer for a judge.

"Used in the app" means the React + Electron app and its Python backend.
"Legacy Qt only" means the earlier PySide6 window started by
`python software/run.py`, which is kept as a fallback.

---

## 1. Languages

### C++ (firmware)
1. **What:** A compiled systems language. It runs directly on small chips with no operating system.
2. **Normally:** Embedded firmware, games, performance-critical code.
3. **Why:** The ESP32 Arduino framework and the SparkFun sensor library are C++.
4. **How:** `electrical/firmware/max30102_serial_test/src/main.cpp`: sampling loop, quality gates, serial output.
5. **Talks to:** MAX30102 over I²C; the computer over USB serial.
6. **Alternative:** MicroPython is easier but slower and has less mature sensor libraries.
7. **Judge:** "The firmware is C++ on the Arduino framework because that's where the sensor library and the ESP32 tooling are."

### Python 3.11+ (3.12 for packaging)
1. **What:** A high-level interpreted language with a large scientific ecosystem.
2. **Normally:** Data analysis, scripting, back-end services.
3. **Why:** pandas, NumPy, Pydantic and pyserial cover data, validation and serial in one language; the teammate's sensor tools were already Python.
4. **How:** Everything under `software/astrotip/`: bridge, rules, NASA pipelines, storage.
5. **Talks to:** Electron through stdin/stdout; the ESP32 through pyserial; NASA through `urllib`.
6. **Alternative:** Node.js could have done serial and HTTP, but not pandas-style analysis as easily.
7. **Judge:** "Python owns everything that must be correct: validation, rules, NASA data and storage."

### TypeScript
1. **What:** JavaScript with static types, checked at build time.
2. **Normally:** Large web front ends.
3. **Why:** The backend's JSON shapes are typed in `desktop/src/types/`, so a renamed field is caught by `tsc` before the app runs.
4. **How:** All of `desktop/src/`. `npm run typecheck` runs `tsc -b`.
5. **Talks to:** The preload API `window.astrotip`.
6. **Alternative:** Plain JavaScript; more runtime bugs.
7. **Judge:** "TypeScript types every message from the backend, so interface and backend can't silently disagree."

### Others
JSON (all knowledge files), SQL (SQLite statements), CSS (Tailwind),
YAML (GitHub Actions), PowerShell (`software/create_desktop_shortcut.ps1`, legacy).

---

## 2. Firmware and hardware tools

### PlatformIO
1. **What:** A build system and package manager for embedded boards.
2. **Normally:** Compile, upload and monitor firmware from VS Code or a terminal.
3. **Why:** One `platformio.ini` installs the ESP32 core and the sensor library with fixed versions; no Arduino IDE needed.
4. **How:** `platform = espressif32`, `board = esp32dev`, `framework = arduino`, `monitor_speed = 115200`, library `SparkFun MAX3010x ... @^1.1.2`, and a custom `dedupe_ppg` monitor filter (`monitor/filter_dedupe_ppg.py`).
5. **Talks to:** The board over USB for upload.
6. **Alternative:** Arduino IDE: less reproducible.
7. **Judge:** "PlatformIO makes the firmware build reproducible: anyone runs `pio run -t upload`."

### Arduino framework for ESP32
1. **What:** A simplified C++ API (`setup()`, `loop()`, `Serial`, `Wire`) ported to the ESP32.
2. **Normally:** Hobby and prototype firmware.
3. **Why:** Fast to write and the sensor library targets it.
4. **How:** `Serial.printf`, `Wire` via `sensor.begin(Wire, I2C_SPEED_FAST)`, `millis()` timestamps.
5. **Talks to:** ESP32 hardware.
6. **Alternative:** Espressif's ESP-IDF: more control, more code.
7. **Judge:** "Arduino on ESP32 was the quickest reliable path for a hackathon."

### SparkFun MAX3010x library
1. **What:** A driver for the MAX30102/MAX30105 sensors, plus Maxim's reference heart-rate/SpO₂ algorithm (`spo2_algorithm.h`).
2. **Normally:** Configure the sensor and read its FIFO.
3. **Why:** Proven driver; it includes the algorithm, so we did not write signal processing from scratch.
4. **How:** `sensor.setup(60, 4, 2, 100, 411, 4096)`; `getFIFORed()`/`getFIFOIR()` for paired samples; `maxim_heart_rate_and_oxygen_saturation(...)` on a 100-sample window.
5. **Talks to:** MAX30102 over I²C.
6. **Alternative:** Our own peak detection: more risk, no time to validate.
7. **Judge:** "The heart rate and SpO₂ estimates come from Maxim's reference algorithm in the SparkFun library. We added gates for contact, clipping and timing around it."

### I²C (`Wire.h`)
Two-wire bus between the ESP32 (GPIO21 SDA, GPIO22 SCL) and the sensor at
400 kHz. **Judge:** "The sensor talks to the ESP32 over I²C; the ESP32 talks to the laptop over USB serial."

---

## 3. Python backend libraries

### PySide6 (Qt for Python)
1. **What:** The official Python binding of Qt, a C++ application framework.
2. **Normally:** Native desktop GUIs.
3. **Why:** Two roles. In the app, the backend uses Qt's **event loop, threads and signals/slots** with no window (`QCoreApplication`, `QThread`, `QTimer`, `Signal`). In the legacy fallback, it draws a full window.
4. **How:** `bridge/service.py` (`QCoreApplication`, `QTimer` for PPG flushes, `Slot`s), `inputs/sensor_serial.py` (`SerialReader(QThread)` emits `reading_received`, `optical_sample_received`, `status_changed`), `software/astrotip/ui/` (legacy window).
5. **Talks to:** Serial thread → bridge; stdin thread → bridge.
6. **Alternative:** `asyncio`; but the teammate's serial reader and Qt monitor already used Qt signals, so the bridge reused them unchanged.
7. **Judge:** "The backend runs on Qt's event loop. The serial port is read on a Qt thread, and Qt signals hand each reading safely to the main thread."

### pyserial
1. **What:** Cross-platform serial-port access.
2. **Normally:** Talking to microcontrollers and instruments.
3. **Why:** Standard, works on macOS and Windows.
4. **How:** `serial.Serial(...)` with DTR/RTS low before opening (reduces ESP32 resets); `list_ports.comports()` for the port picker.
5. **Talks to:** ESP32.
6. **Judge:** "pyserial reads the USB serial port at 115,200 baud."

### pandas
1. **What:** A table (DataFrame) library for cleaning, grouping and summarising data.
2. **Normally:** Data analysis.
3. **Why:** Grouping thousands of radiation rows by instrument and summarising history is a few clear lines.
4. **How:** `nasa/radlab.py` `clean()` (dedupe, group, order), `nasa/radlab_analysis.py` (per-instrument statistics, hourly means), `analysis/history_trends.py` (latest, previous, mean, range; simulated excluded).
5. **Talks to:** Pydantic-validated readings in; plain dicts out to the bridge.
6. **Alternative:** Plain loops: longer and easier to get wrong.
7. **Judge:** "pandas cleans and groups NASA's 5,359 RadLab rows by instrument and summarises the astronaut's history."

### NumPy
1. **What:** Fast numeric arrays.
2. **How:** In `radlab_analysis.py` for percentiles, standard deviation and finding gaps (`np.flatnonzero` on intervals longer than 3× the usual cadence). Also used by pyqtgraph in the legacy UI.
3. **Judge:** "NumPy does the numeric work: percentiles, gaps and excursions in the radiation series."

### Pydantic
1. **What:** Data validation using Python type hints.
2. **Normally:** Validating API inputs and configuration.
3. **Why:** NASA responses must be trusted before they are shown; one bad row should reject the response.
4. **How:** `nasa/models.py` (`RadLabReading`, `RadLabDataset`, `HealthIndicator`, `MeasurementProvenance`), `nasa/osdr.py` (`OsdrStudy` with `extra="forbid"`).
5. **Talks to:** Raw CSV/JSON from NASA in; typed objects out.
6. **Alternative:** Hand-written checks: easy to miss a case.
7. **Judge:** "Every NASA row passes a Pydantic model: readable timestamp, known instrument, finite non-negative value. One bad row rejects the response."

### sqlite3 (Python standard library)
1. **What:** An embedded SQL database stored in a single file.
2. **Why:** No server, works offline, built into Python.
3. **How:** `storage/database.py` and `storage/app_state.py`; read-only URI mode for listing history.
4. **Judge:** "All data is in one local SQLite file, no database server."

### urllib.request (standard library HTTP client)
1. **What:** Python's built-in HTTP client.
2. **Why:** Two simple GET requests; avoids an extra dependency.
3. **How:** `nasa/radlab.py` `fetch()`, `nasa/osdr.py` `fetch()` with a 15 s timeout, size cap and User-Agent.
4. **Alternative:** `requests` is listed only in the optional `requirements-ml.txt` and is not used.
5. **Judge:** "We call NASA with Python's standard HTTP client, with a timeout and a size limit."

### hashlib, tempfile, os.replace (standard library)
SHA-256 checksums of NASA responses and of the canonical data; atomic cache
writes. **Judge:** "Each cached NASA dataset has a SHA-256 checksum; if the file is edited or damaged, the app refuses it."

### Legacy Qt only
| Library | Use |
|---|---|
| pyqtgraph | Waveform plot in `ui/optical_waveform.py` |
| qt-material | Theme in `ui/theme/__init__.py` |
| QtAwesome | Icons in `ui/icons.py` |
| Pillow | Listed in `requirements.txt`; **not imported** anywhere in the code |

### Listed but not used
`scikit-learn`, `joblib`, `requests` (`requirements-ml.txt`, optional) and
`pytest`, `ruff` (`requirements-dev.txt`; the tests are written with
`unittest`). Do not present these as part of the system.

---

## 4. Desktop shell and interface

### Electron
1. **What:** A framework that packages a Chromium browser and Node.js into a desktop app.
2. **Normally:** Cross-platform desktop apps written with web technology (VS Code, Slack).
3. **Why:** Native window and installers for macOS and Windows, with a modern web UI and WebGL for 3D.
4. **How:** `desktop/electron/main.cjs` starts Python, relays JSON, enforces security; `preload.cjs` exposes `window.astrotip`.
5. **Talks to:** Python child process (stdio); renderer (IPC).
6. **Alternative:** Staying with PySide6 widgets: harder to build the 3D body and motion design. Tauri: would need Rust.
7. **Judge:** "Electron gives us a real desktop app with a sandboxed web interface. It starts our Python backend as a private child process, so there is no server."

### IPC (inter-process communication) and the preload script
`ipcRenderer.invoke` / `ipcMain.handle` pairs. Each of 23 channels maps to
exactly one backend method. `contextBridge` exposes only those functions.
**Judge:** "The web page can't touch Node or the file system. It can only call 23 named functions, and each maps to one backend method."

### Node.js
Runs Electron's main process and the build scripts (`desktop/scripts/*.mjs`).
Node 24 in CI.

### React 19
1. **What:** A library for building UIs from components that re-render when state changes.
2. **Why:** Large ecosystem (three.js bindings, Radix, Testing Library).
3. **How:** Every screen in `desktop/src/components/`.
4. **Judge:** "React renders the screens; it doesn't make decisions, it shows what the backend returns."

### Vite
Build tool and dev server. `npm run build` (`tsc -b && vite build`) produces
`dist/`. Its `import.meta.glob` bundles the cached NASA mission images.
**Judge:** "Vite builds the interface into static files that Electron loads from disk."

### Tailwind CSS v4
Utility-first CSS; design tokens in `src/styles.css` (`@theme`).
**Judge:** "Tailwind with our own design tokens for the dark space theme."

### XState v5 (+ `@xstate/react`)
1. **What:** A library for finite state machines and statecharts.
2. **Normally:** Complex UI flows where only certain transitions are allowed.
3. **Why:** Navigation and question branching must be deterministic and testable; "same answers, same questions".
4. **How:** `flow/flow-machine.ts` (screens, guards, history state for "Report concern"), `questions/questionnaire-machine.ts` (answers, position, dropped follow-ups).
5. **Talks to:** React pages send events; the machines' state picks the page/question.
6. **Alternative:** Ad-hoc `useState` flags: invalid combinations become possible.
7. **Judge:** "Navigation and the questionnaire are XState state machines, so every transition is explicit and tested. That's what makes the check-in adaptive without AI."

### uPlot
Very small, fast canvas chart library. Draws the live PPG waveform and the
RadLab series. **Why:** handles 25 samples/s redraws cheaply.
**Judge:** "uPlot draws the live pulse wave at screen refresh rate without React re-rendering."

### three.js, React Three Fiber, drei
1. **What:** three.js is a WebGL 3D engine; React Three Fiber lets you write three.js scenes as React components; drei is a helper collection.
2. **How:** `anatomy-viewer.tsx` (`Canvas`, `useGLTF`, `OrbitControls`, `Bounds` for fly-to, `Bvh` for fast picking, `Html` pins), `space-scene.tsx` (NASA astronaut model).
3. **Judge:** "The Health Compass is a three.js scene through React Three Fiber; clicking a mesh maps it to a body region."

### open-anatomy-3d
An npm package with male and female anatomy GLB models and a structure
catalog (`ANATOMY_BY_KEY`), derived from BodyParts3D (CC BY 4.0), Human
Reference Atlas (CC BY 4.0) and MakeHuman (CC0). AstroLife removes skin and
reproductive structures before rendering. **Judge:** "We used an open
anatomy library with proper attribution instead of modelling a body
ourselves."

### Draco decoder
`public/draco/` lets three.js decode compressed GLB meshes.

### Motion (`motion/react`), maath
Animation library for screen transitions and hover feedback; maath provides
random point helpers for the star background. Respect "Pause motion" and OS
reduced-motion.

### Radix UI, shadcn/ui patterns, lucide-react, class-variance-authority, clsx, tailwind-merge
Accessible dialog and tooltip primitives; button/card variants; icons;
className helpers. **Judge:** "Accessible primitives from Radix, so dialogs
manage focus correctly."

---

## 5. Testing tools

| Tool | What it is | Where |
|---|---|---|
| Python `unittest` | Standard-library test framework | `software/tests/` (16 files, 197 tests) |
| Vitest | Vite-native test runner for TypeScript | `desktop/src/**/*.test.ts(x)` (24 files, 144 tests) |
| Testing Library (`@testing-library/react`, `jest-dom`) | Render components and query them like a user | Page and component tests |
| jsdom | Simulated browser DOM in Node | Vitest environment (no WebGL, no canvas) |
| `node:test` | Node's built-in test runner | `scripts/packaging-checks.cjs` (5 tests) |
| `tsc -b` | TypeScript compiler as a checker | `npm run typecheck` |
| `bridge-proof.mjs` | Script that starts the real backend and calls it | `npm run bridge:proof` |
| `verify-package.mjs` | Launches the packaged app and checks IPC | `npm run package:verify` |

**Judge:** "We have 197 Python tests on rules, parsing, NASA pipelines and
storage, 144 interface tests, and scripts that start the real backend and the
packaged app."

---

## 6. Build, packaging and automation

### PyInstaller
1. **What:** Freezes a Python program and its libraries into a standalone executable.
2. **Why:** Installed users should not need Python.
3. **How:** `desktop/scripts/build-backend.mjs` builds `astrotip-backend` (`.exe` on Windows) into `sidecar-dist/`, then smoke-tests it from a temporary directory.
4. **Judge:** "PyInstaller turns the Python backend into one executable that ships inside the app."

### electron-builder (DMG, NSIS)
1. **What:** Packages an Electron app into platform installers.
2. **How:** `build` section of `desktop/package.json`: macOS DMG, Windows NSIS Setup EXE with desktop and Start Menu shortcuts; the backend executable as an `extraResource`; icon from `build/icon.png`. Driven by `desktop/scripts/package.mjs`, which checks OS and CPU architecture first.
3. **Judge:** "electron-builder produces a DMG for Mac and a Setup EXE for Windows with Python and Node bundled."

### GitHub Actions
1. **What:** GitHub's CI service running workflows on hosted machines.
2. **How:** `.github/workflows/desktop-installers.yml`: three native jobs (macOS arm64 on `macos-15`, macOS x64 on `macos-15-intel`, Windows x64), each installs dependencies, runs `npm test` and packaging tests, builds, launches the packaged app with `package:verify`, and uploads installers as artifacts (30-day retention). Triggers: pull requests touching `desktop/` or `software/`, `v*` tags, manual dispatch.
3. **Caveat:** `gh` was not installed on the audit machine, so this audit could not confirm that the workflow has run on GitHub.
4. **Judge:** "CI builds and smoke-tests installers on native Mac and Windows runners, because a frozen Python backend can't be cross-compiled."

### Git and Conventional Commits
About 100 commits between 2026-11-13 and 2026-11-15, in `type(scope): summary`
form, grouped in `docs/CHANGELOG.md`.

---

## 7. NASA and external services (summary)

| Service | Kind | Used where |
|---|---|---|
| NASA OSDR RadLab API | Live HTTP API (CSV) | In app: "Retrieve again from NASA"; bundled cache |
| NASA OSDR Biological Data API | HTTP API (JSON) | Developer refresh only; bundled cache |
| NASA Image and Video Library API | HTTP API (JSON), `/search` + `/asset` | Developer script `fetch_nasa_media.py` only |
| NASA HRP hazard/risk pages, Human Research Roadmap | Web pages, manually curated | JSON knowledge files |
| NASA 3D Resources | Downloaded model | Decorative astronaut |
| MedlinePlus, FDA | Web pages, manually curated | Reference values and self-care steps |

Full detail: [data-sources-and-api-architecture.md](data-sources-and-api-architecture.md).

---

## 8. Summary table

| Technology | Category | In the app? | Role in one line |
|---|---|---|---|
| C++ / Arduino / ESP32 | Firmware | Yes | Sample sensor, estimate HR/SpO₂, gate quality |
| PlatformIO | Firmware build | Yes (dev) | Reproducible build and upload |
| SparkFun MAX3010x + Maxim algorithm | Sensor driver | Yes | Read FIFO; estimate HR and SpO₂ |
| I²C / USB serial | Communication | Yes | Sensor↔ESP32; ESP32↔computer |
| Python | Backend | Yes | All validation, rules, data, storage |
| PySide6 (QtCore) | Event loop, threads | Yes | Signals/slots, serial thread, timers |
| PySide6 widgets, pyqtgraph, qt-material, QtAwesome | Legacy UI | Fallback only | Earlier Qt monitor |
| pyserial | Serial | Yes | Read the ESP32 |
| pandas | Data analysis | Yes | RadLab cleaning/analysis; history trends |
| NumPy | Numerics | Yes | Percentiles, gaps, excursions |
| Pydantic | Validation | Yes | NASA rows, datasets, indicators, provenance |
| sqlite3 | Database | Yes | Local persistence |
| urllib | HTTP client | Yes | NASA requests |
| hashlib | Integrity | Yes | SHA-256 checksums |
| Electron | Desktop shell | Yes | Window, child process, IPC, security |
| React 19 | UI | Yes | Screens |
| TypeScript | Language | Yes | Typed UI and messages |
| Vite | Build | Yes | Bundle UI |
| Tailwind v4 | Styling | Yes | Design tokens |
| XState | State machines | Yes | Navigation and questionnaire |
| uPlot | Charts | Yes | Live PPG, RadLab series |
| three.js / R3F / drei | 3D | Yes | Health Compass, astronaut scene |
| open-anatomy-3d | 3D assets | Yes | Anatomy models |
| Motion, maath | Animation | Yes | Transitions, stars |
| Radix UI, lucide | UI primitives | Yes | Accessible dialogs, icons |
| unittest, Vitest, Testing Library, jsdom, node:test | Testing | Dev | Automated tests |
| PyInstaller | Packaging | Build | Frozen backend |
| electron-builder | Packaging | Build | DMG and NSIS installers |
| GitHub Actions | CI | Build | Native installer jobs |
| scikit-learn, joblib, requests, pytest, ruff, Pillow | — | **No** | Listed in requirements, not used |
| Any ML model, LLM, search index, vector DB | — | **No** | Not part of AstroLife |

## How I would explain this during the presentation

"The stack follows the data. C++ on the ESP32 measures. Python validates,
decides and stores, using pandas and NumPy for NASA data and Pydantic to
validate it. Electron is the desktop shell, and React with TypeScript is the
interface, with XState for the flow, uPlot for charts and React Three Fiber
for the 3D body. PyInstaller and electron-builder turn it into installers, and
GitHub Actions builds them on Mac and Windows."
