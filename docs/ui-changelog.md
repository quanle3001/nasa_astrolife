# UI branch changelog: `codex/astrotip-space-ui`

This file organizes every commit on the UI branch into phases so reviewers can
read the history in order. Hashes are the real local commits. The branch is
based on `main` at `22957bd` and has not been pushed or merged.

Read the whole branch:

```bash
git log --oneline 22957bd..HEAD
```

Each commit follows [Conventional Commits](https://www.conventionalcommits.org/)
(`type(scope): summary`), contains one coherent change, and was checked before
committing (`npm run typecheck`, `npx vitest run`, and for media or bridge work
the Python suite). No commit touches firmware, sensor algorithms, assessment
rules, storage or the serial protocol.

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
