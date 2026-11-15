# NASA data in AstroLife

This document lists every NASA source the app uses, what was retrieved, when,
its limits, and what each one changes in the app.

## Four kinds of information, always kept apart

Every screen labels what it shows with one of these badges.

| Badge | Meaning | Example |
|---|---|---|
| **NASA scientific evidence** | What NASA's Human Research Program says about a risk | Why sleep loss matters on a long mission |
| **Historical research measurement** | Readings from instruments on past and current missions | Dose-rate readings from the Curiosity rover on 1 January 2023 |
| **Your measurement** (sensor, manual or simulated) | A value recorded for this astronaut | 72 bpm from the ESP32 sensor |
| **Rule-based prompt** | What AstroLife's rules produced from your observations | "Follow up" on a missed exercise session |

A historical measurement is never presented as the astronaut's exposure or as
live telemetry. A NASA study about animals is never presented as human data.
Simulated values are never presented as measurements.

## Sources at a glance

| # | Source | Kind | Retrieval | Used for |
|---|---|---|---|---|
| 1 | NASA Human Research Program hazard and risk pages | Curated catalog | Reviewed 2026-11-14 | Hazards, health topics, question order, explanations |
| 2 | NASA Human Research Roadmap evidence reports | Curated links | Reviewed 2026-11-15 | Evidence behind every health topic and every finding |
| 3 | NASA OSDR RadLab data API | Live API + verified cache | Retrieved 2026-11-15 | Radiation Explorer and its analysis |
| 4 | NASA OSDR Biological Data API | Live API + verified cache | Retrieved 2026-11-15 | One space-biology study shown with the muscle topic |
| 5 | NASA Image and Video Library | Cached media | See `software/assets/nasa/media_manifest.json` | Mission imagery (presentation only) |
| 6 | NASA 3D Resources astronaut model | Bundled asset | Downloaded 2026-11-15 | Decoration on the welcome and context screens |

No API key is needed for any of them. No credentials are stored in the
repository.

---

## 1. Human Research Program hazards and risks

