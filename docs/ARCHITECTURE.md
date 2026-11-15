# AstroLife architecture

AstroLife is a desktop app with three parts that each do one job.

| Part | Technology | Job |
|---|---|---|
| Sensor | ESP32 + MAX30102, C++ firmware | Reads the fingertip optical signal and estimates heart rate and SpO₂ |
| Backend | Python (private child process) | Reads the sensor, validates data, runs the assessment rules, retrieves and analyses NASA data, stores everything in SQLite |
| Interface | React + TypeScript in Electron | Guides the astronaut through the check-in and shows the results |

The one rule that shapes everything: **the interface never scores anything.**
Answers and measurements go to Python. Python maps them to a check-in and runs
the rules. React only decides which screen and which question comes next.

```text
ESP32 + MAX30102
   │  USB serial, 115200 baud, text lines
   ▼
Python backend (software/astrotip)
   ├ inputs/      SerialReader, ReportParser, SimulatedReader
   ├ bridge/      BridgeService (JSON lines), PpgBatcher
   ├ analysis/    rules.assess, assessment_plan, history_trends, optical checks
   ├ questionnaire/  registry validation, answers → check-in
   ├ nasa/        RadLab and OSDR retrieval, Pydantic models, pandas/NumPy analysis
   └ storage/     HistoryStore, AppStateStore (one SQLite file)
   │  stdin/stdout, one JSON object per line
   ▼
Electron main process (desktop/electron)
   │  IPC allowlist, sender check, request ids and timeouts
   ▼
Preload API  window.astrotip  (one function per operation)
   ▼
React renderer (desktop/src)
   ├ flow/flow-machine.ts              which screen (XState)
   ├ questions/questionnaire-machine.ts  which question (XState)
   ├ components/flow, compass, monitor, nasa, pages
   └ lib/ppg-buffer.ts + uPlot         live chart, outside React state
```

## The guided journey

| # | Screen | What happens | Where the logic lives |
|---|---|---|---|
| 1 | Welcome | Begin, or resume an interrupted check-in | `flow-machine.ts` |
| 2 | Mission | Choose low Earth orbit, lunar or Mars / deep space | `mission.save` |
| 3 | Mission context | Phase, mission day, recent EVA, recent gravity transition | `analysis/mission_context.py` |
| 4 | Hazards | NASA's five hazards, ordered for this mission, with the check-in plan | `mission.plan` → `assessment_plan.build_plan` |
| 5 | Safety screen | Nine urgent items, the same for every mission | `session.preview` → `rules.assess` |
| 6 | Questions | One question at a time, follow-ups appear and disappear | `questionnaire-machine.ts`, re-checked in `questionnaire/registry.py` |
| 7 | Measurement | Live optical pulse, heart rate and SpO₂ from the firmware | `sensor.*` events |
| 8 | Findings | Prompts, measurement quality, what was reported, trends, NASA context | `session.submit` → `rules.assess` + `build_trace` |
| 9 | Health Compass | 3D or 2D body view; pick a region to see its information | `components/compass` |
| 10 | Actions | Follow-up actions, mark done, reassess | `actions.list`, `actions.update` |
| — | Dashboard | Later launches start here: mission, latest check-in, live values, open actions | `session.current` |

"Report concern" is available on every screen. It interrupts the current step
and returns to it afterwards.

## Bridge contract (protocol 2)

Electron starts `python -m astrotip.bridge.service` (or the packaged sidecar) and talks
to it over stdin and stdout. There is no network listener.

Request: `{"id": 7, "method": "session.submit", "params": {...}}`
Response: `{"id": 7, "ok": true, "result": {...}}` or `{"id": 7, "ok": false, "error": "..."}`
Event: `{"event": "sensor.reading", "payload": {...}}`

| Method | Purpose |
|---|---|
| `system.ping`, `system.config`, `system.shutdown` | Health check, labels and paths, clean exit |
| `ports.list` | Serial ports that may be the ESP32 |
| `sensor.connect`, `sensor.disconnect` | Open or close the real sensor |
| `sensor.simulate` | Start the labelled demo stream (see "Simulated stream") |
| `knowledge.get` | NASA catalog, mission context, question registry, HRR evidence, indicators, OSDR studies |
| `mission.get`, `mission.save`, `mission.plan` | Mission profile and the check-in plan derived from it |
| `session.current`, `session.start`, `session.save` | Open session, new session, save progress |
| `session.preview` | Assess the answers so far (used by the safety screen) |
| `session.submit` | Assess answers plus the backend's own sensor reading; save; create actions |
| `actions.list`, `actions.update` | Follow-up actions |
| `health.assess`, `health.save` | Concern report and live-reading review (in memory until saved) |
| `history.list`, `history.trends` | Saved check-ins and their descriptive summary |
| `nasa.radlab.get` | Cached RadLab dataset with analysis; `{refresh: true}` retrieves from NASA on a worker thread |

| Event | Payload |
|---|---|
| `backend.ready` | Same payload as `system.ping`, sent once at start |
| `sensor.connection` | `state`, `port`, `source` (`sensor` or `simulated`) |
| `sensor.status` | Text status and faults from the reader |
| `sensor.reading` | Firmware estimates, `usable`, `signal_status`, `sample_rate_hz`, `firmware_version`, `optical_state`, `reading_state`, `source`, and an assessment |
| `sensor.ppg.batch` | `stream_id`, `batch_seq`, `source`, `seq[]`, `t_ms[]`, `red[]`, `ir[]`, `dropped`, `contact` |
| `nasa.radlab.updated` | Result of a refresh |

