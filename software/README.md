# AstroTip desktop app

AstroTip reads your ESP32/MAX30102 over USB serial, analyzes valid estimates locally,
and shows relevant health prompts and suggested next steps. NASA guidance stays in
an internal offline catalog; the interface does not display a NASA library or research feed.

## Start the app

Dependencies are already installed in this workspace. In **Command Prompt**:

```cmd
C:\Users\evatr\Desktop\nasa_astrotip\.venv\Scripts\python.exe C:\Users\evatr\Desktop\nasa_astrotip\software\run.py
```

In **PowerShell**:

```powershell
& "C:\Users\evatr\Desktop\nasa_astrotip\.venv\Scripts\python.exe" "C:\Users\evatr\Desktop\nasa_astrotip\software\run.py"
```

For a fresh installation, use Python 3.10+ and install `software/requirements.txt`
into a virtual environment first. This is a native desktop app, not a localhost website.

## Connect the ESP32

1. Upload the firmware in `electrical/firmware/max30102_serial_test` to the ESP32
   using your existing PlatformIO setup if it is not already installed. The app
   does not upload firmware or alter the board's configuration.
2. Connect the board with a USB cable that supports data. In Windows Device Manager,
   expand **Ports (COM & LPT)**. Unplug/reconnect the board to identify its COM port.
3. Close PlatformIO/Arduino Serial Monitor or any other program using that port.
4. Open AstroTip's **Sensor monitor**, click **Refresh ports**, select the COM port,
   and click **Connect**. You can also enter a COM port manually.
5. Rest a finger on the sensor and keep still. The first complete report may take
   several seconds. Valid heart-rate and oxygen estimates appear and are analyzed
   automatically. **Review / save this reading** captures that reading for review;
   **Save to history** explicitly saves the snapshot.

If no port appears, check the USB data cable, USB socket, and the board's USB serial
adapter driver. If connected but no reports arrive, check firmware upload, sensor
wiring, and whether another serial monitor is holding the port. Error messages from
this firmware appear in the monitor. Use Disconnect before opening another monitor.

The adapter matches the existing firmware's **multiline text reports at 115200 baud**,
including `Finger Detection`, `Heart Rate`, `Blood Oxygen (SpO2)`, and the two
`Measurement Valid` flags. The firmware header mentions CSV, but the actual
`printHealthReport()` output is text. No firmware edits are needed for this adapter.

## Measurement handling

- Only complete reports are accepted; fragments and startup messages never mix
  measurements from different reports.
- Finger absence, unavailable / -1 values, failed validity flags, and out-of-range
  estimates stay unavailable. Heart rate and SpO2 validity are handled independently.
- The adapter follows the firmware's output ranges (35–220 bpm and 70–100% SpO2).
  Those ranges are parser acceptance bounds, not healthy ranges. Values outside
  them are unavailable and are never interpreted as normal.
- On sensor error, disconnect, or no complete report for eight seconds, live
  readings and live analysis clear and capturing a new snapshot is disabled.
- Device validity flags are not clinical validation or a calibrated quality score.
- **Optional check-in** supports symptoms and manual observations. Unchecked symptoms
  mean unreported. Free-text notes are not analyzed. Live readings are not silently
  combined with a previous manual check-in.

## Internal analysis and evidence

The curated catalog covers the five NASA hazards and all 17 risks on NASA's linked
public overview, organized into 13 internal groups. Only relevant findings and
next steps appear in results; research studies are not presented as treatments.
See [the evidence manifest](resources/dataset_manifest.md) for source mapping.

NASA's pages are research summaries, not a patient dataset or a trained diagnostic
model. Explicit rules use symptoms, readings, and optional mission context. SpO2
at or below 88% prompts immediate medical attention; at or below 92% prompts
medical review. These are general MedlinePlus reference values, not NASA flight
limits. Poor/unknown quality never suppresses a low-reading prompt. Pulse is
recorded for review against personal clinician-approved limits; the app has no
personal baseline. Sleep under six hours is an app reminder, not a clinical cutoff.

The prototype cannot diagnose, prescribe, or clear someone for duty. Pulse and
SpO2 cannot assess radiation exposure, bone density, SANS, immune function, or
mental health. Missing measurements are never treated as healthy results.

## History and privacy

Saving is optional. SQLite history is stored locally, unencrypted, under
`%LOCALAPPDATA%/AstroTip/history.sqlite3`; the exact path is shown in the app.
Sensor snapshots retain the port, receipt timestamp, values, assessment, and
internal evidence review date. No observations are sent to a server.

Camera analysis and a trained local AI model remain unimplemented. Hardware
connection must be checked with the actual device; automated tests use protocol
fixtures and simulated transports, not a clinical or physical sensor validation.

## Verification

From the repository root:

```powershell
.venv/Scripts/python.exe -W error::ResourceWarning -m unittest discover -s software/tests -v
```

Tests cover input validation, evidence references, assessment priorities, history,
serial report fragmentation/validity, errors, stale samples, reconnects, and Qt flows.
