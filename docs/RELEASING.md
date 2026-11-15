# AstroLife desktop installers

AstroLife packages the React interface, Electron, the Python backend and its
dependencies, NASA reference data, local media, and the application icon.
People installing it do not need Python, Node.js, a terminal, or this repository.
The ESP32 firmware is separate; installing the desktop app does not flash it.

## Install and open

| Computer | Download | Installation |
|---|---|---|
| Mac with Apple Silicon (M-series) | `AstroLife-0.2.0-mac-arm64.dmg` | Open the disk image, drag **AstroLife** to **Applications**, eject the disk image, then open AstroLife from Applications. |
| Intel Mac | `AstroLife-0.2.0-mac-x64.dmg` | Follow the same Mac installation steps. |
| Windows x64 | `AstroLife-0.2.0-windows-x64-Setup.exe` | Run the installer, choose a folder, and open the **AstroLife** desktop or Start Menu shortcut. |

The version in filenames comes from `desktop/package.json`.
On a Mac, drag the installed application to the Dock for quick access. For a
desktop icon, select it in Finder, choose **File → Make Alias**, and move the
alias to the desktop. The alias points to the app in Applications.

These are development distributions unless the builder configures signing.
Unsigned downloads may be blocked or show macOS Gatekeeper / Windows
SmartScreen warnings. Only approve an app you built or obtained from a trusted
source; do not disable operating-system security globally. For wider Mac
distribution, configure a Developer ID signature and Apple notarization.
Windows code signing identifies the publisher, though it does not guarantee
that SmartScreen will never show a warning.

## Build on your computer

Use Node.js 24 and a 64-bit Python 3.12 (recommended). Python and Node must
match the machine's architecture. The scripts check this before building.
Build on each target operating system: the frozen Python backend cannot be
cross-compiled from macOS to Windows. On Macs, build separately using native
arm64 tools for Apple Silicon and x64 tools for Intel. Do not combine a Python
backend of one architecture with Electron of another.

From the repository root on macOS:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r software/requirements.txt -r software/requirements-dev.txt
cd desktop
npm ci
npm run test:packaging
npm run package:mac
npm run package:verify
```

From the repository root in Windows PowerShell:

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r software\requirements.txt -r software\requirements-dev.txt
cd desktop
npm ci
npm run test:packaging
npm run package:win
npm run package:verify
```

No environment activation is necessary. If a `.venv` already exists with the
required dependencies, reuse it. `ASTROTIP_PYTHON` can select an alternate build
Python by absolute path. Installed apps always use their bundled backend.

Outputs go in `desktop/release/`. `npm run package:dir` builds an application
folder without an installer. The unpacked Mac app is in `release/mac-arm64/`
or `release/mac/`; the Windows app is in `release/win-unpacked/` for x64.
Distribute the DMG or Setup EXE, not an isolated executable from the unpacked
Windows folder. Build output is ignored by Git to keep large binaries out of
source commits.

The existing `desktop/build/icon.png` is converted by electron-builder into
native icons. No separate image tool is required. Windows installs desktop and
Start Menu shortcuts. The old `software/create_desktop_shortcut.ps1` only opens
the legacy Qt interface from a source checkout; it is not needed for installers.

## Build using GitHub Actions

`.github/workflows/desktop-installers.yml` builds three packages on native
GitHub runners: macOS arm64, macOS x64, and Windows x64. Each job runs the UI
and launch-path tests, builds the backend, runs its smoke test, packages the app,
and launches the packaged app to verify renderer-to-Python communication.
Only a successful job uploads an installer.

The workflow runs for relevant pull requests and pushed `v*` tags. Once the
workflow is on the repository's default branch, it can also be started under
**Actions → Desktop installers → Run workflow**, selecting the desired branch.
After a successful run, download the appropriate ZIP from the run's
**Artifacts** section and extract the installer. Artifacts are retained for
30 days. Private repository Actions usage may count against the account's quota.

This workflow builds unsigned development packages and does not publish a
GitHub Release automatically. For a release, update `desktop/package.json`
and `desktop/package-lock.json` together, commit the version change, push the
chosen version tag, and wait for all three jobs to pass. Then create a draft
under **Releases**, attach the three installers, add the release notes and
verification results, and publish when ready. Do not commit the installers.
Pushing a workflow file alone does not mean its builds have run or passed.

## What verification covers

Every packaging command checks the new frozen backend from a temporary working
directory, without relying on the source folder. It exercises protocol startup,
NASA catalogs and cached RadLab data, serial-port enumeration, assessment,
SQLite saving and history, trends, and the simulated sensor. Temporary history
is isolated from real records and removed afterward.

`npm run package:verify` starts the actual packaged Electron application from
a temporary directory with developer Python overrides removed. It checks the
preload API, renderer loading, backend protocol, and bundled NASA data through
Electron IPC. To check a copied or installed executable:

```bash
# macOS
npm run package:verify -- /Applications/AstroLife.app/Contents/MacOS/AstroLife
```

```powershell
# Windows: substitute the actual installation location
npm run package:verify -- "C:\path\to\AstroLife\AstroLife.exe"
```

Before distributing, also check opening by icon on a clean target computer,
mission setup, the simulated stream, 3D Compass, history after restarting, and
uninstallation. A real USB sensor requires a separate hardware test; this build
test does not establish measurement accuracy or validate installer dialogs.

History stays outside the installation folder: `%LOCALAPPDATA%\AstroTip\history.sqlite3`
on Windows and `~/.local/share/AstroTip/history.sqlite3` on macOS. The historical
AstroTip directory name is preserved for compatibility. Replacing the app does
not replace this database. Back it up separately if you need to preserve it.

## Implementation and references

- `desktop/scripts/package.mjs`: native OS/architecture checks and packaging.
- `desktop/scripts/build-backend.mjs`: PyInstaller compilation.
- `desktop/electron/backend-runtime.cjs`: development and installed launch paths.
- `desktop/scripts/bridge-proof.mjs`: backend integration check.
- `desktop/scripts/verify-package.mjs`: installed-app smoke test.
- [PyInstaller platform requirements](https://www.pyinstaller.org/en/stable/).
- [electron-builder NSIS installer options](https://www.electron.build/v26/docs/nsis/).
- [electron-builder icons](https://www.electron.build/docs/features/icons-and-images/).
- [GitHub hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
