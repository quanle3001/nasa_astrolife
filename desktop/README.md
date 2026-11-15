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

- shadcn-style local primitives backed by Radix Dialog/Tooltip/Slot
- Motion for short page, card, and navigation transitions
- React Three Fiber/Drei for a lazy-loaded, low-density starfield
- Magic UI's border-beam pattern for the selected mission card
- Lucide icons, local NASA images, and no startup network dependency
- `prefers-reduced-motion` stops continuous star motion and removes transition
  movement while preserving state and focus feedback

The Three.js starfield is a separate lazy chunk. Clinical content and urgent
actions do not wait for it and do not depend on animation.

## NASA media

The renderer ships the cached files in `software/assets/nasa`. Provenance is
recorded in `media_manifest.json`, displayed in the expanded mission view, and
linked to official NASA asset pages. The Apollo image is labeled as a historical
reference. NASA does not endorse AstroTip, and NASA marks are not used as app
branding.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for reused component and
library licenses.
