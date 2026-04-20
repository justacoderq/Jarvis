import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

enum SuiteExecutionMode { siri2, phonePilot }

class NotificationWatcherStatus {
  final bool running;
  final int queueLength;
  final int filterCount;

  const NotificationWatcherStatus({
    required this.running,
    required this.queueLength,
    required this.filterCount,
  });
}

class NotificationTriageEntry {
  final DateTime timestamp;
  final String packageName;
  final String title;
  final String action;
  final String reason;

  const NotificationTriageEntry({
    required this.timestamp,
    required this.packageName,
    required this.title,
    required this.action,
    required this.reason,
  });
}

class SchedulerStatus {
  final bool running;
  final int taskCount;

  const SchedulerStatus({
    required this.running,
    required this.taskCount,
  });
}

class SchedulerLogEntry {
  final DateTime timestamp;
  final String taskName;
  final bool success;
  final int turns;
  final String result;

  const SchedulerLogEntry({
    required this.timestamp,
    required this.taskName,
    required this.success,
    required this.turns,
    required this.result,
  });
}

class JiggleMicroBreak {
  final String title;
  final String summary;
  final List<String> steps;
  final int minutes;
  final String mode;

  const JiggleMicroBreak({
    required this.title,
    required this.summary,
    required this.steps,
    required this.minutes,
    required this.mode,
  });
}

class BackendHealth {
  final bool ok;
  final String label;
  final String detail;

  const BackendHealth({
    required this.ok,
    required this.label,
    required this.detail,
  });
}

class SuiteCommandResult {
  final bool success;
  final String message;
  final String source;

  const SuiteCommandResult({
    required this.success,
    required this.message,
    required this.source,
  });
}

class SuiteBackendService {
  final String siri2BaseUrl;
  final String phonePilotBaseUrl;
  final String jiggleWiggleBaseUrl;

  SuiteBackendService({
    required this.siri2BaseUrl,
    required this.phonePilotBaseUrl,
    required this.jiggleWiggleBaseUrl,
  });

  Uri _uri(String baseUrl, String path) {
    final normalized = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    return Uri.parse('$normalized$path');
  }

  Future<BackendHealth> checkSiri2Health() async {
    try {
      final response = await http.get(_uri(siri2BaseUrl, '/health')).timeout(const Duration(seconds: 3));
      if (response.statusCode == 200) {
        return const BackendHealth(
          ok: true,
          label: 'INBOXOPS ONLINE',
          detail: 'Notification and command engine reachable',
        );
      }
      return BackendHealth(
        ok: false,
        label: 'INBOXOPS ERROR',
        detail: 'HTTP ${response.statusCode}',
      );
    } catch (e) {
      return BackendHealth(
        ok: false,
        label: 'INBOXOPS OFFLINE',
        detail: e.toString(),
      );
    }
  }

  Future<BackendHealth> checkPhonePilotHealth() async {
    try {
      final response = await http.get(_uri(phonePilotBaseUrl, '/api/suite/health')).timeout(const Duration(seconds: 3));
      if (response.statusCode == 200) {
        return const BackendHealth(
          ok: true,
          label: 'TASKRUNNER READY',
          detail: 'ADB workflow executor reachable',
        );
      }
      return BackendHealth(
        ok: false,
        label: 'TASKRUNNER ERROR',
        detail: 'HTTP ${response.statusCode}',
      );
    } catch (e) {
      return BackendHealth(
        ok: false,
        label: 'TASKRUNNER OFFLINE',
        detail: e.toString(),
      );
    }
  }

  Future<SuiteCommandResult> executeSiri2Command(String prompt) async {
    try {
      final response = await http.post(
        _uri(siri2BaseUrl, '/command'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'prompt': prompt}),
      ).timeout(const Duration(minutes: 5));

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode == 200) {
        return SuiteCommandResult(
          success: true,
          message: data['result']?.toString() ?? 'Command completed.',
          source: 'InboxOps',
        );
      }

