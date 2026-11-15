# Third-party notices

AstroLife includes or adapts the following open-source software. Package lockfile
versions are authoritative for the installed dependency graph.

| Project | Use in AstroLife | License |
|---|---|---|
| Space Portfolio (`sanidhyy/space-portfolio`) | Main visual reference; `star-background.tsx` adapts its rotating point-cloud concept, and `public/videos/blackhole.webm` is reused from the project with new layout and reduced-motion behavior. Copyright © 2024 Sanidhya Kumar Verma | MIT |
| shadcn/ui | Local button/card composition conventions | MIT |
| Space UI (`usespaceui/ui`) | `src/components/spaceui/proximity-grid.tsx` (Interactive Grid Hero), `frost-blurred.tsx` and `status-badge.tsx` are adapted from its registry. Copyright (c) 2026 Space UI | MIT |
| Radix UI | Accessible dialog, tooltip, and slot primitives | MIT |
| Magic UI | `border-beam.tsx` adapts the animated border-beam pattern. Copyright (c) Magic UI | MIT |
| Motion | React layout and state transitions | MIT |
| React Three Fiber / Drei | React Three.js renderer and helpers | MIT |
| Three.js | WebGL starfield | MIT |
| Lucide | Interface icons | ISC |
| uPlot | Live optical pulse (PPG) chart | MIT |
| XState, @xstate/react | Guided-flow navigation state machine | MIT |
| open-anatomy-3d 0.1.0 (`MervinR07/open-anatomy-3d`) | 3D anatomical models and structure catalog for the Health Compass, bundled locally | Code MIT; models and catalog CC BY 4.0 |
| Electron | Native desktop host | MIT |

The original copyright and license texts remain available through each installed
package. AstroLife's NASA media (images and preview clips) follows NASA's media usage
guidelines and retains asset IDs, credits and classification in
`software/assets/nasa/media_manifest.json`. See `docs/ui-components.md`.

NASA names, insignia, logotypes, and identifiers are not used to imply
endorsement.

## Space Portfolio license

MIT License

Copyright (c) 2024 Sanidhya Kumar Verma

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Space UI license

MIT License

Copyright (c) 2026 Space UI

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Magic UI license

MIT License

Copyright (c) Magic UI

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Anatomy models (Health Compass)

The Health Compass shows the `open-anatomy-3d` models. They are adapted works and
the following credit line is displayed next to the viewer, as their licence requires:

> Anatomy: BodyParts3D © The Database Center for Life Science (CC BY 4.0);
> female organs: Human Reference Atlas 3D Reference Organs, HuBMAP (CC BY 4.0);
> female body: MakeHuman (CC0). Modified by open-anatomy-3d
> (https://github.com/MervinR07/open-anatomy-3d), CC BY 4.0.

AstroLife changes how the models are displayed, not the model files: each
structure is coloured from the package catalog, structures can be highlighted or
faded, and the skin surface and reproductive structures are never rendered. The
models are an educational reference, not a scan of any person and not for diagnosis.
