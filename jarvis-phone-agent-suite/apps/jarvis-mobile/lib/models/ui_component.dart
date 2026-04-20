import 'package:flutter/material.dart';
import 'task_item.dart';

/// Represents a dynamic UI component that can be displayed
class UIComponent {
  final String id;
  final UIComponentType type;
  final Map<String, dynamic> data;
  final DateTime createdAt;

  UIComponent({
    required this.id,
    required this.type,
    required this.data,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  /// Create a note component
  factory UIComponent.note({
    required String id,
    required String title,
    required String content,
  }) {
    return UIComponent(
      id: id,
      type: UIComponentType.note,
      data: {
        'title': title,
        'content': content,
      },
    );
  }

  /// Create a reminder component
  factory UIComponent.reminder({
    required String id,
    required String title,
    required DateTime time,
    String? description,
  }) {
    return UIComponent(
      id: id,
      type: UIComponentType.reminder,
      data: {
        'title': title,
        'time': time.toIso8601String(),
        'description': description,
      },
    );
  }

  /// Create a calendar event component
  factory UIComponent.calendarEvent({
    required String id,
    required String title,
    required DateTime startTime,
    DateTime? endTime,
    String? description,
  }) {
    return UIComponent(
      id: id,
      type: UIComponentType.calendarEvent,
      data: {
        'title': title,
        'startTime': startTime.toIso8601String(),
        'endTime': endTime?.toIso8601String(),
        'description': description,
      },
    );
  }

  /// Create a list component
  factory UIComponent.list({
    required String id,
    required String title,
    required List<String> items,
  }) {
    return UIComponent(
      id: id,
      type: UIComponentType.list,
      data: {
        'title': title,
        'items': items,
      },
    );
  }

  /// Create a custom card component
  factory UIComponent.card({
    required String id,
    required String title,
    String? subtitle,
    String? content,
    IconData? icon,
  }) {
    return UIComponent(
      id: id,
      type: UIComponentType.card,
      data: {
        'title': title,
        'subtitle': subtitle,
        'content': content,
        'icon': icon?.codePoint,
      },
    );
  }

  /// Create a task list component
  factory UIComponent.taskList({
    required String id,
    required String title,
    required List<TaskItem> tasks,
  }) {
    return UIComponent(
      id: id,
      type: UIComponentType.taskList,
      data: {
        'title': title,
        'tasks': tasks.map((t) => t.toMap()).toList(),
      },
    );
  }

  /// Get tasks from component data
  List<TaskItem> get tasks {
    if (type != UIComponentType.taskList) return [];
    final taskMaps = data['tasks'] as List<dynamic>? ?? [];
    return taskMaps.map((map) => TaskItem.fromMap(map as Map<String, dynamic>)).toList();
  }

  /// Update a task's completion status
  UIComponent updateTaskStatus(String taskId, bool isCompleted) {
    if (type != UIComponentType.taskList) return this;

    final updatedTasks = tasks.map((task) {
      if (task.id == taskId) {
        return task.copyWith(isCompleted: isCompleted);
      }
      return task;
    }).toList();

    return UIComponent.taskList(
      id: id,
      title: data['title'] as String,
      tasks: updatedTasks,
    );
  }
}

/// Types of UI components that can be displayed
enum UIComponentType {
  note,
  reminder,
  calendarEvent,
  list,
  card,
  taskList,
}

/// Extension to get display name for component types
extension UIComponentTypeExtension on UIComponentType {
  String get displayName {
    switch (this) {
      case UIComponentType.note:
        return 'Note';
      case UIComponentType.reminder:
        return 'Reminder';
      case UIComponentType.calendarEvent:
        return 'Calendar Event';
      case UIComponentType.list:
        return 'List';
      case UIComponentType.card:
        return 'Card';
      case UIComponentType.taskList:
        return 'Task List';
    }
  }

  IconData get icon {
    switch (this) {
      case UIComponentType.note:
        return Icons.note;
      case UIComponentType.reminder:
        return Icons.alarm;
      case UIComponentType.calendarEvent:
        return Icons.event;
      case UIComponentType.list:
        return Icons.list;
      case UIComponentType.card:
        return Icons.card_membership;
      case UIComponentType.taskList:
        return Icons.check_box;
    }
  }
}
