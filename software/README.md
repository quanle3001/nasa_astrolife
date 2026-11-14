# AstroTip — Native Desktop Application

The AstroTip desktop application is developed in **Python using PySide6 (Qt)**. It is designed as an offline-first interface for collecting, visualizing, storing, and eventually analyzing astronaut health indicators.

## Software Architecture

| Directory | Responsibility |
|---|---|
| `run.py` | Main application entry point |
| `astrotip/ui/` | Desktop windows, dashboard, navigation, and interactive pages |
| `astrotip/inputs/` | ESP32 serial data, questionnaires, manual inputs, images, and camera capture |
| `astrotip/analysis/` | Measurement validation, local ML, and NASA-informed guidance |
| `astrotip/models/` | Shared health data structures, units, and metadata |
| `astrotip/storage/` | SQLite database and local health records |
| `resources/` | NASA references and dataset documentation |
| `tests/` | Software testing and validation |

## Requirements

- Python 3.11 or newer (Python 3.12 recommended)
- Visual Studio Code or another Python-compatible editor
- Python virtual environment (`venv`)
- Dependencies listed in `requirements.txt`

Core libraries:

- `PySide6` — Native desktop UI and future webcam capture
- `pyserial` — ESP32 communication
- `pyqtgraph` — Real-time health visualizations
- `numpy` — Numerical processing
- `Pillow` — Image processing and validation
- `sqlite3` — Built-in Python database library

Optional dependencies for local ML, dataset analysis, testing, and packaging are defined in `requirements-ml.txt` and `requirements-dev.txt`.

## Installation

Run the following commands from the repository root.

### 1. Create a virtual environment

```bash
python3 -m venv .venv
```

### 2. Activate the environment

macOS / Linux:

```bash
source .venv/bin/activate
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

### 3. Install dependencies

```bash
python -m pip install --upgrade pip
python -m pip install -r software/requirements.txt
```

### 4. Run the application

```bash
python software/run.py
```

### 5. Stop the application

Close the application window or press `Ctrl + C` in the terminal.

To deactivate the virtual environment:

```bash
deactivate
```

## ESP32 Firmware Development

The firmware is developed separately under:

`electrical/firmware/max30102_serial_test/`

It uses PlatformIO with the Arduino framework and the SparkFun MAX3010x library.

### Compile

From the repository root:

```bash
pio run -d electrical/firmware/max30102_serial_test
```

### Upload to ESP32

```bash
pio run -d electrical/firmware/max30102_serial_test -t upload
```

### Monitor sensor readings

```bash
pio device monitor -b 115200
```

Uploading and reading real sensor data require physical hardware. Compiling does not.

The initial firmware outputs descriptive serial reports containing red/infrared optical measurements, heart-rate and SpO₂ estimates, and measurement validity.

## Planned Application Features

- **Live Dashboard:** Display real-time sensor data, signal quality, and health trends.
- **Daily Check-in:** Collect sleep, mood, fatigue, symptoms, and activity information.
- **Manual Health Input:** Record measurements from external instruments.
- **Photos & Camera:** Import image files or capture images directly with a webcam.
- **Health History:** Store and visualize measurements over time.
- **Local Assessment:** Interpret measurements using validated rules and optional lightweight ML.
- **NASA Sources:** Provide traceable evidence for spaceflight-related health guidance.

## Current Limitations

The current application is a **navigation-only placeholder**.

It does not yet:

- Connect to the ESP32 or process live serial data.
- Capture or analyze medical images.
- Save completed health records.
- Run a trained machine-learning model.
- Generate medical assessments.

These capabilities will be implemented incrementally.

When the desktop serial reader is added, close the PlatformIO Serial Monitor before connecting PySerial, since both programs generally cannot access the same serial port simultaneously.

## Development Notes

Keep the desktop application and embedded firmware modular. Verify the physical sensor and serial output before implementing higher-level assessment features.

NASA research references and compatible datasets should be documented with source information, measurement units, limitations, and data provenance.