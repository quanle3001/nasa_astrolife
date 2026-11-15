# Does AstroLife answer the challenge?

An evidence-based check of the app against the official challenge statement
("Create Health Monitoring Software for Astronauts on Space Missions", NASA
Space Apps Challenge 2026) and the Norwalk local judging rubric. Written on
2026-11-15 from the challenge text and the Norwalk Participant Guide.

No scores are claimed. Each row says what exists, where to see it, and what
is missing.

## The objective

> Create a visual tool that helps astronauts assess their own health during
> space missions and provides guidance on treatments and health improvements.

| Part of the objective | In AstroLife | Where | Gap |
|---|---|---|---|
| A visual tool | Guided desktop app with a live pulse chart, a 3D body, colour-coded indicators and NASA data charts | Whole app | — |
| Gathers health indicators | Heart rate and SpO₂ from the ESP32 sensor; sleep hours, exercise, mood, symptoms and alerts from questions | Questions, Measurement | Blood pressure, blood sugar and body temperature are not collected |
| Astronauts assess their own health | Rules turn answers and readings into prompts with a level and a reason; each value gets a colour-coded status | Findings | Prompts are not diagnoses, by design |
| Guidance on treatments and health improvements | Each non-urgent prompt lists "What you can do now" (sourced self-care steps) and "When to involve the crew"; urgent prompts show the emergency action | Findings, Health Compass, Action Center | Steps are general guidance and NASA countermeasures, not prescriptions |
| Any kind of input | Mouse, keyboard, and a hardware sensor | — | No camera or image input |

## The questions the challenge asks teams to consider

| Question | How the app answers it |
|---|---|
| Which measurements can be performed in space? | The measurement step uses a fingertip optical sensor (pulse and oxygen), a kind of measurement that needs no lab. The catalog's "monitoring" notes say what else a crew would record for each risk. |
| Why is an exam needed? | Every question card says why it is asked: its NASA hazard, its NASA source, and for a follow-up the earlier answer that caused it. |
| How do spaceflight hazards affect these indicators? | The hazards page explains each of NASA's five hazards for the chosen mission and lists the questions and indicators that follow from it. Each finding is traced to its hazard and its Human Research Roadmap risk. |
| When might a result warrant attention from the crew or flight surgeons? | Three levels: "Act now" (emergency signs, SpO₂ at or below 88%), "Medical review" (for example SpO₂ at or below 92%, fever), "Follow up". Each prompt has a "When to involve the crew" line. |
| What actions can prevent a critical condition? | NASA countermeasures (exercise, sleep and lighting plan, nutrition plan, behavioral support) and general self-care steps are listed per prompt and tracked as follow-up actions. |

## The suggested interface idea

> The software could display a human figure where each part of the body is
> clickable and displays information about its function and health status.

The Health Compass does this: a 3D anatomical model where each region (also
listed as plain buttons below it) opens what was recorded, the prompts with their steps, the NASA
research and the follow-up actions.

## Potential considerations (optional)

| Consideration | Status |
|---|---|
| Different environments (spacecraft, station, rover, base) | **Yes.** Low Earth orbit, lunar and Mars / deep space, with phase (transit, orbit, surface, return). The mission changes hazard and question order. |
| Prompt astronauts to take measurements as routine | **Partly.** The dashboard says whether today's check-in is done and offers it; follow-up actions carry over. There are no timed reminders. |
| Gamification | **No.** Follow-up actions can be ticked off, but there are no points or streaks. |
| Dynamic charts of indicators over time | **Partly.** Live optical pulse chart; RadLab series chart; saved heart rate and SpO₂ are summarised in a trend table (latest, previous, change, range, mean), not yet a chart. |
| Colour coding to read an indicator at a glance | **Yes.** Teal inside the cited general reference, amber outside it or at the clinician reference, red at the urgent reference, always with a text label. Prompt levels are colour coded too. |
| Simple instructions and explanations; do not assume expertise | **Yes.** "How to take a good fingertip reading", what the two numbers mean, "why this question", plain self-care steps, and limits stated next to every value. |

## Norwalk judging rubric (55 points)

| Category | Max | What can be shown | What is missing |
|---|---|---|---|
| Relevance: does it solve the chosen challenge? | 10 | One flow covering gather → assess → explain → act → follow up, plus the clickable body the challenge suggests | Three of the six example indicators (blood pressure, blood sugar, temperature) are not collected |
| Does it work? Are the facts believable? | 10 | Full flow in the built app; restart resumes; offline; 197 backend and 144 interface tests; every health statement has a named source; limits are stated on screen | Sensor accuracy is not validated; a reading with a finger on the sensor should be rehearsed; one unexplained window crash was seen once in automated runs |
| Use of NASA data, with sources named | 10 | NASA OSDR RadLab API (validated, analysed, cached with checksums, retrievable live); NASA OSDR Biological Data API (study OSD-104); NASA Human Research Program hazards and risks drive question order; Human Research Roadmap evidence report on every finding | The RadLab unit could not be verified and is shown as "not stated by the API" |
| Use of the provided ESP32 (0 if unused) | 5 | ESP32 + MAX30102 → firmware estimates → serial → live chart and values; three agreeing reports are required before a reading is saved | — |
| Creativity | 10 | Mission-driven adaptive check-in; six-step evidence trace per prompt; 3D Health Compass; honest labelling of simulated and historical data | — |
| Presentation | 10 | Three-minute script and fallback in [DEMO.md](DEMO.md) | The team still has to rehearse and deliver it |

## Submission checklist from the Participant Guide

| Item | Status |
|---|---|
| Project responds directly to the challenge | See above |
| NASA or partner-agency data use is clearly explained | [NASA_DATA.md](NASA_DATA.md) |
| All datasets, code, images, models, AI use and outside tools are cited | README credits, [NASA_DATA.md](NASA_DATA.md), `desktop/THIRD_PARTY_NOTICES.md`, AI note in [DEVELOPMENT.md](DEVELOPMENT.md) |
| Licensing information is included | **Partly.** Third-party licences are listed. The repository has no LICENSE file for AstroLife's own code; the team must choose one. |
| Public demonstration or project link works without requesting access | **Team action.** The branch is local and has not been pushed. |
| Seven-slide presentation or 30-second video is linked | **Team action.** Not created. |
| Project summary, team registration, final submission button | **Team action** on the Space Apps site. |

## What would raise the weakest rows

1. Push the branch and add a LICENSE so the public link and licensing items are met.
2. Rehearse the measurement with a finger on the sensor.
3. Add manual entry for temperature and blood pressure with cited general references, shown as recorded values.
4. Turn the trend table into a chart once several real readings exist.
