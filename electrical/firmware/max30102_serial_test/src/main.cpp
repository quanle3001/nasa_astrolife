/*
Astro Life - MAX30102 serial sensor test (ESP32)
Purpose: print optical samples and experimental HR/SpO2 estimates.

ESP32 wiring: 3V3 -> sensor VCC/VIN if rated for 3.3V,
              GND -> GND, GPIO21 -> SDA, GPIO22 -> SCL.
Never expose ESP32 GPIO to I2C pullups above 3.3V.

PlatformIO: espressif32, Arduino; SparkFun MAX3010x library.
Serial: 115200 baud. -1 means unavailable/invalid.
Optical stream: PPG,<sequence>,<read time in ms>,<red counts>,<IR counts>.
Educational prototype; not a medical device.
*/

#include <Arduino.h>
#include <Wire.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"

#define SDA_PIN 21
#define SCL_PIN 22
constexpr int SAMPLE_COUNT = 100;
#define UPDATE_SIZE 25
#define FINGER_THRESHOLD 50000UL

MAX30105 sensor;
uint32_t redBuffer[SAMPLE_COUNT];
uint32_t irBuffer[SAMPLE_COUNT];
uint32_t sampleTimes[SAMPLE_COUNT];

int32_t heartRate = -1;
int32_t spo2 = -1;
int8_t validHeartRate = 0;
int8_t validSpO2 = 0;

uint32_t lastRed = 0;
uint32_t lastIR = 0;
uint32_t sampleSequence = 0;

bool initialized = false;
uint32_t lastCollectionMs = 0;
uint16_t lastCollectionCount = 0;
float measuredSampleRate = 0;
const char *signalStatus = "collecting";

// Take ONE paired red/infrared sample from the same sensor FIFO entry.
// Do not call getRed()/getIR() here: those poll for NEW data independently.
bool readSample(int index)
{
  const uint32_t start = millis();

  while (!sensor.available())
  {
    const uint16_t collected = sensor.check();
    // The library's four-slot ring cannot retain a backlog of four samples.
    // Restart the measurement rather than calculate on silently dropped data.
    if (collected >= STORAGE_SIZE)
    {
      while (sensor.available()) sensor.nextSample();
      sensor.clearFIFO();
      Serial.println("ERROR: Sample backlog; collecting a fresh measurement.");
      return false;
    }

    if (millis() - start > 2000UL)
    {
      Serial.println("ERROR: Sensor reading timeout!");
      return false;
    }
    delay(1);
  }

  redBuffer[index] = sensor.getFIFORed();
  irBuffer[index] = sensor.getFIFOIR();
  lastRed = redBuffer[index];
  lastIR = irBuffer[index];
  sensor.nextSample();
  // Stream every paired FIFO sample, not just the last sample of each report.
  // These are raw optical counts, regardless of finger/algorithm validity.
  const uint32_t sampledAt = millis();
  sampleTimes[index] = sampledAt;
  Serial.print("PPG,");
  Serial.print(sampleSequence++);
  Serial.print(',');
  Serial.print(sampledAt);
  Serial.print(',');
  Serial.print(lastRed);
  Serial.print(',');
  Serial.println(lastIR);
  return true;
}

void calculateHealthData()
{
  validHeartRate = 0;
  validSpO2 = 0;
  const uint32_t duration = sampleTimes[SAMPLE_COUNT - 1] - sampleTimes[0];
  measuredSampleRate = duration > 0 ? (SAMPLE_COUNT - 1) * 1000.0f / duration : 0;
  signalStatus = "ready";
  // Require contact throughout the four-second window, not just at its end.
  // These conservative engineering checks do not establish medical accuracy.
  for (int i = 0; i < SAMPLE_COUNT; ++i)
  {
    if (irBuffer[i] <= FINGER_THRESHOLD)
    {
      signalStatus = "no_contact";
      return;
    }
    if (redBuffer[i] == 0 || redBuffer[i] >= 262143UL || irBuffer[i] >= 262143UL)
    {
      signalStatus = "clipped";
      return;
    }
  }
  // The bundled algorithm assumes 25 samples/sec. Never scale its results to
  // disguise missing samples; reject a window whose observed timing is wrong.
  if (measuredSampleRate < 20.0f || measuredSampleRate > 30.0f)
  {
    signalStatus = "timing";
    return;
  }
  maxim_heart_rate_and_oxygen_saturation(
      irBuffer, SAMPLE_COUNT, redBuffer,
      &spo2, &validSpO2, &heartRate, &validHeartRate);
}

