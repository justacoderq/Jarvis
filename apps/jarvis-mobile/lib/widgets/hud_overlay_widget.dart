import 'package:flutter/material.dart';
import '../models/ui_component.dart';

/// HUD-style overlay widget for displaying components
class HUDOverlayWidget extends StatelessWidget {
  final UIComponent component;
  final VoidCallback? onDismiss;

  const HUDOverlayWidget({
    super.key,
    required this.component,
    this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.85),
          border: Border.all(
            color: _getTypeColor().withOpacity(0.6),
            width: 1.5,
          ),
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: _getTypeColor().withOpacity(0.3),
              blurRadius: 15,
              spreadRadius: 1,
            ),
          ],
        ),
        child: Stack(
          children: [
            // Accent line on the left
            Positioned(
              left: 0,
              top: 0,
              bottom: 0,
              child: Container(
                width: 4,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      _getTypeColor(),
                      _getTypeColor().withOpacity(0.3),
                    ],
                  ),
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(12),
                    bottomLeft: Radius.circular(12),
                  ),
                ),
              ),
            ),

            // Content
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 40, 12),
              child: _buildComponentContent(context),
            ),

            // Close button
            if (onDismiss != null)
              Positioned(
                top: 4,
                right: 4,
                child: IconButton(
                  icon: Icon(
                    Icons.close,
                    size: 18,
                    color: _getTypeColor(),
                  ),
                  onPressed: onDismiss,
                  tooltip: 'Dismiss',
                ),
              ),

            // Type indicator
            Positioned(
              top: 8,
              right: 36,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: _getTypeColor().withOpacity(0.2),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(
                    color: _getTypeColor().withOpacity(0.4),
                    width: 0.5,
                  ),
                ),
                child: Text(
                  component.type.displayName.toUpperCase(),
                  style: TextStyle(
                    color: _getTypeColor(),
                    fontSize: 9,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1.2,
                  ),
                ),
              ),
            ),
          ],
        ),
    );
  }

  Widget _buildComponentContent(BuildContext context) {
    switch (component.type) {
      case UIComponentType.note:
        return _buildNoteContent();
      case UIComponentType.reminder:
        return _buildReminderContent();
      case UIComponentType.calendarEvent:
        return _buildCalendarEventContent();
      case UIComponentType.list:
        return _buildListContent();
      case UIComponentType.card:
        return _buildCardContent();
      case UIComponentType.taskList:
        return _buildTaskListContent();
    }
  }

  Widget _buildNoteContent() {
    final title = component.data['title'] as String? ?? 'Note';
    final content = component.data['content'] as String? ?? '';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Icon(
              Icons.note_outlined,
              color: _getTypeColor(),
              size: 20,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                title,
                style: TextStyle(
                  color: _getTypeColor(),
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          content,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 13,
            height: 1.4,
          ),
        ),
      ],
    );
  }

  Widget _buildReminderContent() {
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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Icon(
              Icons.alarm,
              color: _getTypeColor(),
              size: 20,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                title,
                style: TextStyle(
                  color: _getTypeColor(),
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ],
        ),
        if (time != null) ...[
          const SizedBox(height: 6),
          Row(
            children: [
              Icon(
                Icons.access_time,
                size: 14,
                color: Colors.white.withOpacity(0.7),
              ),
              const SizedBox(width: 4),
              Text(
                _formatDateTime(time),
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.white.withOpacity(0.7),
                  fontFamily: 'monospace',
                ),
              ),
            ],
          ),
        ],
        if (description != null && description.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            description,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              height: 1.4,
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildCalendarEventContent() {
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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Icon(
              Icons.event,
              color: _getTypeColor(),
              size: 20,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                title,
                style: TextStyle(
                  color: _getTypeColor(),
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ],
        ),
        if (startTime != null) ...[
          const SizedBox(height: 6),
          Row(
            children: [
              Icon(
                Icons.access_time,
                size: 14,
                color: Colors.white.withOpacity(0.7),
              ),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  endTime != null
                      ? '${_formatDateTime(startTime)} - ${_formatDateTime(endTime)}'
                      : _formatDateTime(startTime),
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.white.withOpacity(0.7),
                    fontFamily: 'monospace',
                  ),
                ),
              ),
            ],
          ),
        ],
        if (description != null && description.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            description,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              height: 1.4,
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildListContent() {
    final title = component.data['title'] as String? ?? 'List';
    final items = (component.data['items'] as List?)?.cast<String>() ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Icon(
              Icons.list_alt,
              color: _getTypeColor(),
              size: 20,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                title,
                style: TextStyle(
                  color: _getTypeColor(),
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ...items.take(5).map((item) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '▸ ',
                    style: TextStyle(
                      color: _getTypeColor(),
                      fontSize: 14,
                    ),
                  ),
                  Expanded(
                    child: Text(
                      item,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            )),
        if (items.length > 5)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              '+ ${items.length - 5} more items',
              style: TextStyle(
                color: Colors.white.withOpacity(0.5),
                fontSize: 11,
                fontStyle: FontStyle.italic,
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildCardContent() {
    final title = component.data['title'] as String? ?? 'Card';
    final subtitle = component.data['subtitle'] as String?;
    final content = component.data['content'] as String?;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Icon(
              Icons.info_outline,
              color: _getTypeColor(),
              size: 20,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: _getTypeColor(),
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.5,
                    ),
                  ),
                  if (subtitle != null && subtitle.isNotEmpty)
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.white.withOpacity(0.6),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
        if (content != null && content.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(
            content,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              height: 1.4,
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildTaskListContent() {
    final title = component.data['title'] as String? ?? 'Mission Tasks';
    final tasks = component.tasks;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Icon(
              Icons.check_box_outlined,
              color: _getTypeColor(),
              size: 20,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                title,
                style: TextStyle(
                  color: _getTypeColor(),
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ...tasks.asMap().entries.map((entry) {
          final index = entry.key;
          final task = entry.value;

          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 18,
                  height: 18,
                  margin: const EdgeInsets.only(top: 1),
                  decoration: BoxDecoration(
                    border: Border.all(
                      color: task.isCompleted
                          ? _getTypeColor()
                          : Colors.white.withOpacity(0.4),
                      width: 1.5,
                    ),
                    borderRadius: BorderRadius.circular(3),
                    color: task.isCompleted
                        ? _getTypeColor().withOpacity(0.2)
                        : Colors.transparent,
                  ),
                  child: task.isCompleted
                      ? Icon(
                          Icons.check,
                          size: 14,
                          color: _getTypeColor(),
                        )
                      : null,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '${index + 1}. ${task.description}',
                    style: TextStyle(
                      color: task.isCompleted
                          ? Colors.white.withOpacity(0.5)
                          : Colors.white,
                      fontSize: 13,
                      height: 1.4,
                      decoration: task.isCompleted
                          ? TextDecoration.lineThrough
                          : null,
                    ),
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ],
    );
  }

  Color _getTypeColor() {
    switch (component.type) {
      case UIComponentType.note:
        return Colors.amberAccent;
      case UIComponentType.reminder:
        return Colors.redAccent;
      case UIComponentType.calendarEvent:
        return Colors.blueAccent;
      case UIComponentType.list:
        return Colors.greenAccent;
      case UIComponentType.card:
        return Colors.purpleAccent;
      case UIComponentType.taskList:
        return Colors.tealAccent;
    }
  }

  double _getPositionOffset() {
    // This would be calculated based on the component's index
    // For now, return 0 as the position will be handled by the parent
    return 0;
  }

  String _formatDateTime(DateTime dateTime) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final date = DateTime(dateTime.year, dateTime.month, dateTime.day);

    String dateStr;
    if (date == today) {
      dateStr = 'TODAY';
    } else if (date == today.add(const Duration(days: 1))) {
      dateStr = 'TOMORROW';
    } else if (date == today.subtract(const Duration(days: 1))) {
      dateStr = 'YESTERDAY';
    } else {
      dateStr = '${dateTime.month.toString().padLeft(2, '0')}/${dateTime.day.toString().padLeft(2, '0')}';
    }

    final hour = dateTime.hour > 12 ? dateTime.hour - 12 : (dateTime.hour == 0 ? 12 : dateTime.hour);
    final period = dateTime.hour >= 12 ? 'PM' : 'AM';
    final minute = dateTime.minute.toString().padLeft(2, '0');

    return '$dateStr $hour:$minute $period';
  }
}
