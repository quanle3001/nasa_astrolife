# AstroLife UI components, sources and design system

This document records which open-source UI ecosystems were researched for the
AstroLife desktop interface (`desktop/`), what was reused or adapted, where it
came from, and under which license. It also documents the design tokens and
the NASA media rules the renderer follows.

AstroLife's architecture is unchanged: React + TypeScript + Tailwind v4 in
Electron, with the existing Python modules (rules, serial reader, SQLite) as a
private child-process backend. No health logic, thresholds, firmware or storage
behavior is affected by anything below.

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
| `desktop/public/videos/blackhole.webm` | Space Portfolio — `public/videos/blackhole.webm` | MIT, © 2024 Sanidhya Kumar Verma | Hue-shifted from violet to blue in CSS; full strength on Telemetry, dimmed on clinical pages; paused while a mission clip plays, when hidden, and under reduced motion. |

Full license texts are reproduced in `desktop/THIRD_PARTY_NOTICES.md`.

## 3. Design system

Tokens live in `desktop/src/styles.css`:

- **Colors** (`@theme`, generates Tailwind utilities such as `bg-space-surface`):
  `space-black #030711`, `space-bg #080e1c`, `space-surface #101a2b`,
  `space-elevated #172439`, `space-border #263a54`, `space-blue #3b82f6`,
  `space-cyan #46d9e8`, `space-white #f1f6ff`, `space-silver`, `space-muted`,
  `space-subtle`, and a reserved `space-violet` for small atmospheric touches.
- **Status colors** (`--status-urgent/review/watch/info/live`): clinical
  meaning only, never decorative; unchanged from the original priority colors.
- **Surfaces:** `--panel-bg` (18–30% tint, 6px blur, after Space Portfolio's
  near-transparent cards), `--panel-border`, `--panel-highlight`,
  `--shadow-panel`, `--shadow-float`.
- **Radius** `--radius-sm/md/lg/xl/pill`; **spacing** `--space-1…8`,
  `--page-max`, `--page-gutter`, `--nav-height`, `--control-height`.
- **Type scale** `--text-label` (10px floor), `--text-xs/sm/base`,
  `--text-hero`, `--text-page-title`; `--font-sans/display/mono`.
- **Motion** `--ease-out`, `--ease-in-out`, `--duration-fast/base/slow/atmosphere`.
- **Focus** `--focus-ring` (2px space-black gap + 2px cyan ring).
- **Background layers** `--layer-atmosphere/stars/crown/content/nav`.

Primitives (`.glass-panel`, `.control`, `.priority-*`, …) sit in
`@layer components` so per-element Tailwind utilities (for example the urgent
card's rose border) always win.

Shared UI language:

- **HUD viewfinder corners** (`.hud-brackets`) in the mission accent color, on
  the hero viewport and on mission cards (hover, focus, selected).
- **Floating telemetry cards** (Motion, 4.8 s bob/tilt, staggered) from the
  original telemetry hero.
- **Mission accent** (`--accent`) per mission: LEO cyan, lunar silver-blue,
  Mars amber; drives frame border/glow, eyebrow color and selected ring.

### Motion budget

Decorative motion is compositor-only (transforms and opacity): star rotation,
orbital tracks, Ken Burns drift, scan sweep, floating cards. The proximity
grid animates only on pointer movement. Exactly one WebGL canvas (the
starfield) exists. `prefers-reduced-motion` disables all of it, hides the
crown video and stops autoplay; state and focus feedback remain.

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

## 5. Design review: Impeccable and UI UX Pro Max

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
| P2 | Telemetry had one heading | `h2` for ESP32 uplink, Live interpretation, Local-first by design |
| P2 | "Archive" vs "Health history" vs "Save to history" | Nav renamed "History" |
| P2 | Navbar collided at 200% zoom (490 px) | Duplicate home mark hidden below 600 px |

Keyboard shortcuts were added afterwards (`64996da`; see
`desktop/README.md`), addressing the Flexibility and Efficiency score.

Left as recommendations (structural, beyond polish): the duplicate mission select plus
cards (`/impeccable distill`), grouping the 17 symptom checkboxes
(`/impeccable layout`), contextual help for SpO2 estimates and priorities
(`/impeccable clarify`).

The full, phase-grouped commit history is in [`ui-changelog.md`](ui-changelog.md).
