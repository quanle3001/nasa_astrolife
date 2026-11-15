# Demo guide

NASA Space Apps Challenge 2026, "Health Monitoring Software".
Three-minute demo, then three minutes of questions.

## One-sentence pitch

AstroLife guides an astronaut from "which mission am I on" to "what should I do
next": NASA's hazards for that mission shape an adaptive check-in, a real
fingertip sensor adds pulse and oxygen, explainable rules produce prompts, and
every prompt is traced back to NASA evidence and the astronaut's own answers.

## Before judging

1. Plug in the ESP32. Close PlatformIO's serial monitor.
2. Start with a clean demo database so the first-launch flow appears:

   ```bash
   cd desktop && ASTROTIP_HISTORY_PATH="$HOME/astrolife-demo.sqlite3" npm start
   ```

   Delete `~/astrolife-demo.sqlite3` to reset the demo. Your real history is
   not touched.
3. **Rehearse the measurement step with a finger on the sensor.** Transport and
   timing are verified on the real board. A reading with a finger on the sensor
   has not yet been verified in the React app (see [HARDWARE.md](HARDWARE.md)).
   Check how many seconds it takes to reach a usable reading and plan for it.
4. Check the network if you plan to show "Retrieve again from NASA". The demo
   does not need it: both NASA datasets are bundled and verified.
5. Keep the window large (the screens were checked at 1440 × 888).

## Script (3 minutes)

| Time | Do | Say |
|---|---|---|
| 0:00 | Welcome → **Begin Mission Assessment** | "AstroLife is a health check-in for astronauts. It starts with the mission." |
| 0:10 | Pick **Mars / Deep Space** → Continue | "The mission changes what matters most." |
| 0:20 | Context: day 120, In transit, recent EVA yes → **Save mission context** | |
| 0:30 | Hazards page: point at the order and the plan summary; open **Space radiation** | "NASA's five hazards always apply. For Mars, radiation and distance come first, and that order sets the order of my questions. Every statement links to its NASA page and Human Research Roadmap evidence report." |
| 0:50 | **Start health check-in** → tick **None of these** → Continue | "Urgent symptoms are screened first, the same on every mission." |
| 1:00 | Answer the EVA question, then press `2` a few times; at sleep choose **Poorly** | "Because I logged an EVA, it asks about that first. Now watch: 'Poorly' adds follow-up questions, and the card says why." |
| 1:20 | **Back**, change to **Okay** | "Change the answer and the follow-ups disappear. This is a state machine, not a model. Same answers, same questions, every time." |
| 1:30 | Finish the remaining questions with `2`, choose **Missed** for exercise → Continue to measurement | |
| 1:45 | Finger on the sensor; point at the live trace and the numbers; lift the finger briefly | "This is the real sensor: an ESP32 with a MAX30102. The firmware computes pulse and oxygen. Lift the finger and the values are withdrawn at once. It never shows a stale number as live." |
| 2:05 | **Use this reading and see my findings** | "Python rules produce the prompts. Each one is traced: mission, NASA hazard, NASA risk, my own observation, the rule, the follow-up." |
| 2:20 | **Explore the Health Compass** → Muscles → Show NASA research | "The 3D body shows where each prompt belongs. Here is a real NASA space-biology study, clearly marked as mouse data, not mine." |
| 2:35 | See my next steps → mark one action done → dashboard → **NASA data** | "Follow-ups are tracked. And this is real NASA instrument data from the RadLab API: the Curiosity rover's radiation detector, analysed with pandas, with full provenance. It is labelled as historical data, never as my exposure." |
| 2:50 | Quit and relaunch | "Everything is stored locally. It resumes where I left off, offline." |

Tips: number keys answer the current question (`1` first option, `2` second).
If the reading takes too long, keep talking through the trace; do not skip the
honesty point about withdrawn values.

## If the hardware fails

Use **Run simulated stream** on the Measurement screen.

Say it plainly: "The sensor is not giving a reading, so this is the built-in
simulated stream. It goes through the same parser as the real firmware, and
the app labels it simulated everywhere, including in saved history, and
excludes it from trends."

The primary button changes to **Continue with simulated demo values**, and the
header shows "Simulated". That labelling is itself a point worth showing.

If the app cannot start at all, the earlier Qt monitor still reads the sensor:
`python software/run.py`.

## How the app addresses each judging criterion

No scores are claimed here. Each row says what can be shown and what is not done.

| Criterion | What to show | Not done |
|---|---|---|
| Relevance | One flow from mission to follow-up: gather, evaluate, explain, act, track | No clinical validation; not a medical device |
| Works | Full flow in the built app; restart resumes; works offline; 184 Python and 125 interface tests | Packaged installer not re-verified after the last backend changes; Windows untested for the React app |
| NASA data | RadLab API with validation, analysis and provenance; OSDR Biological Data API study; HRP hazards and risks driving question order; Roadmap evidence reports on every finding | RadLab unit not verified (its documentation was unavailable), shown as "unit not stated by the API" |
| ESP32 | MAX30102 → firmware → serial → Python → live chart and values; values withdrawn on contact loss | Accuracy not compared with a reference oximeter |
| Creativity | Mission-driven adaptive check-in; evidence trace per prompt; 3D Health Compass; cursor-reactive interface | — |
| Presentation | This script, the simulated fallback, the documentation set | — |

## Questions you may get

**Is this diagnosing anyone?** No. It produces prompts to follow up, with their
reasons. It never says a person is healthy, and missing data is "unassessed".

**Where is the AI?** The check-in is adaptive and explainable, built on
deterministic rules and state machines. There is deliberately no machine
learning or language model deciding anything medical, because a prompt must be
traceable to a rule and a source.

**Does the mission change the result?** No. It changes which hazards and
questions come first. The same answers give the same findings on any mission,
and a test checks that.

**How do you know the NASA data is real?** The request URL, retrieval time,
row count and SHA-256 checksums are stored with the data and shown in the
provenance panel. "Retrieve again from NASA" calls the API live.

**What does the radiation data say about me?** Nothing. It is historical
instrument data. The app says so next to the chart.

**How accurate is the sensor?** Unknown. The firmware rejects windows without
contact, with clipping or with bad timing, but the estimates have not been
compared with a reference device.

**What about privacy?** Everything stays in one local SQLite file. Nothing is
sent anywhere. The file is not encrypted, and the app says so.

**What would you build next?** Reference-device validation of the sensor;
verified RadLab units; more sensors; more OSDR studies per topic; a crew view;
encrypted storage.

## Known limitations

- Educational prototype. Not a medical device, not clinically validated.
- Sensor estimates are experimental; accuracy is unverified.
- A reading with a finger on the sensor has not yet been verified in the React
  app in this branch (transport, timing and the no-contact path are).
- RadLab unit and two instrument descriptions are unverified and shown as such.
- One intermittent crash of the Electron window was seen once in automated
  walkthroughs when switching the Compass from 3D to 2D; it did not repeat in
  later runs. If it happens, relaunch: the check-in resumes.
- The packaged app has not been re-verified since pandas and Pydantic were
  added; run from source for the demo.
- The React app has been run on macOS only.
- Local history is not encrypted.
- The anatomy models are a reference, not a scan of a person. The skin surface
  and reproductive structures are not rendered.
