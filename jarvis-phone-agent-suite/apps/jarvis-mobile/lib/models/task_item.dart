/// Model for an individual task item
class TaskItem {
  final String id;
  final String description;
  bool isCompleted;

  TaskItem({
    required this.id,
    required this.description,
    this.isCompleted = false,
  });

  /// Create a copy with updated completion status
  TaskItem copyWith({bool? isCompleted}) {
    return TaskItem(
      id: id,
      description: description,
      isCompleted: isCompleted ?? this.isCompleted,
    );
  }

  /// Convert to/from map for storage
  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'description': description,
      'isCompleted': isCompleted,
    };
  }

  factory TaskItem.fromMap(Map<String, dynamic> map) {
    return TaskItem(
      id: map['id'] as String,
      description: map['description'] as String,
      isCompleted: map['isCompleted'] as bool? ?? false,
    );
  }
}
