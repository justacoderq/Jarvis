import 'dart:async';
import 'dart:math';
import '../models/vitals_data.dart';

/// Service to generate and manage simulated astronaut vitals
class VitalsService {
  final StreamController<VitalsData> _vitalsController =
      StreamController<VitalsData>.broadcast();
  Timer? _updateTimer;
  final Random _random = Random();

  // Base values for vitals
  double _baseHeartRate = 72.0;
  double _baseOxygen = 98.0;
  double _basePressure = 4.3;
  double _baseTemp = 37.0;
  double _baseBattery = 85.0;
  double _baseRadiation = 0.15;

  Stream<VitalsData> get vitalsStream => _vitalsController.stream;

  /// Start generating vitals data
  void start() {
    // Update vitals every 2 seconds
    _updateTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      _generateVitals();
    });

    // Generate initial vitals
    _generateVitals();
  }

  /// Generate realistic vitals with small variations
  void _generateVitals() {
    // Add realistic variations
    final heartRate = (_baseHeartRate + _random.nextDouble() * 10 - 5).round();
    final oxygen = (_baseOxygen + _random.nextDouble() * 2 - 1).round();
    final pressure = _basePressure + _random.nextDouble() * 0.2 - 0.1;
    final temp = _baseTemp + _random.nextDouble() * 0.4 - 0.2;
    final battery = _baseBattery - 0.01; // Slowly drain battery
    final radiation = _baseRadiation + _random.nextDouble() * 0.05;

    // Update base battery (drains slowly)
    if (_baseBattery > 0) {
      _baseBattery = battery;
    }

    // Determine status
    final vitals = VitalsData(
      heartRate: heartRate.clamp(60, 95),
      oxygenLevel: oxygen.clamp(95, 100),
      suitPressure: pressure.clamp(3.8, 4.5),
      coreTemperature: temp.clamp(36.5, 37.5),
      batteryLevel: battery.round().clamp(0, 100),
      radiationLevel: radiation.clamp(0.1, 0.3),
      status: _determineStatus(heartRate, oxygen, pressure, temp, battery, radiation),
    );

    _vitalsController.add(vitals);
  }

  /// Determine overall system status
  String _determineStatus(int hr, int o2, double pressure, double temp, double battery, double rad) {
    // Check for critical conditions
    if (hr > 130 || hr < 40 || o2 < 80 || pressure < 2.5 || temp > 39.0 || temp < 35.0 || battery < 10 || rad > 1.0) {
      return 'CRITICAL';
    }

    // Check for warnings
    if (hr > 110 || hr < 50 || o2 < 90 || pressure < 3.0 || temp > 38.0 || temp < 35.5 || battery < 20 || rad > 0.5) {
      return 'WARNING';
    }

    return 'NOMINAL';
  }

  /// Simulate an activity increase (raises heart rate temporarily)
  void simulateActivity() {
    _baseHeartRate = 95.0;
    Future.delayed(const Duration(seconds: 30), () {
      _baseHeartRate = 72.0;
    });
  }

  /// Get current vitals synchronously
  VitalsData getCurrentVitals() {
    final heartRate = (_baseHeartRate + _random.nextDouble() * 10 - 5).round();
    final oxygen = (_baseOxygen + _random.nextDouble() * 2 - 1).round();
    final pressure = _basePressure + _random.nextDouble() * 0.2 - 0.1;
    final temp = _baseTemp + _random.nextDouble() * 0.4 - 0.2;
    final battery = _baseBattery;
    final radiation = _baseRadiation + _random.nextDouble() * 0.05;

    return VitalsData(
      heartRate: heartRate.clamp(60, 95),
      oxygenLevel: oxygen.clamp(95, 100),
      suitPressure: pressure.clamp(3.8, 4.5),
      coreTemperature: temp.clamp(36.5, 37.5),
      batteryLevel: battery.round().clamp(0, 100),
      radiationLevel: radiation.clamp(0.1, 0.3),
      status: _determineStatus(heartRate, oxygen, pressure, temp, battery, radiation),
    );
  }

  void dispose() {
    _updateTimer?.cancel();
    _vitalsController.close();
  }
}
