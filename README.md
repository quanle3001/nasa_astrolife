# nasa_astrotip

A fingertip-based astronaut health monitoring prototype using an ESP32 and MAX30102
sensor to estimate heart rate and blood oxygen saturation (SpO2).

The [desktop app](software/README.md) reads the firmware's USB serial reports and
shows live estimates, relevant analysis, and suggested next steps. NASA research
supports the internal guidance; it is not displayed as a research library in the UI.
Optional manual check-ins and local history are available. See the software README
for setup, COM-port troubleshooting, evidence scope, and prototype limitations.
