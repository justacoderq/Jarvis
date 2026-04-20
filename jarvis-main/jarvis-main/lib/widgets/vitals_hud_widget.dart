import 'package:flutter/material.dart';
import '../models/vitals_data.dart';

/// HUD widget displaying astronaut vitals in a futuristic style
class VitalsHUDWidget extends StatelessWidget {
  final VitalsData vitals;

  const VitalsHUDWidget({
    super.key,
    required this.vitals,
  });

  Color _getStatusColor() {
    switch (vitals.status) {
      case 'CRITICAL':
        return Colors.red;
      case 'WARNING':
        return Colors.orange;
      default:
        return Colors.cyanAccent;
    }
  }

  @override
  Widget build(BuildContext context) {
    final statusColor = _getStatusColor();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.7),
        border: Border.all(
          color: statusColor.withOpacity(0.5),
          width: 1,
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Status header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'VITALS',
                style: TextStyle(
                  color: statusColor,
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 2,
                  fontFamily: 'monospace',
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.2),
                  border: Border.all(color: statusColor, width: 1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  vitals.status,
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 8,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1,
                    fontFamily: 'monospace',
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Vitals grid (2 columns)
          Row(
            children: [
              // Left column
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildVitalRow(
                      Icons.favorite,
                      'HR',
                      '${vitals.heartRate}',
                      'BPM',
                      vitals.heartRate > 110 || vitals.heartRate < 50,
                    ),
                    const SizedBox(height: 4),
                    _buildVitalRow(
                      Icons.air,
                      'O₂',
                      '${vitals.oxygenLevel}',
                      '%',
                      vitals.oxygenLevel < 90,
                    ),
                    const SizedBox(height: 4),
                    _buildVitalRow(
                      Icons.speed,
                      'PSI',
                      vitals.suitPressure.toStringAsFixed(1),
                      '',
                      vitals.suitPressure < 3.0,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),

              // Right column
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildVitalRow(
                      Icons.thermostat,
                      'TEMP',
                      vitals.coreTemperature.toStringAsFixed(1),
                      '°C',
                      vitals.coreTemperature > 38.0 || vitals.coreTemperature < 35.5,
                    ),
                    const SizedBox(height: 4),
                    _buildVitalRow(
                      Icons.battery_std,
                      'BAT',
                      '${vitals.batteryLevel}',
                      '%',
                      vitals.batteryLevel < 20,
                    ),
                    const SizedBox(height: 4),
                    _buildVitalRow(
                      Icons.warning_amber,
                      'RAD',
                      vitals.radiationLevel.toStringAsFixed(2),
                      '',
                      vitals.radiationLevel > 0.5,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildVitalRow(IconData icon, String label, String value, String unit, bool warning) {
    final color = warning ? Colors.orange : Colors.cyanAccent;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          icon,
          size: 12,
          color: color.withOpacity(0.7),
        ),
        const SizedBox(width: 4),
        Text(
          '$label:',
          style: TextStyle(
            color: color.withOpacity(0.7),
            fontSize: 9,
            fontFamily: 'monospace',
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(width: 4),
        Text(
          value,
          style: TextStyle(
            color: color,
            fontSize: 11,
            fontFamily: 'monospace',
            fontWeight: FontWeight.bold,
          ),
        ),
        if (unit.isNotEmpty) ...[
          const SizedBox(width: 2),
          Text(
            unit,
            style: TextStyle(
              color: color.withOpacity(0.5),
              fontSize: 8,
              fontFamily: 'monospace',
            ),
          ),
        ],
      ],
    );
  }
}
