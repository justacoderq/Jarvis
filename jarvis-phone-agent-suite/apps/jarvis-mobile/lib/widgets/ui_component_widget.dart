import 'package:flutter/material.dart';
import '../models/ui_component.dart';

/// Widget that renders a UI component based on its type
class UIComponentWidget extends StatelessWidget {
  final UIComponent component;
  final VoidCallback? onDismiss;

  const UIComponentWidget({
    super.key,
    required this.component,
    this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 4,
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Stack(
        children: [
          _buildComponentContent(context),
          // Dismiss button
          if (onDismiss != null)
            Positioned(
              top: 4,
              right: 4,
              child: IconButton(
                icon: const Icon(Icons.close, size: 20),
                onPressed: onDismiss,
                tooltip: 'Dismiss',
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildComponentContent(BuildContext context) {
    switch (component.type) {
      case UIComponentType.note:
        return _buildNoteComponent(context);
      case UIComponentType.reminder:
        return _buildReminderComponent(context);
      case UIComponentType.calendarEvent:
        return _buildCalendarEventComponent(context);
      case UIComponentType.list:
        return _buildListComponent(context);
      case UIComponentType.card:
        return _buildCardComponent(context);
    }
  }

  Widget _buildNoteComponent(BuildContext context) {
    final title = component.data['title'] as String? ?? 'Note';
    final content = component.data['content'] as String? ?? '';

    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Icon(Icons.note, color: Colors.amber.shade700),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(width: 32), // Space for close button
            ],
          ),
          const SizedBox(height: 8),
          Text(
            content,
            style: const TextStyle(fontSize: 14),
          ),
        ],
      ),
    );
  }

  Widget _buildReminderComponent(BuildContext context) {
    final title = component.data['title'] as String? ?? 'Reminder';
    final timeStr = component.data['time'] as String?;
    final description = component.data['description'] as String?;

    DateTime? time;
    if (timeStr != null) {
      try {
        time = DateTime.parse(timeStr);
      } catch (e) {
        // Invalid time format
      }
    }

    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Icon(Icons.alarm, color: Colors.red.shade700),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(width: 32), // Space for close button
            ],
          ),
          if (time != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.access_time, size: 16),
                const SizedBox(width: 4),
                Text(
                  _formatDateTime(time),
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey.shade700,
                  ),
                ),
              ],
            ),
          ],
          if (description != null && description.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              description,
              style: const TextStyle(fontSize: 14),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildCalendarEventComponent(BuildContext context) {
    final title = component.data['title'] as String? ?? 'Event';
    final startTimeStr = component.data['startTime'] as String?;
    final endTimeStr = component.data['endTime'] as String?;
    final description = component.data['description'] as String?;

    DateTime? startTime;
    DateTime? endTime;

    if (startTimeStr != null) {
      try {
        startTime = DateTime.parse(startTimeStr);
      } catch (e) {
        // Invalid time format
      }
    }

    if (endTimeStr != null) {
      try {
        endTime = DateTime.parse(endTimeStr);
      } catch (e) {
        // Invalid time format
      }
    }

    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Icon(Icons.event, color: Colors.blue.shade700),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(width: 32), // Space for close button
            ],
          ),
          if (startTime != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.access_time, size: 16),
                const SizedBox(width: 4),
                Text(
                  endTime != null
                      ? '${_formatDateTime(startTime)} - ${_formatDateTime(endTime)}'
                      : _formatDateTime(startTime),
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey.shade700,
                  ),
                ),
              ],
            ),
          ],
          if (description != null && description.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              description,
              style: const TextStyle(fontSize: 14),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildListComponent(BuildContext context) {
    final title = component.data['title'] as String? ?? 'List';
    final items = (component.data['items'] as List?)?.cast<String>() ?? [];

    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Icon(Icons.list, color: Colors.green.shade700),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(width: 32), // Space for close button
            ],
          ),
          const SizedBox(height: 8),
          ...items.map((item) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('• ', style: TextStyle(fontSize: 16)),
                    Expanded(
                      child: Text(
                        item,
                        style: const TextStyle(fontSize: 14),
                      ),
                    ),
                  ],
                ),
              )),
        ],
      ),
    );
  }

  Widget _buildCardComponent(BuildContext context) {
    final title = component.data['title'] as String? ?? 'Card';
    final subtitle = component.data['subtitle'] as String?;
    final content = component.data['content'] as String?;
    final iconCode = component.data['icon'] as int?;

    IconData? icon;
    if (iconCode != null) {
      icon = IconData(iconCode, fontFamily: 'MaterialIcons');
    }

    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              if (icon != null) ...[
                Icon(icon, color: Colors.purple.shade700),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    if (subtitle != null && subtitle.isNotEmpty)
                      Text(
                        subtitle,
                        style: TextStyle(
                          fontSize: 14,
                          color: Colors.grey.shade600,
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 32), // Space for close button
            ],
          ),
          if (content != null && content.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              content,
              style: const TextStyle(fontSize: 14),
            ),
          ],
        ],
      ),
    );
  }

  String _formatDateTime(DateTime dateTime) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final date = DateTime(dateTime.year, dateTime.month, dateTime.day);

    String dateStr;
    if (date == today) {
      dateStr = 'Today';
    } else if (date == today.add(const Duration(days: 1))) {
      dateStr = 'Tomorrow';
    } else if (date == today.subtract(const Duration(days: 1))) {
      dateStr = 'Yesterday';
    } else {
      dateStr = '${dateTime.month}/${dateTime.day}/${dateTime.year}';
    }

    final hour = dateTime.hour > 12 ? dateTime.hour - 12 : dateTime.hour;
    final period = dateTime.hour >= 12 ? 'PM' : 'AM';
    final minute = dateTime.minute.toString().padLeft(2, '0');

    return '$dateStr at $hour:$minute $period';
  }
}