- **Pages:** [hazards](https://www.nasa.gov/hrp/hazards/), [risks](https://www.nasa.gov/hrp/risks/), [ongoing research](https://www.nasa.gov/hrp/ongoing-hrp-research/) and the risk pages linked from them.
- **File:** `software/resources/nasa_sources.json` (schema 1, reviewed 2026-11-14): 5 hazards, 13 health topics, 30 sources (23 NASA pages and 7 general health references from MedlinePlus and the FDA). Details and the topic-to-risk table are in `software/resources/dataset_manifest.md`.
- **Also:** `software/resources/mission_context.json` gives each mission (low Earth orbit, lunar, Mars / deep space) a hazard order with a NASA statement and source for each emphasized hazard.

**What it changes in the app**

| NASA information | Feature |
|---|---|
| Five hazards | The hazards page always lists all five; their order follows the mission |
| Hazard order per mission | The order of question topics in the check-in |
| Health topics and their hazards | Which topic each question, indicator and finding belongs to |
| "Why it matters", monitoring notes, research, limits | Explanations in findings, the Health Compass and the NASA data page |
| Source list | Every explanation links to its NASA page |

**Limits.** The grouping into 13 topics and the hazard order per mission are
AstroLife's editorial choices, not a NASA ranking or a probability. The order
changes presentation and question order only. It never changes a finding:
`rules.assess` does not take the mission as an input.

## 2. Human Research Roadmap evidence reports

- **Page:** [humanresearchroadmap.nasa.gov/evidence](https://humanresearchroadmap.nasa.gov/evidence/)
- **File:** `software/resources/hrr_evidence.json` (reviewed 2026-11-15). Each of the 13 health topics has at least one Roadmap risk with its risk page and evidence report. Risk titles and report links are copied from the Roadmap's Evidence page.

| Health topic | Roadmap risk ids |
|---|---|
| Low oxygen / hypoxia | 173 |
| Cardiovascular changes | 179 |
| Muscle loss and reduced fitness | 180 |
| Bone loss | 77 |
| Vision changes / SANS | 105 |
| Dizziness and motion sickness | 88 |
| Sleep loss and fatigue | 100 |
| Behavioral health and teamwork | 99, 101 |
| Immune changes | 85, 80 |
| Nutrition | 176 |
| Spacewalk injury and decompression | 84, 168 |
| Radiation | 96 |
| Medical readiness and landing injury | 95, 167 |

**What it changes in the app.** Each finding's evidence trace names the
Roadmap risk and links its evidence report. The hazards page, the Health
Compass and the NASA data page show the same reports per topic.

**Limits.** The reports describe the state of research for a risk. They do not
define a diagnosis, a clinical threshold or a treatment for a person. Validation
requires every link to be on the Roadmap's own host.

## 3. OSDR RadLab: historical radiation measurements

- **API:** `https://visualization.osdr.nasa.gov/radlab/api/`
- **Documentation:** `https://visualization.osdr.nasa.gov/radlab/gui/data-api/`
- **Request (one UTC day, one measurement):**
  `https://visualization.osdr.nasa.gov/radlab/api/?query=timestamp%3E%3D2023-01-01%20AND%20timestamp%3C2023-01-02&columns+=absorbed_dose_rate`
- **Dataset identifier:** measurement `absorbed_dose_rate`, window 2023-01-01 to 2023-01-02
- **Bundled snapshot:** `software/resources/nasa_cache/radlab_absorbed_dose_rate_2023-01-01.json`, retrieved 2026-11-15T09:03:17Z, 5,359 rows, with SHA-256 checksums of the response and of the stored data
- **Code:** `software/astrotip/nasa/radlab.py`, `radlab_analysis.py`, `models.py`

| Instrument id (as published) | Readings | Environment in AstroLife |
|---|---|---|
| `DosTel1` | 895 | Low Earth orbit (International Space Station) |
| `Lidal` | 288 | Low Earth orbit (International Space Station) |
| `CRaTER-D1D2` | 24 | Lunar (Lunar Reconnaissance Orbiter) |
| `MSL-RAD-Surface` | 82 | Mars (Curiosity rover) |
| `Liulin-MO-AB-Orbit` | 1,175 | Mars (Trace Gas Orbiter) |
| `Liulin-MO-CD-Orbit` | 1,175 | Mars (Trace Gas Orbiter) |
| `BPD` | 1,434 | Not described; shown by id only |
| `REM-Lid` | 286 | Not described; shown by id only |

### Pipeline

| Step | What happens |
|---|---|
| Retrieve | One bounded request. Size, row count and time limits are enforced. |
| Validate | Every row is checked with the Pydantic model `RadLabReading`: readable timestamp, known shape, finite non-negative value. |
| Clean | pandas removes exact duplicate rows and groups by instrument in published time order. No value, timestamp or instrument id is altered, filled in, rounded or dropped as an outlier. |
| Analyze | pandas and NumPy, per instrument (below). |
| Store | Verified cache with request URL, retrieval time, checksums, pipeline version and the list of transformation steps. Written atomically. |
| Explain | Plain statements of what was found, plus limits. |

Versions are recorded with every result: pipeline `radlab-pipeline-1.1`,
analysis `radlab-descriptive-1.1`.

### Analysis

For each instrument: count, mean, median, minimum, maximum, standard deviation,
95th percentile, time of the maximum; the usual interval between readings and
the share of expected readings present; **gaps** (a pause more than 3 times the
usual interval); **excursions** (readings more than 3 times the instrument's
own median, grouped into episodes); hourly means, hours without data, and the
first half of the day against the second.

The analysis describes the dataset. It states no cause and no health effect,
and it never ranks instruments against each other, because their location,
shielding and method differ.

### What it changes in the app

- **Radiation Explorer** (NASA data tab): instruments in the astronaut's
  mission environment are listed first; the others are labelled "for
  comparison, not your mission".
- A chart of the day's readings, the computed statistics and the plain
  statements for the selected instrument.
- A **provenance panel**: request URL, retrieval time, row count, checksums,
  versions and transformation steps.
- **Retrieve again from NASA** retrieves the same window live. If NASA cannot be
  reached, the verified cache is shown together with the reason. If no verified
  cache exists, the panel says the data is unavailable. Nothing is invented.

### Limits

- **Unit not verified.** The API response has three columns (`timestamp`,
  `instrument_id`, value) and no unit field. RadLab's documentation pages
  returned HTTP 500 when the integration was built. The unit is stored as
  unknown and shown as "unit not stated by the API".
- **Two instruments are not described** (`BPD`, `REM-Lid`) for the same
  reason. They are shown by id only.
- Instrument descriptions for the other six are AstroLife's short summaries of
  public mission information. They were not returned by the API.
- Timestamps are shown exactly as published. RadLab does not state a time zone.
- Hyphenated instrument ids cannot be used in the API's query expression, so
  the request filters by time and instruments are separated locally.
- These are historical instrument readings: not the astronaut's exposure, not
  live telemetry, not a cumulative dose.

## 4. OSDR Biological Data API: one space-biology study

- **API:** `https://visualization.osdr.nasa.gov/biodata/api/` (OpenAPI 3.1, version 2.0.0)
- **Endpoint used:** `GET /v2/dataset/{accession}/`
- **Dataset identifier:** **OSD-104** (also GLDS-104), "Rodent Research-1 (RR1) NASA Validation Flight: Mouse soleus muscle transcriptomic and epigenomic data"
- **Request:** `https://visualization.osdr.nasa.gov/biodata/api/v2/dataset/OSD-104/`
- **Study page:** `https://osdr.nasa.gov/bio/repo/data/studies/OSD-104`
- **Bundled record:** `software/resources/nasa_cache/osdr_OSD-104.json`, retrieved 2026-11-15T09:24:58Z, with a SHA-256 checksum
- **Code:** `software/astrotip/nasa/osdr.py`; curated link in `software/resources/osdr_studies.json`

### Evaluation

The API serves study, assay, sample and file metadata and exact-match queries.
It answered in under a second for single-study requests. It is useful for
AstroLife as a **pointer to real open research behind a health topic**, not as
a source of measurements about a person.

The integration is deliberately small: one study whose tissue (mouse soleus, a
calf muscle) and study factor (spaceflight) relate directly to the "Muscle loss
and reduced fitness" topic.

### Pipeline

Retrieve one record → validate the displayed fields with the Pydantic model
`OsdrStudy` → clean whitespace only → store with request URL, retrieval time,
checksum and pipeline version (`osdr-study-1.0`) → explain why it is shown.

There is no analysis step. AstroLife does not download or interpret the
study's sequencing data.

The curated file holds only the accession, the health topic and the reason the
study is shown. Title, organism, tissue, study factor, mission and dates come
from NASA's record. A study with a missing or damaged cache is reported as
unavailable.

Refresh the bundled record:

```bash
cd software
../.venv/bin/python -m astrotip.nasa.osdr --refresh
```

### What it changes in the app

- **Health Compass → Muscles and fitness → NASA research and sources:** the
  study card, headed "Animal study · not human data · not a measurement of you".
- **NASA data tab:** the same card under "Space-biology studies · NASA OSDR",
  with the health topic it relates to.

### Limits

Study metadata only. Mouse data is not human medical data. No rule uses it and
it cannot change a finding.

### Future extension

More studies can be added to `osdr_studies.json` (for example bone or immune
studies) without code changes. Using the API's query endpoints to list studies
per topic automatically would need a reviewed mapping from OSDR metadata terms
to health topics; that is not built.

## 5. NASA imagery

Mission images and two short clips are cached in `software/assets/nasa/`.
`media_manifest.json` records NASA ids, credits, classification ("Footage",
"Visualization", historical reference) and source links. They set the look of
the mission screens. They carry no health information and do not affect any
analysis. Refresh with `python software/scripts/fetch_nasa_media.py --with-video`.

## 6. NASA astronaut model

`desktop/public/models/nasa-astronaut.glb` from
[NASA 3D Resources](https://science.nasa.gov/3d-resources/astronaut/) (source:
DigitalSpace Corporation), unchanged. It is decoration. Credits and usage terms
are in `desktop/THIRD_PARTY_NOTICES.md`.

---

## General health references (not NASA)

Simple self-care steps, measuring instructions and the general reference
values come from public U.S. government health pages. They are named on screen
next to every step, and they are never presented as NASA limits.

| Source | Used for |
|---|---|
| [MedlinePlus: Pulse Oximetry](https://medlineplus.gov/lab-tests/pulse-oximetry/) | SpO₂ reference values (88% and 92%) |
| [MedlinePlus: Pulse](https://medlineplus.gov/ency/article/003399.htm) | Resting heart-rate reference (60 to 100 bpm), rest 10 minutes before a resting pulse |
| [MedlinePlus: Healthy Sleep](https://medlineplus.gov/healthysleep.html) | Sleep habits, 7 to 9 hours for adults |
| [MedlinePlus: Dizziness](https://medlineplus.gov/ency/article/003093.htm) | Home care for dizziness and when to get help |
| [MedlinePlus: Recognizing medical emergencies](https://medlineplus.gov/ency/article/001927.htm) | Emergency signs behind the safety screen |
| [FDA: Pulse Oximeters](https://www.fda.gov/medical-devices/products-and-medical-procedures/pulse-oximeters), [Pulse Oximeter Basics](https://www.fda.gov/consumers/consumer-updates/pulse-oximeter-basics) | Accuracy limits; how to take a fingertip reading |

The four pages added on 2026-11-15 (Pulse, Healthy Sleep, Dizziness, Pulse
Oximeter Basics) were read that day and each step in
`software/resources/care_guidance.json` restates what the page says. Spaceflight
countermeasures in the same file cite the NASA risk pages already in the catalog.

## How NASA information becomes application behaviour

```text
Mission ─► Hazards ─► Risks ─► Indicators ─► Questions ─► Findings ─► Follow-up
   │          │          │          │             │            │           │
profile   order per   13 topics  what the    topic order   rules +     actions with
          mission     + HRR      app can     and "why      evidence    their reason
                      reports    collect     this          trace       and sources
                                             question"
```

| Step | Built by | From |
|---|---|---|
| Mission → hazard order | `mission_context.json` | NASA statements per mission |
| Hazards → risks | `nasa_sources.json`, `hrr_evidence.json` | HRP risk pages, Roadmap risks |
| Risks → indicators | `health_indicators.json` | What the app can actually collect: heart rate and SpO₂ (sensor), sleep hours and exercise (questions) |
| Risks → questions | `question_registry.json` | Each question names its topic and NASA source |
| Check-in plan | `assessment_plan.build_plan` | All of the above, for the saved mission |
| Findings | `rules.assess` | The astronaut's answers and measurements only |
| Evidence trace | `assessment_plan.build_trace` | Finding + hazard rank + Roadmap risk + observations + rule version |
| Follow-up | `AppStateStore.complete_session` | The actions of each finding |

Relating an indicator to a risk never means the indicator can diagnose or rule
out that risk. A fingertip sensor cannot assess radiation exposure, bone
density, vision changes or mental health.

## Tests that prove NASA data affects behaviour

| Test file | What it shows |
|---|---|
| `software/tests/test_nasa_functional.py` | The plan is derived from the catalog, not written by hand; a different mission gives a different topic order and reasons; mission context adds and promotes topics; every finding traces from hazard to answer, rule and action; changing the mission changes the hazard context but not the finding; RadLab statistics, gaps and irregular readings are computed from the published values |
| `software/tests/test_radlab.py` | Parsing, validation, cleaning, analysis values, cache verification, HTTP failure → cache, corrupt cache → unavailable |
| `software/tests/test_osdr.py` | Record validation, checksum, wrong study rejected, missing cache → unavailable, curated list must name real topics |
| `software/tests/test_questionnaire.py`, `desktop/src/questions/*.test.ts` | Shared vectors: mission context and answers change which questions exist |
| `desktop/src/components/nasa/*.test.tsx` | Mission instruments listed first, provenance shown, "not a measurement of you" present |

Two tests call NASA and are skipped unless asked for:

```bash
ASTROLIFE_LIVE_TESTS=1 .venv/bin/python -m unittest software/tests/test_radlab.py software/tests/test_osdr.py
```

## No endorsement

NASA does not endorse AstroLife. NASA names and marks are not used as app
branding. AstroLife is an educational prototype, not a medical device.