void printHealthReport()
{
  const bool fingerDetected = lastIR > FINGER_THRESHOLD;
  // These are only basic display gates; neither guarantees clinical accuracy.
  const bool heartRateOK = fingerDetected && validHeartRate == 1 &&
                           heartRate >= 35 && heartRate <= 220;
  const bool spo2OK = fingerDetected && validSpO2 == 1 &&
                      spo2 >= 70 && spo2 <= 100;

  Serial.println();
  Serial.println("======================================");
  Serial.println("       ASTRO LIFE HEALTH MONITOR");
  Serial.println("======================================");
  Serial.println("Sensor Status: Connected");
  Serial.println("Firmware: astro-life-ppg-2");
  Serial.print("Signal Status: ");
  Serial.println(signalStatus);
  Serial.print("Sample Rate: ");
  Serial.print(measuredSampleRate, 1);
  Serial.println(" Hz");
  Serial.print("Finger Detection: ");
  Serial.println(fingerDetected ? "Likely detected" : "Not detected");
  if (!fingerDetected)
    Serial.println("Action: Place finger on sensor.");

  Serial.println("\n--- HEALTH MEASUREMENTS ---");
  Serial.print("Heart Rate: ");
  if (heartRateOK)
  {
    Serial.print(heartRate);
    Serial.println(" BPM");
  }
  else
    Serial.println("Unavailable");
  Serial.print("Measurement Valid: ");
  Serial.println(heartRateOK ? "Yes" : "No");
  Serial.print("Heart Rate Algorithm Flag: ");
  Serial.println(validHeartRate == 1 ? "Yes" : "No");

  Serial.print("Blood Oxygen (SpO2): ");
  if (spo2OK)
  {
    Serial.print(spo2);
    Serial.println("%");
  }
  else
    Serial.println("Unavailable");
  Serial.print("Measurement Valid: ");
  Serial.println(spo2OK ? "Yes" : "No");
  Serial.print("SpO2 Algorithm Flag: ");
  Serial.println(validSpO2 == 1 ? "Yes" : "No");

  Serial.println();
  Serial.println("--- RAW SENSOR DATA ---");

  Serial.print("Red Light: ");
  Serial.println(lastRed);

  Serial.print("Infrared Light: ");
  Serial.println(lastIR);
  if (lastCollectionMs > 0)
  {
    Serial.print("Approximate collection rate: ");
    Serial.print(lastCollectionCount * 1000.0f / lastCollectionMs, 1);
    Serial.println(" samples/sec");
  }
  Serial.print("Elapsed Time: ");
  Serial.print(millis() / 1000.0f, 1);
  Serial.println(" seconds");
  Serial.println("Algorithm flags and thresholds are NOT accuracy validation.");
  Serial.println("Experimental estimates only; not for medical diagnosis.");
  Serial.println("======================================");
}

void setup()
{
  Serial.begin(115200);
  delay(800);
  Wire.begin(SDA_PIN, SCL_PIN);
  Serial.println("Initializing Astro Life MAX30102...");

  if (!sensor.begin(Wire, I2C_SPEED_FAST))
  {
    Serial.println("ERROR: MAX30102 not detected! Check wiring and power.");
    while (true)
      delay(1000);
  }

  // SparkFun Example8 SpO2 configuration. Keep unchanged for first diagnostic.
  // Sensor: 100 Hz; FIFO averages 4 -> ~25 FIFO samples per second.
  sensor.setup(60, 4, 2, 100, 411, 4096);
  sensor.setPulseAmplitudeGreen(0);

  Serial.println("MAX30102 connected successfully!");
  Serial.println("Place your finger on the sensor.");
  Serial.println("Collecting initial 100 samples...");
}

void loop()
{
  if (!initialized)
  {
    sensor.clearFIFO();
    while (sensor.available()) sensor.nextSample();
    const uint32_t start = millis();
    for (int i = 0; i < SAMPLE_COUNT; ++i)
    {
      if (!readSample(i))
      {
        validHeartRate = 0;
        validSpO2 = 0;
        delay(250);
        return;
      }
    }
    lastCollectionMs = millis() - start;
    lastCollectionCount = SAMPLE_COUNT;
    calculateHealthData();
    initialized = true;
    printHealthReport();
    return;
  }

  for (int i = UPDATE_SIZE; i < SAMPLE_COUNT; ++i)
  {
    redBuffer[i - UPDATE_SIZE] = redBuffer[i];
    irBuffer[i - UPDATE_SIZE] = irBuffer[i];
    sampleTimes[i - UPDATE_SIZE] = sampleTimes[i];
  }

  const uint32_t start = millis();
  for (int i = SAMPLE_COUNT - UPDATE_SIZE; i < SAMPLE_COUNT; ++i)
  {
    if (!readSample(i))
    {
      initialized = false;
      validHeartRate = 0;
      validSpO2 = 0;
      delay(250);
      return;
    }
  }
  lastCollectionMs = millis() - start;
  lastCollectionCount = UPDATE_SIZE;

  calculateHealthData();
  printHealthReport();
}
