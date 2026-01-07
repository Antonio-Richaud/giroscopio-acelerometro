#include <WiFi.h>
#include <Wire.h>
#include <WebSocketsServer.h>
#include <math.h>

// ===================== WIFI (STA) =====================
const char* WIFI_SSID = "";
const char* WIFI_PASS = ""; // ⚠️ No lo subas a GitHub

// WebSocket server en puerto 81
WebSocketsServer ws(81);

// ===================== SENSOR (MPU6050/MPU6500/compatibles) =====================
static const uint8_t MPU_ADDR = 0x68;

// Pines I2C (los que ya te funcionaron con el scanner)
static const int SDA_PIN = 25;
static const int SCL_PIN = 26;

// Offsets del giroscopio (deg/s)
float gyroOffsetX = 0.0f, gyroOffsetY = 0.0f, gyroOffsetZ = 0.0f;

// Filtro complementario
const float ALPHA = 0.98f;

// Orientación (grados)
float roll = 0.0f;
float pitch = 0.0f;
float yaw = 0.0f; // deriva normal sin magnetómetro

// Timing
unsigned long lastMicros = 0;
unsigned long lastSendMs = 0;

// ===================== I2C helpers (ROBUSTOS) =====================
bool mpuWrite(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(val);
  uint8_t err = Wire.endTransmission(true);
  return (err == 0);
}

bool mpuRead(uint8_t reg, uint8_t* buf, size_t len) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  uint8_t err = Wire.endTransmission(false); // repeated start
  if (err != 0) return false;

  size_t got = Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)len, (uint8_t)true);
  if (got != len) return false;

  for (size_t i = 0; i < len; i++) {
    if (!Wire.available()) return false;
    buf[i] = Wire.read();
  }
  return true;
}

const char* sensorNameFromWhoAmI(uint8_t who) {
  switch (who) {
    case 0x68: return "MPU6050";
    case 0x69: return "MPU6050 (AD0=HIGH)";
    case 0x70: return "MPU6500 / compatible";
    case 0x71: return "MPU9250 / compatible";
    default:   return "Desconocido";
  }
}

bool isSupportedWhoAmI(uint8_t who) {
  return (who == 0x68 || who == 0x69 || who == 0x70 || who == 0x71);
}

// ===================== Sensor init =====================
bool mpuInit() {
  // Wake up
  if (!mpuWrite(0x6B, 0x00)) return false;
  delay(80);

  // Gyro ±250 dps
  if (!mpuWrite(0x1B, 0x00)) return false;

  // Accel ±2g
  if (!mpuWrite(0x1C, 0x00)) return false;

  // DLPF ~44Hz
  if (!mpuWrite(0x1A, 0x03)) return false;

  // Sample rate divider
  if (!mpuWrite(0x19, 0x04)) return false;

  // WHO_AM_I
  uint8_t who = 0;
  if (!mpuRead(0x75, &who, 1)) {
    Serial.println("ERROR: Fallo leyendo WHO_AM_I (I2C).");
    return false;
  }

  Serial.print("WHO_AM_I: 0x");
  Serial.print(who, HEX);
  Serial.print(" -> ");
  Serial.println(sensorNameFromWhoAmI(who));

  // Diagnóstico extra
  uint8_t pwr = 0, gyroCfg = 0, accCfg = 0;
  if (mpuRead(0x6B, &pwr, 1) && mpuRead(0x1B, &gyroCfg, 1) && mpuRead(0x1C, &accCfg, 1)) {
    Serial.printf("PWR_MGMT_1: 0x%02X | GYRO_CFG: 0x%02X | ACC_CFG: 0x%02X\n", pwr, gyroCfg, accCfg);
  }

  return isSupportedWhoAmI(who);
}

// Lee accel (g) y gyro (deg/s)
bool readMPU(float &ax, float &ay, float &az, float &gx, float &gy, float &gz) {
  uint8_t buf[14];
  if (!mpuRead(0x3B, buf, 14)) return false;

  int16_t rawAx = (int16_t)(buf[0] << 8 | buf[1]);
  int16_t rawAy = (int16_t)(buf[2] << 8 | buf[3]);
  int16_t rawAz = (int16_t)(buf[4] << 8 | buf[5]);
  int16_t rawGx = (int16_t)(buf[8] << 8 | buf[9]);
  int16_t rawGy = (int16_t)(buf[10] << 8 | buf[11]);
  int16_t rawGz = (int16_t)(buf[12] << 8 | buf[13]);

  // Acc ±2g -> 16384 LSB/g (igual en MPU6050/6500 en este rango)
  ax = rawAx / 16384.0f;
  ay = rawAy / 16384.0f;
  az = rawAz / 16384.0f;

  // Gyro ±250 dps -> 131 LSB/(deg/s) (igual en este rango)
  gx = rawGx / 131.0f;
  gy = rawGy / 131.0f;
  gz = rawGz / 131.0f;

  return true;
}

