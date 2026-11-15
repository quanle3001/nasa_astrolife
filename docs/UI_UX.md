# AstroLife UI and UX

This document covers the interface in `desktop/`: which open-source UI work
was researched and reused (with source and license), the design system, the
NASA media rules, the guided flow, the Health Compass, the motion architecture,
and the design reviews with what they changed.

The interface is React + TypeScript + Tailwind v4 in Electron. The Python
modules (rules, serial reader, NASA pipelines, SQLite) run as a private child
process. Nothing below changes health logic, thresholds, firmware or storage.

Contents: 1 Research · 2 Adapted components · 3 Design system · 4 NASA media ·
5 First design review · 6 Brand · 7 Guided flow · 8 Health Compass ·
9 Motion architecture · 10 Second design review · 11 Qt fallback

## 1. Research summary

Each ecosystem was inspected at source level (repository tree, registry
metadata, component code and license) rather than from screenshots alone.

| Ecosystem | License | What it offers | Decision for AstroLife |
|---|---|---|---|
| **Space UI** — `usespaceui/ui` ([spaceui.one](https://www.spaceui.one/)) | MIT | ~90 registry components on Motion + Tailwind + cva: Interactive Grid Hero (ProximityGrid), Frost Blurred, Status Badge, Timeline, Data Grid, Dirt/Dither carousels, Morphing Area, Glass/Squircle buttons, shaders | **Adopted (adapted):** ProximityGrid, FrostBlurred, StatusBadge. Same stack as AstroLife (`motion`, `cva`, `cn`), no new dependencies. |
| **Space Portfolio** — `sanidhyy/space-portfolio` | MIT | R3F star field, black-hole hero video, translucent navbar, layered hero composition | **Primary atmosphere reference.** Starfield and black-hole video already reused; surface tinting, navbar transparency and crown placement now follow its values (see §3). |
| **AEON / SPACE** — `skybird-dev/ropiaspace` | `package.json` says MIT; no LICENSE file | Astro 6 site: cinematic hero, mission cards, stats, launch countdown | **Design reference only.** No code copied: there is no license text or copyright notice to retain, and its components are Astro-first. |
| **Living Planet** — `larrybuckalew/living-planet` | MIT | three.js NASA-textured globe, day/night terminator, lazy globe loading | **Not integrated.** A second WebGL canvas on top of the existing starfield would add GPU cost for a decorative effect; the LEO hero uses a real ISS Earth-limb photograph instead. Its lazy-loading pattern matches what the starfield already does. |
| **Spacedrive SpaceUI** — `spacedriveapp/spaceui` | MIT | Desktop design system: tokens (dark/midnight/noir themes), Radix-based primitives, Resizable, Tabs, Toast, forms | **Pattern reference.** Its token layering (raw colors → semantic theme variables) informed AstroLife's token structure. Packages were not installed; they assume Spacedrive's own Tailwind preset. |
| **Magic UI** — `magicuidesign/magicui` | MIT | Border Beam, Shine Border, Particles, animated lists | **Kept:** Border Beam (already adapted; now correctly masked to a ring). |
| **shadcn/ui**, **Radix UI** | MIT | Local primitive conventions; accessible Dialog/Tooltip/Slot | **Kept** (already in use). |
| **React Bits** — `DavidHDev/react-bits` | MIT + Commons Clause | Animated text, backgrounds, Galaxy/Hyperspeed WebGL | **Not used.** The Commons Clause restricts selling the software; most relevant pieces are full-screen WebGL/OGL backgrounds that would compete with the starfield. |
| **Motion Primitives** — `ibelick/motion-primitives` | MIT | Text effects, spotlight, transition panels | **Not needed.** The mission-card pointer spotlight and page transitions already use Motion directly. |
| **Aceternity UI**, **21st.dev**, **awesome-shadcn-ui** | various | Discovery catalogues of the above patterns | Used for discovery; nothing copied from them directly. |

### Space UI components considered and rejected

| Component | Why not |
|---|---|
| Dither Carousel | WebGL2 dither shader; expensive and decorative for a 3-item choice. |
| Dirt Carousel | 3D drag/auto-rotate ring; hides two of three missions at a time and adds motion to a clinical form. A plain radio group is faster and accessible. |
| Morphing Area, Glass Button | Require `@usespaceui/squircle` and `@base-ui/react`; benefit did not justify two new dependencies. |
| Timeline, Data Grid, Resizable | Require `@base-ui/react`, TanStack Table or `react-resizable-panels`. History has one list and one detail pane today; revisit if it grows. |
| Shaders (cloud, mesh gradient, paper) | Full-screen fragment shaders; conflicts with the "no continuous GPU load" requirement. |

## 2. Adapted components and attribution

All adapted files keep a header naming the source repository, path, license
and what changed.

| AstroLife file | Source | License | Adaptation |
|---|---|---|---|
| `desktop/src/components/spaceui/proximity-grid.tsx` | Space UI — `src/registry/blocks/interactive-grid-hero/interactive-grid-hero-1/proximity-grid.tsx` | MIT, © 2026 Space UI | AstroLife cell token color, radial edge fade, disabled under reduced motion, no min-height/background so it sits behind the hero viewport. Idle cost is zero (Motion values update only on pointer move). |
| `desktop/src/components/spaceui/frost-blurred.tsx` | Space UI — `src/registry/components/spaceui/frost-blurred` | MIT, © 2026 Space UI | Tint uses `--color-space-black` instead of shadcn `--background`. Used on mission-card captions. |
| `desktop/src/components/spaceui/status-badge.tsx` | Space UI — `src/registry/components/spaceui/status-badge` | MIT, © 2026 Space UI | Inline mode only; statuses reduced to online/offline/warning/info; token colors; ping only for a live link and off under reduced motion; `role="status"`. |
| `desktop/src/components/effects/border-beam.tsx` + `.border-beam` CSS | Magic UI — Border Beam | MIT, © Magic UI | Conic gradient masked to a 1.5px ring with `mask-composite: exclude`. |
| `desktop/src/components/effects/star-background.tsx` | Space Portfolio — `components/main/star-background.tsx` | MIT, © 2024 Sanidhya Kumar Verma | Ported to Vite; lazy chunk; reduced-motion aware. |
| `desktop/public/videos/blackhole.webm` | Space Portfolio — `public/videos/blackhole.webm` | MIT, © 2024 Sanidhya Kumar Verma | Keeps the source hero's rotated, `-340px` top-cropped composition behind the stars. AstroLife preserves the bright ring but shifts its purple energy to ocean blue and ice cyan over the original black field; the loop is hidden and paused after the intro and under reduced motion. |

Full license texts are reproduced in `desktop/THIRD_PARTY_NOTICES.md`.

## 3. Design system

Tokens live in `desktop/src/styles.css`:

- **Colors** (`@theme`, generates Tailwind utilities such as `bg-space-surface`):
  `space-black #02040b`, `space-bg #060a16`, `space-surface #0c1424`,
  `space-elevated #141e34`, `space-border #263a54`, `space-blue #5692a9`,
  `space-cyan #9dcddc`, `space-white #f1f6ff`, `space-silver #c9d5e4`,
  `space-muted #a5b4c8`, `space-subtle #7c8ca3`, and evidence violet
  `#8b7cf6`. This restores the original midnight-neutral surface hierarchy and
  its semantic violet research role without restoring the original electric
  blue. Ocean blue and ice cyan from the later palette remain the interaction,
  focus, chart, and atmospheric accents. The canvas stays near-black; blue is
  never the main page fill.
- **Status colors** (`--status-urgent/review/watch/info/live`): clinical
  meaning only, never decorative; unchanged from the original priority colors.
- **Surfaces:** `--panel-bg` (30–46% tint with a 12px blur: dark enough to read
  over the starfield while preserving the space scene behind it),
  `--panel-border`, `--panel-border-hover`, `--panel-highlight`,
  `--shadow-panel`, `--shadow-float`, `--shadow-lift`.
- **Radius** `--radius-sm/md/lg/xl/pill`; **spacing** `--space-1…8`,
  `--page-max`, `--page-gutter`, `--nav-height`, `--control-height`.
- **Type scale** `--text-label` (11px floor), `--text-xs` (12px), `--text-sm/base`,
  `--text-hero`, `--text-page-title`; `--font-sans/display/mono`.
- **Motion** `--ease-out`, `--ease-in-out`, `--duration-fast/base/slow/atmosphere`.
- **Focus** `--focus-ring` (2px space-black gap + 2px ice-blue ring).
- **Background layers** `--layer-atmosphere/stars/crown/content/nav`.

Primitives (`.glass-panel`, `.control`, `.priority-*`, …) sit in
`@layer components` so per-element Tailwind utilities (for example the urgent
card's rose border) always win.

Shared UI language:

- **HUD viewfinder corners** (`.hud-brackets`) in the mission accent color, on
  the hero viewport and on mission cards (hover, focus, selected).
- **Floating telemetry cards** (Motion, 4.8 s bob/tilt, staggered) from the
  original telemetry hero.
- **Mission accent** (`--accent`) per mission: LEO ice blue, lunar silver-blue,
  Mars amber; drives frame border/glow, eyebrow color and selected ring.

### Motion budget

Motion has three jobs: preserve place between screens, confirm an action, and
support the Home hero. Screen changes use short overlapping opacity/depth
transitions; progress, selections and controls respond to state changes; the
astronaut supplies the only large spatial gesture. Routine controls use
160–240 ms feedback and screen entrances use 340 ms, with exits deliberately
shorter. Generic staggered or scroll-driven reveals are not used.

Decorative motion is compositor-only (transforms and opacity): star rotation,
orbital tracks, Ken Burns drift and scan sweep. Cards that hold values being
read do not drift. The proximity grid and cursor effects (§9) react only to
pointer movement. One WebGL scene runs at a time: the star and astronaut scene
is unmounted while the 3D anatomy viewer is open. The navbar's "Pause motion"
control and `prefers-reduced-motion` stop ambient loops and spatial travel,
hide the crown video and stop autoplay; immediate color, border, focus and
semantic state feedback remains.

## 4. NASA media

Only `https://images-api.nasa.gov` is used, and only by the manual refresh
script `software/scripts/fetch_nasa_media.py`. The app makes no network calls
at startup or at runtime.

| Mission | Still (NASA ID) | Preview clip (NASA ID) | Clip classification |
|---|---|---|---|
| `leo` | `iss058e005282` — ISS solar arrays over Earth's limb with aurora (NASA / JSC) | none — no short clip suited a card | — |
| `lunar` | `as17-134-20473` — Earth above the Apollo 17 LRV antenna (NASA / JSC, historical) | `GSFC_20190513_m4714_Lee_Lincoln_Scarp_Moon_Flyover` (NASA / GSFC) | Data visualization (LRO terrain), not footage |
| `mars` | `PIA24264` — Mastcam-Z first 360° panorama (NASA / JPL) | `JPL-20210222-M2020f-0002-NASA’S Perseverance Rover’s First 360 View of Mars` (NASA / JPL) | Real rover imagery |

Rules enforced by the code:

- `media_manifest.json` is the single source for IDs, credits, dates and source
  links; `desktop/src/lib/missions.ts` derives from it.
- Clips are the ~480×270 `~preview` rendition (≈2.2 MB each), host-checked
  (`images-assets.nasa.gov`), MIME-checked (`video/mp4`) and capped at 4 MB.
- Cards tag clips **Footage** or **Visualization**; the dialog shows each clip's
  own credit, classification and NASA source link.
- The still image is the poster. A missing file or a playback error keeps the
  still; a missing still shows a neutral panel, never a broken element.
- One clip plays at a time (hover/focus), offscreen clips pause, and the
  black-hole crown pauses while a clip plays.

NASA does not endorse AstroLife, and NASA insignia are not used as branding.

## 5. First design review: Impeccable and UI UX Pro Max (dashboard UI)

The UI was reviewed against two design skills: Impeccable 4.9.1 (Operate mode
and craft floor) and UI UX Pro Max (`--design-system` for a dark health
monitoring console, plus the `ux` guidelines). Impeccable's context launcher
needs a downloaded engine binary, so its documented fallback was used: the
playbooks were applied directly against the running app. There is no
PRODUCT.md or DESIGN.md yet.

| Finding | Source | Change |
|---|---|---|
| Endless video and loops with no way to stop them (WCAG 2.2.2) | Both | Navbar "Pause background motion" toggle, persisted; OS reduced motion still honored |
| `slate-500` small text at 4.02:1; placeholders at ~3.6:1 | UUPM priority 1, Impeccable verify | All text on tokens, ≥4.5:1 on every page (scripted scan) |
| Telemetry could look live while frozen | UUPM real-time/operations pattern | Update time, "Stalled" after 10 s without data, dimmed old values |
| Numeric errors only shown at the bottom after a round trip | UUPM forms rules | Inline format errors with `aria-describedby`, focus first invalid field |
| Archive flashed "No saved check-ins" while loading | Impeccable states, UUPM loading | Skeleton with `aria-busy` until the first response |
| Focused fields could hide under the sticky bar | UUPM focus not obscured | `scroll-padding` on the scroll container |
| Kickers above headings, decorative 01/02/03, gradient heading, zero-offset halos, fluid page titles, long page-load choreography | Impeccable craft floor and Operate mode | Removed or replaced (see the `style(ui): apply the Impeccable craft floor` commit) |

Deliberately kept because the project brief pins them: the hero product label
("NASA-inspired crew health console") and the Space Portfolio gradient on
"in orbit."; the decorative atmosphere (black hole, starfield, floating
cards) the brief asked for, now pausable.

### Impeccable critique and polish (single-context run)

Critique scored **23/40 (Acceptable)** on Nielsen's heuristics for this
Operate surface. Its detector and snapshot storage need the downloaded engine
binary, so evidence came from CDP checks on the running app instead. The
polish pass fixed:

| Severity | Issue | Fix |
|---|---|---|
| P1 | Failed serial connect showed only "Disconnected" (backend error overwritten) | Fault kept as a `role="alert"` with recovery guidance; real linking state |
| P2 | Focus dropped to `<body>` after the NASA media dialog | Focus returns to the opening expand button |
| P2 | Telemetry had one heading | `h2` for the sensor dock, Live interpretation, Local-first by design |
| P2 | "Archive" vs "Health history" vs "Save to history" | Nav renamed "History" |
| P2 | Navbar collided at 200% zoom (490 px) | Duplicate home mark hidden below 600 px |

Keyboard shortcuts were added afterwards (`64996da`; see
`desktop/README.md`), addressing the Flexibility and Efficiency score.

Left as recommendations (structural, beyond polish): the duplicate mission select plus
cards (`/impeccable distill`), grouping the 17 symptom checkboxes
(`/impeccable layout`), contextual help for SpO2 estimates and priorities
(`/impeccable clarify`).

The full, phase-grouped commit history is in [`CHANGELOG.md`](CHANGELOG.md).

## 6. AstroLife brand

The product was renamed from AstroTip to AstroLife. User-visible text
changed everywhere. Internal identifiers kept their names: the `astrotip`
Python package, `window.astrotip`, `ASTROTIP_*` variables, the
`astrotip-backend` sidecar and the repository. The firmware banners and the
local history folder also kept theirs, so the serial parser and existing
records keep working.

| Asset | Path | Notes |
|---|---|---|
| Mark | `desktop/public/logo.svg` | Original artwork; navbar, splash, favicon |
| App icon source | `desktop/build/icon.svg` | Mark on a dark rounded tile (macOS grid) |
| App icon | `desktop/build/icon.png` | 1024 px render used by electron-builder and the dev Dock |

Design sources:
- **Space-agency emblem:** a deep-blue disc, stars and a tilted orbit ring
  passing in front of the symbol.
- **Antigravity mark:** a smooth rising arch, read as an "A" and as lift.
- **AstroLife's own element:** a heartbeat crossbar for crew health.

NASA's red chevron, wordmark and insignia are intentionally absent; the
mark must not suggest NASA endorsement.

## 7. Guided flow

The app is one journey with Back, save and resume, not a set of tabs. Tabs
(Dashboard, Monitor, Compass, NASA data, History) appear after the first
check-in. The steps and their logic are listed in
[ARCHITECTURE.md](ARCHITECTURE.md).

Shared pieces in `desktop/src/components/flow/common.tsx`:

| Piece | Purpose |
|---|---|
| `FlowPage` | Title, lead, content, and a sticky bar with Back, the primary action and the reason it is disabled |
| `ProvenanceBadge` | The four kinds of information: NASA scientific evidence, historical research measurement, your measurement (sensor, manual, simulated), rule-based prompt |
| `SourceList`, `EvidenceReports` | NASA source links and Human Research Roadmap reports |
| `EvidenceTrace`, `TraceAudit` | The six-step chain behind a prompt, and its identifiers |
| `LEVEL_LABELS` | One wording for priorities everywhere: Act now, Medical review, Follow up, Monitoring only |

Writing rules used on every screen:

- A missing value is "No reading" or "unassessed", never a dash that could be
  read as normal.
- "No prompt" is never phrased as a clearance.
- A disabled primary action says what is missing.
- Simulated data is named as simulated wherever it appears.
- Urgent guidance is shown before anything else, on the findings screen and on
  the dashboard.

The measurement step separates live telemetry from the saved check-in value.
Python captures the first stable median of three agreeing firmware reports and
stores that bounded aggregate with the open session. The screen then shows the
saved heart rate, SpO₂, method and report count, tells the astronaut they may
remove their finger, and enables Continue from the saved snapshot. Later
contact loss can withdraw the live chart and numbers without revoking the
completed step. Simulated captures keep their warning label.

Reused from the existing UI rather than rebuilt: `MissionSelector`,
`MissionViewport`, the Space UI `StatusBadge`, `Card`, `Button`, the Radix
dialog, the design tokens, the motion-pause preference and the shortcut map.

## 8. Health Compass

The Compass shows the body in 3D with `open-anatomy-3d` 0.1.0 (code MIT,
models CC BY 4.0, bundled locally; credit line beside the viewer). The 2D body
map has the same functions and is the fallback when WebGL is unavailable.

| Behaviour | Detail |
|---|---|
| Guide labels | Pins on the model name the selectable regions; a blue dot marks a region with a prompt |
| Hover, then pick | Hovering a structure or pin shows a short summary card; selecting opens the full panel |
| Zoom | The camera flies to the selected region; "Reset view" steps back; drag to rotate, scroll to zoom |
| Layers | Skeleton, muscles, organs, vessels, nerves; selecting a region turns on the layer it lives in |
| Seeing through | Everything except the selection fades so an organ behind the ribs is visible |
| Not rendered | The skin surface and reproductive structures are never drawn |
| Keyboard and screen readers | Every region is also a button below the viewer; pins are buttons with their prompt state in text |
| Panel | What was recorded (with provenance), rule-based prompts, NASA evidence, related OSDR study, follow-up actions |

A highlight means "there is a prompt to review here". It never means something
is wrong there, and an unmarked region is never called healthy.

The NASA astronaut model is separate and decorative. It leads the welcome
screen at full scale, glides to a smaller upper-right supporting pose on both
mission-selection screens, then exits before health questions begin. Keeping
one mounted model through those poses prevents the second-page disappearance
and makes Home the main visual moment. Neutral three-point studio lighting
keeps the original suit white while revealing its textured seams, equipment
and helmet. Under reduced motion the model snaps to its final pose and the
demand-rendered scene invalidates exactly one frame so the framebuffer cannot
retain the previous large pose.

## 9. Motion architecture

The user asked for the feel of modern cursor-reactive sites (Antigravity was
the reference) on a dark space theme, then clarified that motion should support
the whole experience rather than only the astronaut. The rule adopted:
**Home owns the large motion; the rest of the interface responds to navigation,
selection, focus and progress.**

| Effect | Where | Implementation |
|---|---|---|
| Screen continuity | Every top-level screen | `AnimatePresence` overlaps a 160 ms exit with a 340 ms entrance; exiting content becomes inert and hidden from assistive technology |
| Astronaut continuity | Welcome → mission → mission context | One R3F model eases from hero to supporting pose, then toward the edge before unmounting |
| Navigation and progress | Header tabs and guided stepper | Shared-layout active tab; step labels and counts crossfade with 3–4 px travel; step dots retain the persistent position |
| Mission selection | Mission cards | Restrained lift, 1.02 media scale, video crossfade and animated "Active mission" confirmation; radio semantics and visible text carry the state |
| Control feedback | Buttons, chips, fields and instrument options | Tokenized 120–240 ms border, background, press and focus response; context groups brighten on `:focus-within` |
| Cursor aura | Whole window, behind content | `CursorAura` in `effects/interactive.tsx`: one window listener, one style write per frame |
| Surface spotlight | Panels, hazard cards, question cards, options | A radial light at the pointer position, above the surface's background and below its content |
| Lift and press | Buttons, options, chips, instrument cards | `translate` on hover, settle on press; the primary button has a sheen |
| Magnetic primary action | Flow "Continue" and dashboard actions | `Magnetic`, a few pixels toward the cursor |
| Particle field | Welcome screen | Canvas 2D, particles yield to the cursor |
| Anatomy hover card | Health Compass | Follows the pointer inside the viewer |

All of it is written with Motion, CSS and Canvas 2D already in the project.
Motion 14.14.0 is MIT licensed; no transition package or new dependency was
added. `MotionPreferenceProvider` maps the in-app pause control and the OS
preference into one calm-motion decision. Calm mode removes spatial travel,
pointer tracking, autoplay and looping beams while retaining immediate final
states and short color/border feedback. Screen changes snap immediately so old
and new content cannot be double-exposed. Urgent content is never delayed or
hidden behind animation.

### Transition review (2026-11-15)

Impeccable's animation and polish guidance and UI/UX Pro Max's accessibility,
interaction and reduced-motion rules were applied to the built Electron app.
The Impeccable launcher binary was unavailable, so its documented manual
fallback was used with normal-motion and paused-motion capture scripts.

The review kept the astronaut as the single focal gesture, removed generic
scroll-settle reveals, shortened the primary-button sheen, limited mission
media zoom, made button transitions property-specific, and stopped the
selected-card beam in calm mode. It also verified that focus does not remain
inside the inert outgoing screen, state is never indicated by motion or color
alone, and reduced motion renders the correct astronaut pose without travel.
The transition helper and astronaut view mapping are unit tested in
`desktop/src/lib/transitions.test.ts`; the animated header's visible and
accessible progress state is covered in `app-shell.test.tsx`.

## 10. Second design review: the guided flow

The guided flow was reviewed with both skills on 2026-11-15, from screenshots
of the built app and the source.

**Method.** Impeccable's critique Assessment A (design review and Nielsen
scoring) ran as an isolated sub-agent. Its Assessment B (the detector) was run
in the main session before A had finished, so the two were not fully
independent. The detector reported one finding (an unused `.gradient-text`
rule), now removed. UI UX Pro Max was run as a separate review against its
priority list.

### Impeccable: Nielsen heuristics, before the fixes

| # | Heuristic | Score | Key issue found |
|---|---|---|---|
| 1 | Visibility of system status | 2 | A simulated stream was labelled "Sensor live" / "Online" |
| 2 | Match with the real world | 2 | The measurement step spoke serial-port language |
| 3 | User control and freedom | 3 | No "Save and exit" for a first-run user |
| 4 | Consistency and standards | 2 | Several names for one list; two priority-label maps |
| 5 | Error prevention | 3 | EVA and gravity default to "No"; one keypress answers and advances |
| 6 | Recognition over recall | 3 | The 3D model needs a text guide |
| 7 | Flexibility and efficiency | 3 | No keys for Next, Back, Not sure or Skip |
| 8 | Aesthetic and minimalist | 2 | Too many decorative loops on the dashboard |
| 9 | Error recovery | 3 | Two failures were swallowed silently |
| 10 | Help and documentation | 3 | Priority levels are not explained |
| | **Total** | **26/40** | Acceptable |

This score describes the app **before** the fixes below. It was not re-scored
afterwards.

### What was fixed

| Finding | Source | Change |
|---|---|---|
| Simulated stream shown as a live sensor | Both | "Simulated" in the header, viewport, vitals cards, dashboard, history and the measurement button |
| Measurement led with plumbing | Impeccable | Instruction first; diagnostics in a closed section; plain dock labels |
| Disabled buttons with no reason | UUPM | A hint beside the action on safety, questions and measurement |
| Findings buried the prompts | Impeccable | Prompts are the first section |
| Topic heading outranked the question; focus lost | Both | Question is the largest text and receives focus |
| "Report concern" opened on vitals fields | Impeccable | Symptoms first; emergency line on top; "Nothing here is sent to anyone" |
| Copy called the required reading optional | Impeccable | Corrected |
| Focus ring missing on four controls | UUPM | Outline rings on hazard headers, body regions, pins, mission cards |
| Focus stayed on a removed control after a screen change | UUPM | Focus moves to the new screen |
| Urgent result not on the dashboard | UUPM | Urgent panel repeated there; `role="alert"` |
| Silent failures | Both | Save, assess and simulate failures are shown on every screen |
| Targets under 32 px | UUPM | Raised to 32 px |
| Input border contrast about 1.4:1 | UUPM | Raised |
| Amber prompt markers read as "medical review" | Impeccable | Markers are blue; the historical badge no longer shares a priority colour |
| Astronaut covered text; floating vitals; tilting tiles | Impeccable | Astronaut only where there is room; values stay still |
| Two priority-label maps; raw level text | Both | One map, used everywhere including history |
| 10–11 px labels | UUPM | 11 px and 12 px |
| PPG channels differed only by colour; flat idle line | UUPM | Dashed red channel; "No usable signal" label |
| 3D viewer ignored "Pause motion" while open | UUPM | It follows the setting |

### Not done

- "Save and exit" for a first-run user, and keys for Next, Back, Not sure and
  Skip.
- One name for the follow-up list (it is still "next steps", "follow-up
  actions" and "Action Center" in different places).
- An explanation of the priority levels.
- EVA and gravity transition still default to "No" on the context screen.
- A failed attempt to open a NASA link is still silent.
- The app was reviewed at one window size (1440 × 888).

## 11. Qt fallback

The earlier PySide6 interface still runs:

```bash
python software/run.py
```

It uses the same Python health modules and the same local NASA media, with a
space theme restyle (`b92f88e`). It is not the primary interface. It stays so
that a problem in the desktop shell never blocks sensor work, and as a backup
monitor during a demo.
