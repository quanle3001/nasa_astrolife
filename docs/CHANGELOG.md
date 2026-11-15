# Changelog

Commits grouped into phases so the history can be read in order. Hashes are
the real local commits. Two branches are covered:

- **`astrotip-space-ui`** (phases 0–8): the React and Electron interface,
  based on `main` at `22957bd`.
- **`feat/astrolife-mission-flow`** (phases 9–16): the guided mission flow,
  created from `astrotip-space-ui` with `origin/main` (`2ec011a`) merged in.
  Nothing on this branch has been pushed or merged into `main`.

```bash
git log --oneline 22957bd..HEAD
```

Each commit follows [Conventional Commits](https://www.conventionalcommits.org/)
(`type(scope): summary`), holds one coherent change, and was checked before
committing (typecheck, Vitest, and the Python suite for backend work).

## Phase 0: Baseline (work from the earlier Codex session)

These five commits capture work that was uncommitted when this branch was
picked up, split by area so the later UI commits stay readable.

| Commit | Summary |
|---|---|
| `a379d48` | chore: ignore desktop build output and local screenshots |
| `28bb3cb` | feat(media): offline NASA mission media cache and fetch script |
| `bce43f6` | feat(bridge): JSON-lines Python bridge for the desktop shell |
| `b92f88e` | feat(ui): PySide6 fallback restyled with space theme widgets |
| `fa5e460` | feat(desktop): React + Electron mission-control interface |

## Phase 1: Fix existing layout bugs

| Commit | Summary |
|---|---|
| `4a9144c` | Border beam masked to a ring (it painted a wedge over the LEO photo); black-hole seam; hero typography; nav alignment; 10 px text floor |
| `e02d517` | Reset scroll position when switching pages |
| `6ae5872` | Center the medical disclaimer on one line |
| `e8dea9c` | Let Tailwind utilities override panel/control primitives (restored the urgent card styling) |

## Phase 2: Deep-space design system

| Commit | Summary |
|---|---|
| `4b093e1` | Design tokens (`@theme` colors, status colors, radius, spacing, type, motion, focus) |
| `da39f00` | Translucent surfaces and full black-hole crown, following Space Portfolio |
| `b32a0e6` | Soften the viewport scan-sweep edge |

## Phase 3: Hero, mission cards and Space UI components

| Commit | Summary |
|---|---|
| `4dde642` | Hero rebuilt around the selected mission's NASA photo (Space UI ProximityGrid, FrostBlurred) |
| `2655e8d` | Space UI StatusBadge for backend and sensor state |
| `10dcf30` | Floating motion restored on hero telemetry cards |
| `ae70f3c` | Interactive mission cards: radio group, accent selection, NASA credits, clip previews |
| `7527221` | Shared HUD viewfinder look for hero and cards; viewport defects fixed |

## Phase 4: NASA media

| Commit | Summary |
|---|---|
| `ea9c7a1` | Cache short NASA preview clips (lunar visualization, Mars footage) with provenance |

The media playback coordinator and manifest-driven mission data ship in
`ae70f3c` (Phase 3), because the cards depend on them.

## Phase 5: Accessibility and UX review (Impeccable, UI UX Pro Max)

| Commit | Summary |
|---|---|
| `23c1946` | In-app "Pause background motion" control (WCAG 2.2.2) |
| `55f4a35` | Small text and placeholders raised to WCAG AA contrast |
| `0ebfc0e` | Telemetry freshness ("Updated…", "Stalled") and a real linking state |
| `e29ef6e` | Inline check-in field errors; focus kept clear of sticky bars |
| `e7de894` | Loading skeleton before the History archive resolves |
| `d2f7e81` | Impeccable craft floor: kickers, section numbers, halos, type scale, motion timing |
| `bea3865` | Serial connection failures stay visible (critique P1) |
| `a75db25` | Critique P2s: dialog focus return, Telemetry headings, "History" wording, 200% zoom nav |
| `f1ff0f9` | Remove unused styles |
| `64996da` | Keyboard shortcuts with an in-app reference |

## Phase 6: Tests

| Commit | Summary |
|---|---|
| `5711bd9` | Mission media, playback rules and viewport states |
| `6ab362a` | Pause-motion toggle |
| `f91e3b4` | Keyboard shortcut map and reference dialog |

Some fixes carry their own regression tests in the same commit (`e29ef6e`,
`e7de894`, `0ebfc0e`, `bea3865`, `a75db25`).

## Phase 7: Documentation

| Commit | Summary |
|---|---|
| `ec115f7` | Component sources, licenses, design system, NASA media |
| `28d918c` | Impeccable and UI UX Pro Max review findings |
| `05cfd85` | Impeccable critique score and polish fixes |

This changelog and the keyboard-shortcut docs are added by the `docs(ui)`
commit that follows `f91e3b4`.

## Phase 8: AstroLife branding

| Commit | Summary |
|---|---|
| `40d4620` | Rename the product from AstroTip to AstroLife (user-visible text only) |
| `93b69aa` | AstroLife space logo, favicon and app icon |

The branding docs are added by the `docs(brand)` commit that follows
`93b69aa`.

# Guided mission flow: `feat/astrolife-mission-flow`

## Phase 9: Merge and repair

| Commit | Summary |
|---|---|
| `594dbf9` | Merge `origin/main`: teammate's firmware `astro-life-ppg-2`, PPG stream, optical quality checks, mission-free check-ins |
| `ecad748` | Adapt the desktop bridge to check-ins without a mission field |

## Phase 10: Real sensor stream in React

| Commit | Summary |
|---|---|
| `f14f00f` | Stream PPG samples to the React interface (batcher, dedicated IPC channel, ring buffer, uPlot chart, labelled simulated stream) |
| `ae93b93` | Make the sensor reading a required part of every check-in; the backend uses its own reading |
| `5bbea55` | Drop repeated deliveries of the same optical sample (seen on the real board) |

## Phase 11: Mission, questions and sessions

| Commit | Summary |
|---|---|
| `2584ecd` | Mission context and hazard mapping |
| `2a6657c` | Adaptive question registry, sessions and follow-up storage |
| `40d0ddb` | Desktop question engine and navigation state machine |
| `4f435c8` | Let the safety preview run before later required questions |
| `7a0f7e7` | Drive branching with an XState machine; explain why each question is asked |

## Phase 12: Guided flow interface

| Commit | Summary |
|---|---|
| `62267a6` | Health Compass, Action Center, dashboard and monitor components |
| `4638810` | Guided onboarding: welcome, mission, context, hazards, safety, questions, measurement, findings |
| `9560589` | Impeccable craft floor applied to the guided flow |

## Phase 13: Health Compass in 3D

| Commit | Summary |
|---|---|
| `69ea4bc` | 3D anatomy with `open-anatomy-3d`; skin surface and reproductive structures never rendered |
| `f563756` | Guide pins, hover summaries and fly-to zoom |
| `7903405` | NASA astronaut as a cursor-responsive decorative scene |

## Phase 14: NASA data

| Commit | Summary |
|---|---|
| `a428a7a` | RadLab radiation dataset: retrieval, validation, verified cache |
| `ce756ab` | Radiation Explorer on the NASA data tab |
| `79862aa` | Human Research Roadmap evidence reports for every health topic |
| `37d051c` | NASA hazard and risk knowledge drives the assessment plan and trace |
| `fd6189d` | Assessment plan, evidence trace and radiation analysis in the interface |
| `4e771be` | pandas, NumPy and Pydantic for NASA and history analysis |
| `17ccb3a` | OSDR Biological Data API: one space-biology study with the muscle topic |

## Phase 15: Design review and motion

| Commit | Summary |
|---|---|
| `caf7248` | Apply the Impeccable and UI UX Pro Max findings |
| `72ee9f7` | Cursor-reactive hover, press and scroll feedback |
| `8eaed08` | Shared priority labels in health history |
| `1eee253` | Plain wording on the sensor dock |

## Phase 16: Documentation

Architecture, question engine, NASA data, hardware, development and demo
guides; this changelog (renamed from `ui-changelog.md`); `UI_UX.md` (renamed
from `ui-components.md`, with `software/UI_REDESIGN.md` merged in); READMEs.
See `git log --oneline -- docs README.md` for the commits.

## Phase 17: Sensor capture, palette and motion (15 November, with Codex)

| Commit | Summary |
|---|---|
| `32b2945`, `e431404` | Firmware: emit each PPG record in one write; synchronize serial monitor output |
| `77f9d70` | Require three agreeing firmware reports; save their median as the check-in reading |
| `f5a0a9c`, `7a5e573` | Dark ocean palette; neutral white lighting for the astronaut |
| `47e0cff` | Overlapping screen transitions, animated stepper, astronaut poses through mission setup |
| `509579f`, `506d32c` | Lighter glass on the intro; black-hole crown on the welcome screen only |

## Phase 18: Assessment guidance and merged-build review

| Commit | Summary |
|---|---|
| `c1d4a6b` | Rules 2026.11.2: sourced self-care steps per prompt, resting heart-rate reference, indicator status for colour coding, measuring instructions. Keeps the session-saved reading. Restores component surfaces with the ocean-blue accents. Fixes the reported-section spacing, astronaut overlap, legend alignment and navbar bleed |
| `3d411f4` | "Measure again" for a saved reading; tests for guidance, indicators and follow-up actions |

| `96a2950` | Documentation for the new guidance; challenge and rubric check |
| (next commit) | Intro page on every launch; decoration colours of the reviewed version with the blue palette on components; faster 3D Compass picking; 2D map removed; badges no longer wrap |

The challenge and rubric check is in `CHALLENGE_REVIEW.md`.

## Conventions for further work

- Branch from this branch (or `main` after merge); keep one concern per commit.
- Types: `feat`, `fix`, `style` (presentation only), `refactor`, `test`,
  `docs`, `chore`. Scopes used here: `ui`, `a11y`, `media`, `bridge`,
  `desktop`.
- Stage files by path (`git add path/...`) and read `git diff --cached`
  before committing; never commit `node_modules/`, build output, local
  screenshots or health records.
- Test UI flows against a scratch database:
  `ASTROTIP_HISTORY_PATH=/tmp/astrotip-test.sqlite3 npm run dev`.
- Do not push, merge into `main`, force-push or rewrite history without the
  team's explicit go-ahead.
