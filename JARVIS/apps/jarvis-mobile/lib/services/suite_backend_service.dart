import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

enum SuiteExecutionMode { jarvisAgent, jarvisControl }

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
  final String urgency;
  final String reason;
  final bool safeToAct;
  final String targetPackage;
  final String executionStatus;
  final String verification;

  const NotificationTriageEntry({
    required this.timestamp,
    required this.packageName,
    required this.title,
    required this.action,
    required this.urgency,
    required this.reason,
    required this.safeToAct,
    required this.targetPackage,
    required this.executionStatus,
    required this.verification,
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
  final String jarvisAgentBaseUrl;
  final String jarvisControlBaseUrl;
  final String jarvisMotionBaseUrl;

  SuiteBackendService({
    required this.jarvisAgentBaseUrl,
    required this.jarvisControlBaseUrl,
    required this.jarvisMotionBaseUrl,
  });

  Uri _uri(String baseUrl, String path) {
    final normalized = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    return Uri.parse('$normalized$path');
  }

  Future<BackendHealth> checkJarvisAgentHealth() async {
    try {
      final response = await http.get(_uri(jarvisAgentBaseUrl, '/health')).timeout(const Duration(seconds: 3));
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

  Future<BackendHealth> checkJarvisControlHealth() async {
    try {
      final response = await http.get(_uri(jarvisControlBaseUrl, '/api/suite/health')).timeout(const Duration(seconds: 3));
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

  Future<SuiteCommandResult> executeJarvisAgentCommand(String prompt) async {
    try {
      final response = await http.post(
        _uri(jarvisAgentBaseUrl, '/command'),
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

  Future<SuiteCommandResult> executeJarvisControlGoal(String goal) async {
    try {
      final response = await http.post(
        _uri(jarvisControlBaseUrl, '/api/suite/execute'),
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

  Future<bool> releaseJarvisAgentLock() async {
    try {
      final response = await http.post(_uri(jarvisAgentBaseUrl, '/lock/release')).timeout(const Duration(seconds: 5));
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<bool> startJarvisAgentNotificationWatcher() async {
    try {
      final response = await http.post(
        _uri(jarvisAgentBaseUrl, '/notifications/start'),
      ).timeout(const Duration(seconds: 5));
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<bool> addJarvisAgentWhitelistPackage(String packageName) async {
    try {
      final response = await http.post(
        _uri(jarvisAgentBaseUrl, '/filter/whitelist/add'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'package': packageName}),
      ).timeout(const Duration(seconds: 5));
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<bool> ensureJarvisAgentNotificationWatcher({
    List<String> defaultPackages = const [],
  }) async {
    for (final packageName in defaultPackages) {
      await addJarvisAgentWhitelistPackage(packageName);
    }

    return startJarvisAgentNotificationWatcher();
  }

  Future<NotificationWatcherStatus> getJarvisAgentNotificationStatus() async {
    final response = await http
        .get(_uri(jarvisAgentBaseUrl, '/notifications/status'))
        .timeout(const Duration(seconds: 5));
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return NotificationWatcherStatus(
      running: data['running'] == true,
      queueLength: (data['queueLength'] as num?)?.toInt() ?? 0,
      filterCount: (data['filterCount'] as num?)?.toInt() ?? 0,
    );
  }

  Future<List<NotificationTriageEntry>> getJarvisAgentNotificationLog() async {
    final response = await http
        .get(_uri(jarvisAgentBaseUrl, '/notifications/log'))
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
        urgency: map['urgency']?.toString() ?? 'unknown',
        reason: map['reason']?.toString() ?? '',
        safeToAct: map['safeToAct'] == true,
        targetPackage: map['targetPackage']?.toString() ?? '',
        executionStatus: map['executionStatus']?.toString() ?? 'not_run',
        verification: map['verification']?.toString() ?? '',
      );
    }).toList();
  }

  Future<SchedulerStatus> getJarvisAgentSchedulerStatus() async {
    final response = await http
        .get(_uri(jarvisAgentBaseUrl, '/scheduler/status'))
        .timeout(const Duration(seconds: 5));
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return SchedulerStatus(
      running: data['running'] == true,
      taskCount: (data['taskCount'] as num?)?.toInt() ?? 0,
    );
  }

  Future<List<SchedulerLogEntry>> getJarvisAgentSchedulerLog() async {
    final response = await http
        .get(_uri(jarvisAgentBaseUrl, '/scheduler/log'))
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

  Future<JiggleMicroBreak> generateJarvisMotionBreak({
    required String prompt,
    int minutes = 3,
  }) async {
    final response = await http
        .post(
          _uri(jarvisMotionBaseUrl, '/api/productivity/microbreak'),
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
    final jarvisAgent = await checkJarvisAgentHealth();
    final jarvisControl = await checkJarvisControlHealth();

    return [
      'InboxOps: ${jarvisAgent.ok ? 'online' : 'offline'} (${jarvisAgent.detail})',
      'TaskRunner: ${jarvisControl.ok ? 'ready' : 'offline'} (${jarvisControl.detail})',
    ].join('\n');
  }
}
