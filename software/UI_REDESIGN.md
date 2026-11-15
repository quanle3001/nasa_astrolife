# AstroTip UI migration notes

AstroTip's primary experience now lives in `desktop/`: a React + TypeScript UI
hosted in Electron, with the existing Python application running as a private
child-process backend. See `desktop/README.md` for the current design,
architecture, run instructions, tests, packaging, NASA provenance, and licenses.

## Current design direction

The React shell adapts the MIT-licensed Space Portfolio's cinematic composition:
an animated black-hole crown, R3F star depth, translucent capsule navigation,
large purple-to-cyan hero typography, and floating orbital modules. Motion,
Radix/shadcn-style primitives, Magic UI's border-beam pattern, Three.js, and
Lucide provide reusable interaction and visual components. The health telemetry
orbit and workflow screens are AstroTip-specific.

Mission media remains local and offline. Cards expose NASA asset IDs, credits,
dates, and official source links. Apollo media is labeled as a historical lunar
reference, and NASA branding is not used to imply endorsement.

## Retained PySide6 fallback

The earlier native Qt redesign remains available during migration:

```bash
python software/run.py
```

It uses the same Python health modules and local NASA media but is no longer the
primary interface. Keeping it prevents a UI migration from blocking sensor or
health-rule work.

## Visual previews

- React portfolio-style telemetry: `../desktop/sensor-react.png`
- React mission check-in: `../desktop/checkin-react.png`
- Legacy PySide6 sensor view: `artifacts/screenshots/sensor-monitor.png`
- Legacy PySide6 check-in: `artifacts/screenshots/mission-checkin.png`

Screenshots are development artifacts and are ignored by Git.