// ===================== Calibración gyro =====================
void calibrateGyro(int samples = 700) {
  Serial.println("Calibrando giroscopio... NO muevas el sensor (2-3s).");

  float sumX = 0, sumY = 0, sumZ = 0;
  int ok = 0;

  for (int i = 0; i < samples; i++) {
    float ax, ay, az, gx, gy, gz;
    if (readMPU(ax, ay, az, gx, gy, gz)) {
      sumX += gx;
      sumY += gy;
      sumZ += gz;
      ok++;
    }
    delay(3);
  }

  if (ok == 0) {
    Serial.println("ERROR: No se pudo calibrar (sin lecturas del sensor).");
    gyroOffsetX = gyroOffsetY = gyroOffsetZ = 0;
    return;
  }

  gyroOffsetX = sumX / ok;
  gyroOffsetY = sumY / ok;
  gyroOffsetZ = sumZ / ok;

  Serial.print("Offsets gyro (deg/s): ");
  Serial.print(gyroOffsetX, 4); Serial.print(", ");
  Serial.print(gyroOffsetY, 4); Serial.print(", ");
  Serial.println(gyroOffsetZ, 4);
}

// ===================== WebSocket events =====================
void onWsEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.printf("[WS] Cliente %u conectado\n", num);
      break;
    case WStype_DISCONNECTED:
      Serial.printf("[WS] Cliente %u desconectado\n", num);
      break;
    default:
      break;
  }
}

// ===================== Setup =====================
void setup() {
  Serial.begin(115200);
  delay(250);

  // I2C estable
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(50000);
  delay(80);

  Serial.printf("I2C en SDA=%d SCL=%d\n", SDA_PIN, SCL_PIN);

  if (!mpuInit()) {
    Serial.println("ERROR: Sensor no soportado o no detectado. Revisa I2C.");
    while (true) delay(1000);
  }

  calibrateGyro();

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("Conectando WiFi");
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
    if (millis() - t0 > 20000) {
      Serial.println("\nERROR: No se pudo conectar al WiFi (timeout).");
      break;
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi conectado ✅");
    Serial.print("IP ESP32: ");
    Serial.println(WiFi.localIP());
  }

  // WebSocket
  ws.begin();
  ws.onEvent(onWsEvent);

  lastMicros = micros();
  lastSendMs = millis();
}

// ===================== Loop =====================
void loop() {
  ws.loop();

  // dt
  unsigned long nowUs = micros();
  float dt = (nowUs - lastMicros) / 1000000.0f;
  lastMicros = nowUs;
  if (dt <= 0.0f || dt > 0.2f) dt = 0.01f;

  // Lectura
  float ax, ay, az, gx, gy, gz;
  if (!readMPU(ax, ay, az, gx, gy, gz)) return;

  // Quitar offsets gyro
  gx -= gyroOffsetX;
  gy -= gyroOffsetY;
  gz -= gyroOffsetZ;

  // Roll/Pitch por accel
  float rollAcc  = atan2f(ay, az) * 180.0f / PI;
  float pitchAcc = atan2f(-ax, sqrtf(ay * ay + az * az)) * 180.0f / PI;

  // Integración gyro
  float rollGyro  = roll  + gx * dt;
  float pitchGyro = pitch + gy * dt;
  float yawGyro   = yaw   + gz * dt;

  // Complementario
  roll  = ALPHA * rollGyro  + (1.0f - ALPHA) * rollAcc;
  pitch = ALPHA * pitchGyro + (1.0f - ALPHA) * pitchAcc;
  yaw   = yawGyro;

  // Enviar ~50Hz
  unsigned long nowMs = millis();
  if (nowMs - lastSendMs >= 20) {
    lastSendMs = nowMs;

    float g = sqrtf(ax * ax + ay * ay + az * az);

    char msg[220];
    snprintf(msg, sizeof(msg),
      "{\"r\":%.2f,\"p\":%.2f,\"y\":%.2f,\"ax\":%.3f,\"ay\":%.3f,\"az\":%.3f,\"g\":%.3f}",
      roll, pitch, yaw, ax, ay, az, g
    );

    ws.broadcastTXT(msg);
  }
}
