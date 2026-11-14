/*
  AstroTip - MAX30102 serial sensor test (ESP32)
  Purpose: continuously print optical samples and experimental HR/SpO2 estimates.

  Wiring: ESP32 3V3 -> breakout VIN/VCC (ONLY if rated for 3.3V),
          GND -> GND, GPIO21 -> SDA, GPIO22 -> SCL.
  Ensure I2C pull-ups do not exceed ESP32's 3.3V GPIO rating.

  Dependencies: sS Code PlatformIO Espressif32 + Arduino framework;
                SparkFun MAX3010x Pulse and Proximity Sensor Library.
  Output: CSV at 115200 baud. -1 means unavailable/invalid.
  Educational prototype; not a medical device.
*/

#include <Arduino.h>
#include <Wire.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"

// ESP32 I2C pins
#define SDA_PIN 21
#define SCL_PIN 22

// Sensor configuration
#define BUFFER_SIZE 100
#define UPDATE_SIZE 25

// Experimental finger detection threshold
#define FINGER_THRESHOLD 50000

MAX30105 sensor;

// Red and infrared sensor buffers
uint32_t redBuffer[BUFFER_SIZE];
uint32_t irBuffer[BUFFER_SIZE];

// Calculated health measurements
int32_t heartRate = -1;
int32_t spo2 = -1;

// Algorithm validity flags
int8_t validHeartRate = 0;
int8_t validSpO2 = 0;

// Most recent optical readings
uint32_t lastRed = 0;
uint32_t lastIR = 0;

bool initialized = false;
uint32_t lastCollectionMs = 0;
uint16_t lastCollectionCount = 0;

// Take ONE paired red/infrared sample from the same sensor FIFO entry.
// Do not call getRed()/getIR() here: those poll for NEW data independently.
bool readSample(int index)
{
  const uint32_t start = millis();

  while (!sensor.available())
  {
    sensor.check();

    if (millis() - start > 2000UL)
    {
      Serial.println("ERROR: Sensor reading timeout!");
      return false;
    }
  }

  redBuffer[index] = sensor.getRed();
  irBuffer[index] = sensor.getIR();

  lastRed = redBuffer[index];
  lastIR = irBuffer[index];

  sensor.nextSample();

  return true;
}

// Calculate heart rate and SpO2
void calculateHealthData()
{
  maxim_heart_rate_and_oxygen_saturation(
      irBuffer,
      BUFFER_SIZE,
      redBuffer,
      &spo2,
      &validSpO2,
      &heartRate,
      &validHeartRate);
}

// Print descriptive measurements
void printHealthReport()
{
  bool fingerDetected = lastIR > FINGER_THRESHOLD;

  bool heartRateOK =
      fingerDetected &&
      validHeartRate == 1 &&
      heartRate >= 35 &&
      heartRate <= 220;

  bool spo2OK =
      fingerDetected &&
      validSpO2 == 1 &&
      spo2 >= 70 &&
      spo2 <= 100;

  Serial.println();
  Serial.println("======================================");
  Serial.println("       ASTROTIP HEALTH MONITOR");
  Serial.println("======================================");

  Serial.println("Sensor Status: Connected");

  if (fingerDetected)
  {
    Serial.println("Finger Detection: Likely detected");
  }
  else
  {
    Serial.println("Finger Detection: Not detected");
    Serial.println("Action: Place finger on sensor.");
  }

  Serial.println();
  Serial.println("--- HEALTH MEASUREMENTS ---");

  // Heart rate
  Serial.print("Heart Rate: ");

  if (heartRateOK)
  {
    Serial.print(heartRate);
    Serial.println(" BPM");
    Serial.println(
        "Description: Estimated heartbeats per minute.");
    Serial.println("Measurement Valid: Yes");
  }
  else
  {
    Serial.println("Unavailable");
    Serial.println(
        "Description: Insufficient reliable pulse data.");
    Serial.println("Measurement Valid: No");
  }

  Serial.println();

  // Blood oxygen
  Serial.print("Blood Oxygen (SpO2): ");

  if (spo2OK)
  {
    Serial.print(spo2);
    Serial.println("%");
    Serial.println(
        "Description: Estimated peripheral oxygen saturation.");
    Serial.println("Measurement Valid: Yes");
  }
  else
  {
    Serial.println("Unavailable");
    Serial.println(
        "Description: Insufficient reliable oxygen data.");
    Serial.println("Measurement Valid: No");
  }

  Serial.println();
  Serial.println("--- RAW SENSOR DATA ---");

  Serial.print("Red Light: ");
  Serial.println(lastRed);

  Serial.print("Infrared Light: ");
  Serial.println(lastIR);

  Serial.println(
      "Description: Reflected optical signal values.");

  Serial.println();
  Serial.print("Elapsed Time: ");
  Serial.print(millis() / 1000.0, 1);
  Serial.println(" seconds");

  Serial.println();
  Serial.println("Note: Experimental estimates only.");
  Serial.println("Not for medical diagnosis.");
  Serial.println("======================================");
}

void setup()
{
  Serial.begin(115200);
  delay(800);

  Wire.begin(SDA_PIN, SCL_PIN);

  Serial.println("Initializing AstroTip MAX30102...");

  if (!sensor.begin(Wire, I2C_SPEED_FAST))
  {
    Serial.println("ERROR: MAX30102 not detected!");
    Serial.println("Check wiring, power, SDA, SCL.");

    while (true)
    {
      delay(1000);
    }
  }

  // brightness, averaging, LED mode,
  // sample rate, pulse width, ADC range
  sensor.setup(60, 4, 2, 100, 411, 4096);

  sensor.setPulseAmplitudeGreen(0);

  Serial.println("MAX30102 connected successfully!");
  Serial.println("Place your finger on the sensor.");
  Serial.println("Collecting initial samples...");
}

void loop()
{
  if (!initialized)
  {
    const uint32_t start = millis();
    for (int i = 0; i < BUFFER_SIZE; ++i)
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
    lastCollectionCount = BUFFER_SIZE;
    calculateHealthData();
    initialized = true;
    printHealthReport();
    return;
  }

  // Shift old readings
  for (int i = UPDATE_SIZE; i < BUFFER_SIZE; i++)
  {
    redBuffer[i - UPDATE_SIZE] = redBuffer[i];
    irBuffer[i - UPDATE_SIZE] = irBuffer[i];
  }

  // Collect 25 new readings
  const uint32_t start = millis();
  for (int i = BUFFER_SIZE - UPDATE_SIZE; i < BUFFER_SIZE; ++i)
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

  // Recalculate and print results
  lastCollectionMs = millis() - start;
  lastCollectionCount = UPDATE_SIZE;

  calculateHealthData();
  printHealthReport();
}