Safety properties of the bridge: unknown methods and unknown health fields are
rejected, input lines are limited to 1 MB, every request has an id and a
timeout, and the backend exits with the desktop process. Electron is sandboxed
with context isolation; the renderer has no Node access. External links open
only for `https://*.nasa.gov`.

### Where a measurement comes from

`session.submit` does **not** accept heart rate or SpO₂ from the renderer. With
`{"use": "sensor"}` the backend uses the median of its own three latest
agreeing firmware reports (`latest_sensor_checkin`). Contact loss or disagreement
clears that window. A check-in without a reading needs
`{"use": "none", "reason": "sensor_unavailable" | "no_stable_reading"}` and is
stored as unassessed, never as normal. Values typed from another instrument are
stored as `manual`.

## Live optical pulse (PPG)

```text
firmware  PPG,<seq>,<ms>,<red>,<ir>   about 25 lines per second
   → ReportParser → SerialReader.optical_sample_received
   → PpgBatcher: flush every 80 ms or 32 samples; queue capped at 256
   → event sensor.ppg.batch → IPC channel backend:ppg
   → ring buffer (typed arrays) → uPlot, redrawn at most 30 times per second
```

- Device sequence numbers and device timestamps are forwarded unchanged.
- If the consumer stalls, the oldest samples are dropped and the count is sent
  in `dropped`, so the chart breaks the line instead of joining across a gap.
- An exact repeat of the previous sample is dropped (seen on the real board at
  the moment the port opens).
- The chart applies a display-only baseline and smoothing filter. Heart rate
  and SpO₂ come from the firmware report, never from the drawn line.
- Samples live in memory only. They are not written to history.

## Simulated stream

`sensor.simulate` runs `SimulatedReader`, which writes firmware-format text
through the real `ReportParser`. It exists so the demo still works if the board
fails. Everything it produces carries `source: "simulated"`: the header badge,
the dashboard, findings, history and the stored check-in
(`input_source = "simulated"`). Simulated entries are excluded from trends.

## Storage

One SQLite file, by default `<LOCALAPPDATA or ~/.local/share>/AstroTip/history.sqlite3`
(the folder keeps its earlier name so existing records stay readable).
`ASTROTIP_HISTORY_PATH` points the app at another file.

| Table | Owner | Contents |
|---|---|---|
| `checkins` | `HistoryStore` | Saved check-ins with their assessment (unchanged from earlier versions) |
| `mission_profile` | `AppStateStore` | The one mission profile |
| `assessment_sessions` | `AppStateStore` | Sessions: in progress, submitted or abandoned, with answers and result |
| `followup_actions` | `AppStateStore` | Actions created by a submitted session, open or done |

The schema version is `PRAGMA user_version`. An older file is upgraded in place
by adding tables. Nothing is written until there is something to save. The file
is not encrypted, and the app says so.

## Traceability

Every finding in a submitted check-in carries an evidence trace built by
`assessment_plan.build_trace`:

| Field | Meaning |
|---|---|
| `hazards` | NASA hazards for the topic, with their rank for this mission |
| `nasa_risks` | Human Research Roadmap risk id, title, risk page and evidence report |
| `observations` | The astronaut's own answers (question id, answer id) and measurements (indicator, value, unit, source, sensor port, time, signal quality) |
| `rule_reason`, `actions` | What the rule said and the follow-up it created |
| `traceability.nasa_source_ids`, `nasa_risk_ids` | Catalog sources and HRR risks |
| `traceability.question_ids`, `observation_ids`, `rule_ids` | What was asked, what was observed, which rule inputs fired |
| `traceability.rules_engine`, `rules_version` | `astrotip.analysis.rules.assess`, `2026.11.1` |
| `traceability.catalog_reviewed_on`, `question_registry_version`, `evidence_reviewed_on` | Versions of the knowledge used |
| `traceability.action_ids`, `history_entry_id`, `session_id` | Where the result was stored |

The interface shows this as a six-step chain per prompt (mission → hazard →
NASA risk → your observation → rule → follow-up) with the identifiers under
"Audit details".

## Analytics and "AI engine"

AstroLife uses deterministic, explainable analysis. There is **no machine
learning and no language model** in the assessment.

| Need | Tool | Where |
|---|---|---|
| Assessment | Python rules engine | `analysis/rules.py` (`RULES_VERSION`) |
| NASA dataset processing and statistics | pandas, NumPy | `nasa/radlab.py`, `nasa/radlab_analysis.py` |
| History analysis | pandas | `analysis/history_trends.py` |
| Validation of API responses, units, timestamps, provenance | Pydantic | `nasa/models.py`, `nasa/osdr.py` |
| Deterministic branching | XState | `flow-machine.ts`, `questionnaire-machine.ts` |

SciPy is not used: the analysis is descriptive (medians, quartiles, gaps,
excursions) and needs nothing beyond pandas and NumPy.

Each NASA pipeline follows Retrieve → Validate → Clean → Analyze → Store →
Explain. See [NASA_DATA.md](NASA_DATA.md).

## 3D scenes

Only one WebGL scene runs at a time. The star and astronaut scene is unmounted
while the Health Compass shows the 3D anatomy. Both are lazy chunks. Without
WebGL the Compass falls back to the 2D body map, which has the same functions.
"Pause motion" and the OS reduced-motion setting stop decorative animation
everywhere.

## PySide6 fallback

`python software/run.py` starts the earlier Qt interface. It uses the same
Python modules and stays as a fallback monitor.
