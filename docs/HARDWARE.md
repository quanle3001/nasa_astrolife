# Hardware: ESP32 and MAX30102

Heart rate and SpO₂ in AstroLife come from the firmware in
`electrical/firmware/max30102_serial_test/`. The desktop app displays and
stores those estimates. It does not compute them.

## Parts and wiring

| ESP32 (esp32dev) | MAX30102 module |
|---|---|
| 3V3 | VCC / VIN (only if the module is rated for 3.3 V) |
| GND | GND |
| GPIO21 | SDA |
| GPIO22 | SCL |

Never connect the ESP32's GPIO to I²C pull-ups above 3.3 V.

The board connects to the computer over USB. Depending on the USB-to-serial
chip, a CH340 or CP210x driver may be needed.

## Build and flash

PlatformIO installs the ESP32 Arduino core and the SparkFun MAX3010x library
(`^1.1.2`) from `platformio.ini`.

```bash
cd electrical/firmware/max30102_serial_test
```

```bash
pio run
```

```bash
pio run -t upload
```

```bash
pio device monitor -b 115200
```

On macOS, if `pio` is not found, use `~/.platformio/penv/bin/pio`. Close the
serial monitor and the app's sensor connection before uploading. Close the
serial monitor before connecting the app: only one program can hold the port.

Flashing changes the board. It is a manual step and the app never does it.

## What the firmware sends

Serial, 115200 baud, text lines. Firmware version `astro-life-ppg-2`.

**Optical samples**, about 25 per second:

```text
PPG,<sequence>,<read time in ms>,<red counts>,<infrared counts>
```

**A report**, about once per second:

```text
======================================
       ASTRO LIFE HEALTH MONITOR
======================================
Sensor Status: Connected
Firmware: astro-life-ppg-2
Signal Status: ready | collecting | no_contact | clipped | timing
Sample Rate: 25.0 Hz
Finger Detection: Likely detected | Not detected

--- HEALTH MEASUREMENTS ---
Heart Rate: 72 BPM | Unavailable
Measurement Valid: Yes | No
Heart Rate Algorithm Flag: Yes | No
Blood Oxygen (SpO2): 98% | Unavailable
Measurement Valid: Yes | No
SpO2 Algorithm Flag: Yes | No

--- RAW SENSOR DATA ---
Red Light: <counts>
...
```

The sensor runs at 100 samples per second with four-sample averaging, which
gives about 25 paired red/infrared samples per second. Each `PPG` time is when
the firmware read the pair, not when USB delivered it.

## How heart rate and SpO₂ are estimated

The firmware collects a four-second window (100 samples) and passes it to the
algorithm shipped with the SparkFun library (`spo2_algorithm.h`). It then
refuses to report an estimate when:

- any sample in the window lacks finger contact (infrared ≤ 50,000 counts) or
  has a zero red count;
- any sample reaches the 18-bit ADC ceiling (clipping);
- the measured sample rate is outside 20–30 Hz, because the algorithm assumes
  25 Hz;
- samples were lost (a backlog larger than the library's buffer restarts the
  collection).

These are conservative engineering checks. They are not validated clinical
signal-quality thresholds, and the contact threshold may need adjusting for
another module or mounting.

## What the desktop does with it

| Step | Code | Behaviour |
|---|---|---|
| Read | `inputs/sensor_serial.py` (`SerialReader`, `ReportParser`) | Parses reports and `PPG` lines; never mixes fields from two reports; treats `-1` and "Unavailable" as no value |
| Quality | `analysis/optical_quality.py`, `analysis/reading_stability.py` | Engineering checks on contact, clipping, continuity and timing, and on agreement between recent reports |
| Forward samples | `bridge/ppg_batcher.py` | Batches raw samples for the chart with device sequence and time unchanged |
| Forward estimates | `bridge/service.py` → `sensor.reading` | Firmware values with `usable`, signal status, sample rate, firmware version |
| Withdraw live state | `bridge/service.py` | Contact loss, a device error, a stale report or a disconnect clears the live estimate at once; it does not erase a session capture already completed |
| Capture for a check-in | `bridge/service.py` + `AppStateStore` | The first median of three agreeing reports is latched in the open session with source, port, time, method and report count |
| Use in a check-in | `session.submit` | The backend reads the saved session snapshot; the interface cannot supply or replace the sensor numbers |

A missing or invalid live estimate is shown as "No reading". It is never shown
as a normal live value. If a stable session snapshot was already saved, the
measurement screen keeps that separately, identifies it as saved, and lets the
astronaut continue after removing their finger.

The chart shows the infrared optical pulse (PPG), with the red channel
optional and dashed. It is not an ECG. A display-only filter removes slow
drift and inverts the trace so pulses point up. The filter changes the drawing
only.

## Verification status

| Check | Result | Date | By |
|---|---|---|---|
| 1,500 consecutive samples at 25.05 Hz, no missing sequence numbers, finger on the sensor | Passed. Numeric estimates still varied during the check | 2026-11-14 | Jayden Nguyen, PySide6 monitor |
| Board on `/dev/cu.usbserial-0001` already runs `astro-life-ppg-2`; reports at 25.0–25.2 Hz; `no_contact` with no finger; estimates correctly unavailable; consecutive sequence numbers 40 ms apart in the React app | Passed | 2026-11-15 | Electron app, real board, no finger on the sensor |
| Heart rate and SpO₂ shown in the React app with a finger on the sensor | **Not yet run** | — | Needs a person at the sensor |
| Accuracy against a reference pulse oximeter | **Not done** | — | — |

Transport and timing are verified. Measurement accuracy is not.

During the 2026-11-15 check the serial adapter delivered one stale sample
about 53 times at the moment the port opened. The batcher now drops exact
repeats (`test_exact_repeats_of_one_sample_are_forwarded_once`).

## Getting a good reading

Rest the soft pad of a fingertip on the lit window with no air gap. Support the
hand, press lightly and keep the pressure steady. Keep the hand warm. Wait for
"ready" and a steady trace. A smooth trace and consistent numbers do not prove
accuracy.

## If the board fails during a demo

The Monitor and Measurement screens offer **Run simulated stream**. It produces
firmware-format text through the real parser (72 bpm, 98 %) and is labelled
"simulated · not a measurement" everywhere, including in saved history. See
[DEMO.md](DEMO.md).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| No port listed | USB cable is charge-only, or the driver is missing |
| The port cannot be opened | PlatformIO's serial monitor or another app holds the port |
| Diagnostics stay on "Waiting for the first report" | Wrong port, or the board is not running this firmware |
| `no_contact` with a finger on the sensor | Finger not covering the window, or the module's light level differs from the threshold |
| `clipped` | Pressing too hard or strong ambient light |
| `timing` | Sample rate outside 20–30 Hz; reconnect the board |

## Limits

This is an educational prototype. The estimates are experimental and have not
been compared with reference medical equipment. They cannot diagnose a
condition, and a typical-looking reading does not rule one out.
