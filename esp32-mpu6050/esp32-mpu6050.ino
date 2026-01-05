#include <WiFi.h>
#include <Wire.h>
#include <WebSocketsServer.h>
#include <math.h>

// ===================== WIFI (STA) =====================
const char* WIFI_SSID = "TU_WIFI";
const char* WIFI_PASS = "TU_PASSWORD";

// WebSocket server en puerto 81
WebSocketsServer ws(81);

// ===================== MPU6050 =====================
static const uint8_t MPU_ADDR = 0x68;

// Pines I2C recomendados en ESP32
static const int SDA_PIN = 21;
static const int SCL_PIN = 22;

// Offsets del giroscopio (deg/s)
float gyroOffsetX = 0, gyroOffsetY = 0, gyroOffsetZ = 0;

// Complementary filter
// ALPHA cerca de 1 = más confianza en gyro, más suave
const float ALPHA = 0.98f;

// Orientación (grados)
float roll = 0.0f;
float pitch = 0.0f;
float yaw = 0.0f; // deriva (normal)

// Timing
unsigned long lastMicros = 0;
unsigned long lastSendMs = 0;

// ===================== I2C helpers =====================
void mpuWrite(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission(true);
}

void mpuRead(uint8_t reg, uint8_t* buf, size_t len) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom((int)MPU_ADDR, (int)len, true);
  for (size_t i = 0; i < len; i++) buf[i] = Wire.read();
}

// ===================== MPU init =====================
bool mpuInit() {
  // Wake up
  mpuWrite(0x6B, 0x00);
  delay(50);

  // Gyro ±250 deg/s
  mpuWrite(0x1B, 0x00);

  // Accel ±2g
  mpuWrite(0x1C, 0x00);

  // DLPF ~44Hz (reduce ruido)
  mpuWrite(0x1A, 0x03);

  // Sample rate divider (opcional)
  mpuWrite(0x19, 0x04);

  // WHO_AM_I
  uint8_t who = 0;
  mpuRead(0x75, &who, 1);

  Serial.print("MPU WHO_AM_I: 0x");
  Serial.println(who, HEX);

  return (who == 0x68 || who == 0x69);
}

// Lee accel (g) y gyro (deg/s)
void readMPU(float &ax, float &ay, float &az, float &gx, float &gy, float &gz) {
  uint8_t buf[14];
  mpuRead(0x3B, buf, 14);

  int16_t rawAx = (int16_t)(buf[0] << 8 | buf[1]);
  int16_t rawAy = (int16_t)(buf[2] << 8 | buf[3]);
  int16_t rawAz = (int16_t)(buf[4] << 8 | buf[5]);
  int16_t rawGx = (int16_t)(buf[8] << 8 | buf[9]);
  int16_t rawGy = (int16_t)(buf[10] << 8 | buf[11]);
  int16_t rawGz = (int16_t)(buf[12] << 8 | buf[13]);

  // Acc ±2g -> 16384 LSB/g
  ax = rawAx / 16384.0f;
  ay = rawAy / 16384.0f;
  az = rawAz / 16384.0f;

  // Gyro ±250 deg/s -> 131 LSB/(deg/s)
  gx = rawGx / 131.0f;
  gy = rawGy / 131.0f;
  gz = rawGz / 131.0f;
}

// ===================== Calibración gyro =====================
void calibrateGyro(int samples = 700) {
  Serial.println("Calibrando giroscopio... NO muevas el sensor (2-3s).");

  float sumX = 0, sumY = 0, sumZ = 0;
  for (int i = 0; i < samples; i++) {
    float ax, ay, az, gx, gy, gz;
    readMPU(ax, ay, az, gx, gy, gz);
    sumX += gx;
    sumY += gy;
    sumZ += gz;
    delay(3);
  }

  gyroOffsetX = sumX / samples;
  gyroOffsetY = sumY / samples;
  gyroOffsetZ = sumZ / samples;

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
  delay(200);

  // I2C
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);

  if (!mpuInit()) {
    Serial.println("ERROR: No se detecta MPU6050 (0x68). Revisa cableado.");
    while (true) delay(1000);
  }

  calibrateGyro();

  // WiFi STA
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("Conectando WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println("\nWiFi conectado ✅");
  Serial.print("IP ESP32: ");
  Serial.println(WiFi.localIP());

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

  // Lectura
  float ax, ay, az, gx, gy, gz;
  readMPU(ax, ay, az, gx, gy, gz);

  // Quitar offsets gyro
  gx -= gyroOffsetX;
  gy -= gyroOffsetY;
  gz -= gyroOffsetZ;

  // Roll/Pitch por acelerómetro (grados)
  // OJO: si montas el sensor distinto, puede requerir invertir signos o ejes.
  float rollAcc  = atan2f(ay, az) * 180.0f / PI;
  float pitchAcc = atan2f(-ax, sqrtf(ay * ay + az * az)) * 180.0f / PI;

  // Integración gyro (deg)
  float rollGyro  = roll  + gx * dt;
  float pitchGyro = pitch + gy * dt;
  float yawGyro   = yaw   + gz * dt;

  // Filtro complementario
  roll  = ALPHA * rollGyro  + (1.0f - ALPHA) * rollAcc;
  pitch = ALPHA * pitchGyro + (1.0f - ALPHA) * pitchAcc;
  yaw   = yawGyro; // deriva (normal)

  // Enviar a ~50Hz
  unsigned long nowMs = millis();
  if (nowMs - lastSendMs >= 20) {
    lastSendMs = nowMs;

    // Fuerza G total (incluye gravedad)
    float g = sqrtf(ax * ax + ay * ay + az * az);

    // JSON compacto (r,p,y en grados, ax/ay/az en g)
    char msg[200];
    snprintf(msg, sizeof(msg),
      "{\"r\":%.2f,\"p\":%.2f,\"y\":%.2f,\"ax\":%.3f,\"ay\":%.3f,\"az\":%.3f,\"g\":%.3f}",
      roll, pitch, yaw, ax, ay, az, g
    );

    ws.broadcastTXT(msg);
  }
}
