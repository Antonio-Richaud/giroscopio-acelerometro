#include <Wire.h>

void setup() {
  Serial.begin(115200);
  Wire.begin(25, 26);
  Wire.setClock(100000);
  Serial.println("\nEscaneando I2C...");
}

void loop() {
  int n = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("Encontrado: 0x%02X\n", addr);
      n++;
    }
  }
  if (n == 0) Serial.println("Nada encontrado (0 devices)");
  Serial.println("----");
  delay(2000);
}
