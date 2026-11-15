# AstroLife — Astronaut Health Monitoring System

AstroLife is an offline-first, multimodal astronaut health-monitoring prototype developed for the **2026 NASA Space Apps Challenge**.

The project combines an ESP32-based fingertip sensor with a native Python desktop application to help astronauts monitor health indicators, review trends, and eventually receive NASA-informed health guidance.

## Project Overview

AstroLife is designed to support multiple health data sources:

- **Wearable sensor:** MAX30102 for optical PPG readings, heart-rate estimation, and estimated blood oxygen saturation (SpO₂).
- **Manual health measurements:** Blood pressure, body temperature, blood glucose, and other indicators.
- **Daily questionnaires:** Sleep, fatigue, mood, symptoms, and activity.
- **Image inputs:** Import existing medical images or capture photos directly using a webcam.
- **NASA research and datasets:** Support explainable health-risk assessments based on relevant spaceflight research.

## Technology Stack

| Component | Technologies |
|---|---|
| Embedded hardware | ESP32, MAX30102 |
| Firmware | C++, Arduino framework, PlatformIO |
| Desktop application | Python, PySide6 |
| Sensor communication | I²C, USB Serial, PySerial |
| Visualization | PyQtGraph, NumPy |
| Image handling | Qt Multimedia, Pillow |
| Local storage | SQLite |
| Planned local AI | scikit-learn, joblib |
| Research resources | NASA Human Research Program, NASA OSDR |

## Project Structure

```text
nasa_astrotip/
├── electrical/
│   └── firmware/
│       └── max30102_serial_test/
│           ├── platformio.ini
│           └── src/main.cpp
├── software/
│   ├── run.py
│   ├── requirements.txt
│   ├── astrotip/
│   │   ├── ui/
│   │   ├── inputs/
│   │   ├── analysis/
│   │   ├── models/
│   │   └── storage/
│   ├── resources/
│   └── tests/
└── README.md
```

Mechanical design files will be maintained separately as the project develops.

## Quick Start

### 1. Run the desktop application

Create and activate a Python virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Install dependencies and launch:

```bash
python -m pip install -r software/requirements.txt
python software/run.py
```

The current desktop application provides placeholder navigation pages. Live sensor integration and health assessment features are under development.

### 2. Build the ESP32 firmware

Install the PlatformIO IDE extension in Visual Studio Code.

Navigate to the firmware directory:

```bash
cd electrical/firmware/max30102_serial_test
```

Compile the firmware:

```bash
pio run
```

The firmware can be compiled without physical hardware.

Once the ESP32 is connected, upload:

```bash
pio run -t upload
```

Open the Serial Monitor:

```bash
pio device monitor -b 115200
```

The terminal displays descriptive MAX30102 reports, including raw optical readings, estimated heart rate, estimated SpO₂, and measurement validity.

On macOS, if `pio` is not recognized, use the PlatformIO Core CLI terminal in VS Code or run `~/.platformio/penv/bin/pio`.

## Development Status

- [x] Initial repository and software structure
- [x] PySide6 desktop application placeholder
- [x] ESP32 MAX30102 firmware implementation
- [ ] Physical sensor testing and verification
- [ ] Real-time sensor-to-desktop integration
- [ ] Manual health inputs and questionnaires
- [ ] Image import and webcam capture
- [ ] Local health history and visualization
- [ ] NASA-informed health assessment
- [ ] Optional local machine-learning integration

## Important Notice

AstroLife is an educational engineering prototype and is **not a certified medical device**. Heart-rate and SpO₂ estimates have not yet been validated against reference medical equipment. Its future assessment features are intended for decision support, not autonomous medical diagnosis or treatment.
