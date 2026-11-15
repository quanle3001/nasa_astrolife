# AstroLife React desktop

AstroLife's primary interface is a React + TypeScript app hosted inside
Electron. It is a guided journey: mission → NASA hazards → adaptive questions →
sensor measurement → findings → Health Compass → actions, then a dashboard on
later launches. Electron starts the Python backend as a private child process;
the interface never scores anything itself.

Start with the [project README](../README.md). The full design is in
[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

## Why Electron

Tauri 2 was evaluated first. This checkout has Node.js but no Rust toolchain, and
Tauri sidecars require target-specific binaries. Electron was selected because it
can prove and ship the Python child-process bridge with fewer new build
prerequisites. The renderer is sandboxed with context isolation enabled and Node
integration disabled.

## Architecture

```text
React renderer
  -> typed preload API (one method per operation)
  -> Electron IPC allowlist + sender validation + request timeout
  -> private JSON-lines stdin/stdout child process
  -> existing Python rules / sensor / SQLite modules
```

The bridge opens no HTTP listener. It rejects unknown methods and unknown health
fields, limits input messages to 1 MB, uses request IDs and timeouts, and shuts
down with the desktop process. Only `https://*.nasa.gov` links may be opened
externally. Raw optical samples travel on their own IPC channel (`backend:ppg`)
into a ring buffer and a uPlot chart, outside React state. Methods and events
are listed in [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md#bridge-contract-protocol-2).

Source layout:

| Path | Contents |
|---|---|
| `electron/` | Main process, preload API (`window.astrotip`), IPC allowlist |
| `src/App.tsx` | Connects the two state machines to the screens |
| `src/flow/`, `src/questions/` | Navigation machine; question engine and questionnaire machine (XState) |
| `src/components/flow/` | Guided screens and shared pieces (badges, evidence trace, sources) |
| `src/components/compass/` | 3D anatomy viewer, 2D body map |
| `src/components/monitor/` | PPG chart, live monitor, sensor dock |
| `src/components/nasa/` | Radiation Explorer, OSDR study card |
| `src/components/pages/` | Dashboard, NASA data, monitor, history, concern report |
| `src/components/effects/` | Cursor-reactive pieces, star and astronaut scene |

## Run

Install the Python dependencies from the repository root first:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r software/requirements.txt
```

Then install and launch the desktop UI:

```bash
cd desktop
npm install
npm run dev
```

For a production renderer build followed by the native desktop process:

```bash
cd desktop
npm start
```

Build an unpacked macOS application containing a one-file Python sidecar:

```bash
cd desktop
python -m pip install -r ../software/requirements-dev.txt
npm run package:dir
open release/mac-arm64/AstroLife.app
```

The sidecar is created by PyInstaller and copied into the app's Resources
directory. It includes the Python rule catalog and requires no public listener or
separate Python installation at runtime. Build the application on each target
platform; PyInstaller output is platform-specific. Packaging has not been re-run
since pandas and Pydantic were added to the backend; verify the packaged app
before relying on it.

The original PySide6 interface remains available during migration:

```bash
python software/run.py
```

## Verify

```bash
cd desktop
npm run typecheck
npm test
npm run build
npm run bridge:proof
npm audit

cd ..
QT_QPA_PLATFORM=offscreen .venv/bin/python -m unittest discover -s software/tests -v
```

## Design system and performance

The deep-space design system (tokens, shared components, motion budget), the
research behind every reused component, the Health Compass and the design
reviews are documented in [`docs/UI_UX.md`](../docs/UI_UX.md).

- Tokens in `src/styles.css`: Tailwind v4 `@theme` colors (`space-black`,
  `space-surface`, `space-cyan`, …) plus CSS variables for status colors,
  radius, spacing, type scale, motion and focus ring. Primitives live in
  `@layer components` so utilities can override them per element.
- Space UI (MIT) adaptations in `src/components/spaceui/`: ProximityGrid
  (Interactive Grid Hero), FrostBlurred and StatusBadge.
- Space Portfolio (MIT) atmosphere: lazy R3F starfield, black-hole crown
  (original top-cropped composition on Home, hidden after the intro) and
  translucent glass surfaces.
- Magic UI border beam on the selected mission card, masked to a ring.
- Motion for overlapping page continuity, astronaut pose continuity, guided
  progress and mission-selection feedback;
  Radix Dialog/Tooltip/Slot; Lucide icons.
- Cursor-reactive feedback (cursor aura, surface spotlight, lift and press)
  written with Motion, CSS and Canvas 2D. Generic scroll reveals are avoided so
  state changes and the Home astronaut remain the focal motion.
- The Health Compass uses `open-anatomy-3d` models through React Three Fiber,
  bundled locally; a 2D body map is the fallback without WebGL.
- "Pause motion" in the navbar and `prefers-reduced-motion` stop all decorative
  motion and video autoplay while keeping state and focus feedback.

One WebGL scene runs at a time: the star and astronaut scene is unmounted while
the 3D anatomy viewer is open. Both are lazy chunks. The astronaut remains
mounted from Home through mission setup so it can glide from hero to supporting
pose without disappearing. Clinical content and urgent actions never wait on
animation.

## NASA media

The renderer bundles the cached files in `software/assets/nasa` (images and two
~2.2 MB preview clips). `media_manifest.json` is the single source of NASA IDs,
credits, classification and source links; `src/lib/missions.ts` derives from it
and falls back to the still image when a file is missing. Clips are labelled
"Footage" or "Visualization", play muted one at a time on hover/focus, pause
offscreen, and never autoplay under reduced motion. The Apollo image is labelled
as a historical reference. NASA does not endorse AstroLife, and NASA marks are
not used as app branding.

Refresh the cache (network required; the app itself never downloads media):

```bash
python software/scripts/fetch_nasa_media.py --with-video
```

## Keyboard shortcuts

| Shortcut (macOS / Windows, Linux) | Action |
|---|---|
| ⌘1–⌘5 / Ctrl+1–Ctrl+5 | Dashboard, Monitor, Health Compass, NASA data, History |
| 1, 2, 3 … | Choose that answer on the current question |
| ⌘Enter / Ctrl+Enter | Review health priorities (on a concern report; same validation as the button) |
| ⌘S / Ctrl+S | Save the current assessment to history |
| ? | Show the shortcut reference (ignored while typing in a field) |
| Esc | Close a dialog |

Shortcuts defer to an open dialog. The key map lives in `src/lib/shortcuts.ts`;
nav items, the submit button and the save button expose `aria-keyshortcuts`.

## Visual testing tip

`ASTROTIP_HISTORY_PATH=/tmp/astrotip-test.sqlite3` points the backend at a
scratch history database, so UI testing never writes to your real local
records. `ASTROTIP_SCREENSHOT=out.png` captures the built renderer and exits;
the options for walking to a screen first are in
[`docs/DEVELOPMENT.md`](../docs/DEVELOPMENT.md#environment-variables).

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for reused component and
library licenses.
