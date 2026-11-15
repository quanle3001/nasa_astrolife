# AstroLife UI migration notes

AstroLife's primary experience now lives in `desktop/`: a React + TypeScript UI
hosted in Electron, with the existing Python application running as a private
child-process backend. See `desktop/README.md` for the current design,
architecture, run instructions, tests, packaging, NASA provenance, and licenses.

## Current design direction

The React shell uses a deep-space palette (near-black and midnight-navy
surfaces, silver type, restrained cyan/blue accents) defined as design tokens
in `desktop/src/styles.css`. Atmosphere follows the MIT-licensed Space
Portfolio: a blue-shifted black-hole crown, R3F star depth and translucent
glass surfaces. The Telemetry hero frames the selected mission's NASA
photograph in a HUD-style viewport with floating live-telemetry cards; mission
cards share the same viewfinder language and play short, honestly labelled
NASA clips on hover. Space UI, Magic UI, Radix and Motion provide the reused
interaction components.

Sources, licenses, rejected alternatives and the token reference are in
[`docs/ui-components.md`](../docs/ui-components.md).

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
