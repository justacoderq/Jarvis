/// Model for astronaut vital signs and suit status
class VitalsData {
  final int heartRate; // BPM
  final int oxygenLevel; // Percentage
  final double suitPressure; // PSI
  final double coreTemperature; // Celsius
  final int batteryLevel; // Percentage
  final double radiationLevel; // mSv/hr
  final String status; // NOMINAL, WARNING, CRITICAL

  VitalsData({
    required this.heartRate,
    required this.oxygenLevel,
    required this.suitPressure,
    required this.coreTemperature,
    required this.batteryLevel,
    required this.radiationLevel,
    required this.status,
  });

  /// Generate a text summary for AI context
  String toContextString() {
    return '''VITAL SIGNS STATUS:
- Heart Rate: $heartRate BPM
- Oxygen Level: $oxygenLevel%
- Suit Pressure: ${suitPressure.toStringAsFixed(1)} PSI
- Core Temperature: ${coreTemperature.toStringAsFixed(1)}°C
- Battery Level: $batteryLevel%
- Radiation Level: ${radiationLevel.toStringAsFixed(2)} mSv/hr
- System Status: $status''';
  }

  /// Check if any vital is in warning or critical range
  bool get hasWarnings {
    return heartRate > 110 ||
        heartRate < 50 ||
        oxygenLevel < 90 ||
        suitPressure < 3.0 ||
        coreTemperature > 38.0 ||
        coreTemperature < 35.5 ||
        batteryLevel < 20 ||
        radiationLevel > 0.5;
  }

  /// Check if any vital is critical
  bool get isCritical {
    return heartRate > 130 ||
        heartRate < 40 ||
        oxygenLevel < 80 ||
        suitPressure < 2.5 ||
        coreTemperature > 39.0 ||
        coreTemperature < 35.0 ||
        batteryLevel < 10 ||
        radiationLevel > 1.0;
  }
}
