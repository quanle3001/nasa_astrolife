# AstroLife - Developer tools and library checklist

## Required now

| Component | Tool / library | Reason |
| --- | --- | --- |
| Editor | Visual Studio Code | Develop firmware and native desktop app |
| ESP32 | PlatformIO IDE extension | Build/upload firmware and monitor Serial |
| ESP32 | Espressif32 + Arduino framework | Provided automatically through `platformio.ini` |
| MAX30102 | SparkFun MAX3010x Sensor Library | Provides `MAX30105.h`, FIFO readings and `spo2_algorithm.h` |
| I2C | `Wire.h` | Bundled with Arduino framework |
| Desktop | Python 3.12+, `venv`, `pip` | Local application environment |
| Desktop GUI / webcam | PySide6 / Qt Multimedia | Native UI, photo import (`QFileDialog`), direct webcam capture (`QCamera`, `QImageCapture`) |
| Telemetry | pyserial | Receive ESP32 serial CSV |
| Live charts | pyqtgraph + numpy (Qt fallback); uPlot (React app) | Plot the optical pulse and NASA series |
| NASA data and analysis | pandas, numpy, pydantic | Validate, clean and analyse NASA datasets; summarise history |
| Image utility | Pillow | Import validation and thumbnails |
| Storage | `sqlite3` | Python built-in; no pip install |
| Source control | Git and GitHub | Separate scaffold and firmware commits |

### Set up desktop (macOS / Linux)

```bash
cd nasa_astrotip
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r software/requirements.txt
python software/run.py
```

Windows: use `.venv\Scripts\activate` instead of `source .venv/bin/activate`.

### Set up firmware

Open `electrical/firmware/max30102_serial_test/` in VS Code with the PlatformIO IDE extension. PlatformIO automatically installs the ESP32 Arduino core and SparkFun library from `platformio.ini`. Build, Upload and Serial Monitor (115200 baud). You do **not** need Arduino IDE.

## Optional, add only when implementing the corresponding feature

- **Local ML and NASA dataset preparation:** `pip install -r software/requirements-ml.txt` (`scikit-learn`, `joblib`, `pandas`, `requests`). NASA HRP references are evidence, not a labeled diagnostic training set; select compatible OSDR data before fitting a model.
- **Testing and packaging:** `pip install -r software/requirements-dev.txt` (`pytest`, `ruff`, `pyinstaller`).
- **Custom image algorithms:** `opencv-python` is optional and is **not required** to capture photos using Qt Multimedia.
- **USB serial driver:** may be required depending on the USB-to-UART chip on your exact ESP32 board. Confirm the board chip before choosing CH340 or CP210x drivers.

The primary interface is now the React + Electron app in `desktop/`, which needs Node.js and `npm install` there. Setup, the test cycle and the full dependency list are in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md). No web server is involved: Electron talks to the Python backend through a private child process.
