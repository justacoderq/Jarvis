import 'dart:convert';

import 'package:http/http.dart' as http;

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

class SuiteBackendService {
  final String jarvisMotionBaseUrl;

  SuiteBackendService({
    required this.jarvisMotionBaseUrl,
  });

  Uri _uri(String baseUrl, String path) {
    final normalized =
        baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    return Uri.parse('$normalized$path');
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
      throw Exception(
        data['error']?.toString() ?? 'Failed to generate learning-coach break',
      );
    }

    final steps =
        (data['steps'] as List? ?? const []).map((step) => step.toString()).toList();
    return JiggleMicroBreak(
      title: data['title']?.toString() ?? 'Learning Coach Break',
      summary: data['summary']?.toString() ?? 'Take a short guided reset.',
      steps: steps,
      minutes: (data['minutes'] as num?)?.toInt() ?? minutes,
      mode: data['mode']?.toString() ?? 'coach',
    );
  }
}
