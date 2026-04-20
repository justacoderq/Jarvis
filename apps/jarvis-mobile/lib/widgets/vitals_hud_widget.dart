import 'package:flutter/material.dart';
import '../models/vitals_data.dart';

/// HUD widget displaying workflow telemetry in a futuristic style
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
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'WORKFLOW TELEMETRY',
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
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildVitalRow(
                      Icons.favorite,
                      'RHYTHM',
                      '${vitals.heartRate}',
                      '',
                      vitals.heartRate > 110 || vitals.heartRate < 50,
                    ),
                    const SizedBox(height: 4),
                    _buildVitalRow(
                      Icons.bolt,
                      'ENERGY',
                      '${vitals.oxygenLevel}',
                      '%',
                      vitals.oxygenLevel < 90,
                    ),
                    const SizedBox(height: 4),
                    _buildVitalRow(
                      Icons.speed,
                      'LOAD',
                      vitals.suitPressure.toStringAsFixed(1),
                      '',
                      vitals.suitPressure < 3.0,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildVitalRow(
                      Icons.psychology_alt_outlined,
                      'STRESS',
                      vitals.coreTemperature.toStringAsFixed(1),
                      '',
                      vitals.coreTemperature > 38.0 || vitals.coreTemperature < 35.5,
                    ),
                    const SizedBox(height: 4),
                    _buildVitalRow(
                      Icons.battery_std,
                      'BATTERY',
                      '${vitals.batteryLevel}',
                      '%',
                      vitals.batteryLevel < 20,
                    ),
                    const SizedBox(height: 4),
                    _buildVitalRow(
                      Icons.notifications_active_outlined,
                      'NOISE',
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
