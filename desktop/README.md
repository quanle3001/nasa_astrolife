# AstroTip React desktop

AstroTip's primary interface is a React + TypeScript mission-control UI hosted
inside Electron. Electron starts the existing Python backend as a private child
process; it does not replace the health rules, serial reader, SQLite storage, or
firmware.

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
down with the desktop process. Only official `https://*.nasa.gov` media source
links may be opened externally.

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
open release/mac-arm64/AstroTip.app
```

The sidecar is created by PyInstaller and copied into the app's Resources
directory. It includes the Python rule catalog and requires no public listener or
separate Python installation at runtime. Build the application on each target
platform; PyInstaller output is platform-specific.

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

The deep-space design system (tokens, shared components, motion budget) and the
research behind every reused component are documented in
[`docs/ui-components.md`](../docs/ui-components.md).

- Tokens in `src/styles.css`: Tailwind v4 `@theme` colors (`space-black`,
  `space-surface`, `space-cyan`, …) plus CSS variables for status colors,
  radius, spacing, type scale, motion and focus ring. Primitives live in
  `@layer components` so utilities can override them per element.
- Space UI (MIT) adaptations in `src/components/spaceui/`: ProximityGrid
  (Interactive Grid Hero), FrostBlurred and StatusBadge.
- Space Portfolio (MIT) atmosphere: lazy R3F starfield, black-hole crown
  (blue-shifted; full strength on Telemetry, dimmed on clinical pages) and
  translucent glass surfaces.
- Magic UI border beam on the selected mission card, masked to a ring.
- Motion for floating telemetry cards, page/card transitions and the
  mission-image cross-fade; Radix Dialog/Tooltip/Slot; Lucide icons.
- `prefers-reduced-motion` stops all decorative motion and video autoplay while
  keeping state and focus feedback.

Exactly one WebGL canvas (the starfield, a separate lazy chunk) is used.
Clinical content and urgent actions never wait on animation.

## NASA media

The renderer bundles the cached files in `software/assets/nasa` (images and two
~2.2 MB preview clips). `media_manifest.json` is the single source of NASA IDs,
credits, classification and source links; `src/lib/missions.ts` derives from it
and falls back to the still image when a file is missing. Clips are labelled
"Footage" or "Visualization", play muted one at a time on hover/focus, pause
offscreen, and never autoplay under reduced motion. The Apollo image is labelled
as a historical reference. NASA does not endorse AstroTip, and NASA marks are
not used as app branding.

Refresh the cache (network required; the app itself never downloads media):

```bash
python software/scripts/fetch_nasa_media.py --with-video
```

## Visual testing tip

`ASTROTIP_HISTORY_PATH=/tmp/astrotip-test.sqlite3` points the backend at a
scratch history database, so UI testing never writes to your real local
records. `ASTROTIP_SCREENSHOT=out.png` (optionally with
`ASTROTIP_SCREENSHOT_PAGE=checkin`) captures the packaged renderer and exits.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for reused component and
library licenses.
