import 'package:flutter/material.dart';
import 'dart:convert';

class DynamicUiModel extends ChangeNotifier {
  // A list of JSON objects, each defining a widget
  final List<Map<String, dynamic>> _widgetConfigs = [];
  List<Map<String, dynamic>> get widgetConfigs => _widgetConfigs;

  // Called by the WebSocket listener
  void handleCommand(String jsonString) {
    try {
      final command = jsonDecode(jsonString);

      if (command['type'] == 'ui_command') {
        if (command['action'] == 'add') {
          // Add or update if ID already exists
          _widgetConfigs.removeWhere((w) => w['component_id'] == command['component_id']);
          _widgetConfigs.add(command);
        }
        if (command['action'] == 'remove') {
          _widgetConfigs.removeWhere((w) => w['component_id'] == command['component_id']);
        }
        if (command['action'] == 'clear') {
          _widgetConfigs.clear();
        }
        notifyListeners(); // This tells the UI to rebuild
      }
    } catch (e) {
      print("Failed to handle command: $e");
    }
  }
}