      return SuiteCommandResult(
        success: false,
        message: data['error']?.toString() ?? 'InboxOps command failed.',
        source: 'InboxOps',
      );
    } catch (e) {
      return SuiteCommandResult(
        success: false,
        message: e.toString(),
        source: 'InboxOps',
      );
    }
  }

  Future<SuiteCommandResult> executePhonePilotGoal(String goal) async {
    try {
      final response = await http.post(
        _uri(phonePilotBaseUrl, '/api/suite/execute'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'goal': goal, 'maxSteps': 18}),
      ).timeout(const Duration(minutes: 5));

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode == 200 && data['success'] == true) {
        return SuiteCommandResult(
          success: true,
          message: data['summary']?.toString() ?? 'Goal executed.',
          source: 'TaskRunner',
        );
      }

      final nestedResult = data['result'];
      String? nestedError;
      if (nestedResult is Map<String, dynamic>) {
        nestedError = nestedResult['error']?.toString() ??
            nestedResult['summary']?.toString();
      }

      return SuiteCommandResult(
        success: false,
        message: data['error']?.toString() ??
            nestedError ??
            data['summary']?.toString() ??
            'TaskRunner goal failed.',
        source: 'TaskRunner',
      );
    } catch (e) {
      return SuiteCommandResult(
        success: false,
        message: e.toString(),
        source: 'TaskRunner',
      );
    }
  }

  Future<bool> releaseSiri2Lock() async {
    try {
      final response = await http.post(_uri(siri2BaseUrl, '/lock/release')).timeout(const Duration(seconds: 5));
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<bool> startSiri2NotificationWatcher() async {
    try {
      final response = await http.post(
        _uri(siri2BaseUrl, '/notifications/start'),
      ).timeout(const Duration(seconds: 5));
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<bool> addSiri2WhitelistPackage(String packageName) async {
    try {
      final response = await http.post(
        _uri(siri2BaseUrl, '/filter/whitelist/add'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'package': packageName}),
      ).timeout(const Duration(seconds: 5));
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<bool> ensureSiri2NotificationWatcher({
    List<String> defaultPackages = const [],
  }) async {
    for (final packageName in defaultPackages) {
      await addSiri2WhitelistPackage(packageName);
    }

    return startSiri2NotificationWatcher();
  }

  Future<NotificationWatcherStatus> getSiri2NotificationStatus() async {
    final response = await http
        .get(_uri(siri2BaseUrl, '/notifications/status'))
        .timeout(const Duration(seconds: 5));
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return NotificationWatcherStatus(
      running: data['running'] == true,
      queueLength: (data['queueLength'] as num?)?.toInt() ?? 0,
      filterCount: (data['filterCount'] as num?)?.toInt() ?? 0,
    );
  }

  Future<List<NotificationTriageEntry>> getSiri2NotificationLog() async {
    final response = await http
        .get(_uri(siri2BaseUrl, '/notifications/log'))
        .timeout(const Duration(seconds: 5));
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    final log = (data['log'] as List? ?? const []);
    return log.map((entry) {
      final map = entry as Map<String, dynamic>;
      return NotificationTriageEntry(
        timestamp: DateTime.fromMillisecondsSinceEpoch(
          (map['timestamp'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch,
        ),
        packageName: map['packageName']?.toString() ?? 'unknown',
        title: map['title']?.toString() ?? 'Untitled notification',
        action: map['action']?.toString() ?? 'unknown',
        reason: map['reason']?.toString() ?? '',
      );
    }).toList();
  }

  Future<SchedulerStatus> getSiri2SchedulerStatus() async {
    final response = await http
        .get(_uri(siri2BaseUrl, '/scheduler/status'))
        .timeout(const Duration(seconds: 5));
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return SchedulerStatus(
      running: data['running'] == true,
      taskCount: (data['taskCount'] as num?)?.toInt() ?? 0,
    );
  }

  Future<List<SchedulerLogEntry>> getSiri2SchedulerLog() async {
    final response = await http
        .get(_uri(siri2BaseUrl, '/scheduler/log'))
        .timeout(const Duration(seconds: 5));
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    final log = (data['log'] as List? ?? const []);
    return log.map((entry) {
      final map = entry as Map<String, dynamic>;
      final timestampValue = map['timestamp']?.toString();
      return SchedulerLogEntry(
        timestamp: DateTime.tryParse(timestampValue ?? '') ?? DateTime.now(),
        taskName: map['taskName']?.toString() ?? 'Unnamed task',
        success: map['success'] == true,
        turns: (map['turns'] as num?)?.toInt() ?? 0,
        result: map['result']?.toString() ?? '',
      );
    }).toList();
  }

  Future<JiggleMicroBreak> generateJiggleMicroBreak({
    required String prompt,
    int minutes = 3,
  }) async {
    final response = await http
        .post(
          _uri(jiggleWiggleBaseUrl, '/api/productivity/microbreak'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'prompt': prompt,
            'minutes': minutes,
          }),
        )
        .timeout(const Duration(seconds: 20));

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      throw Exception(data['error']?.toString() ?? 'Failed to generate micro-break');
    }

    final steps = (data['steps'] as List? ?? const [])
        .map((step) => step.toString())
        .toList();
    return JiggleMicroBreak(
      title: data['title']?.toString() ?? 'Micro-break',
      summary: data['summary']?.toString() ?? 'Take a short recovery break.',
      steps: steps,
      minutes: (data['minutes'] as num?)?.toInt() ?? minutes,
      mode: data['mode']?.toString() ?? 'gym',
    );
  }

  Future<String> getSuiteStatusSummary() async {
    final siri2 = await checkSiri2Health();
    final phonePilot = await checkPhonePilotHealth();

    return [
      'InboxOps: ${siri2.ok ? 'online' : 'offline'} (${siri2.detail})',
      'TaskRunner: ${phonePilot.ok ? 'ready' : 'offline'} (${phonePilot.detail})',
    ].join('\n');
  }
}
