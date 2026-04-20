/// Model for workflow telemetry and device wellness state
class VitalsData {
  final int heartRate; // BPM
  final int oxygenLevel; // Percentage
  final double suitPressure; // Synthetic workload pressure score
  final double coreTemperature; // Synthetic stress index
  final int batteryLevel; // Percentage
  final double radiationLevel; // Synthetic interruptions index
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
    return '''WORKFLOW TELEMETRY:
- Focus Rhythm: $heartRate BPM
- Energy Level: $oxygenLevel%
- Workload Pressure: ${suitPressure.toStringAsFixed(1)}
- Stress Index: ${coreTemperature.toStringAsFixed(1)}
- Device Battery: $batteryLevel%
- Interruptions Index: ${radiationLevel.toStringAsFixed(2)}
- System Status: $status''';
  }

  /// Check if any telemetry is in warning or critical range
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

  /// Check if any telemetry is critical
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
