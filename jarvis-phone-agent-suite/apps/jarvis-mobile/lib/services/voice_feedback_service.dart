import 'package:flutter_tts/flutter_tts.dart';

class VoiceFeedbackService {
  final FlutterTts _tts = FlutterTts();
  bool _initialized = false;
  bool _available = false;

  Future<void> initialize() async {
    if (_initialized) {
      return;
    }

    _initialized = true;

    try {
      await _tts.setLanguage('en-US');
      await _tts.setSpeechRate(0.48);
      await _tts.setPitch(0.96);
      await _tts.awaitSpeakCompletion(true);
      _available = true;
    } catch (_) {
      _available = false;
    }
  }

  Future<void> speak(String text) async {
    if (!_initialized) {
      await initialize();
    }

    if (!_available) {
      return;
    }

    final normalized = text.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (normalized.isEmpty) {
      return;
    }

    final truncated = normalized.length > 280
        ? '${normalized.substring(0, 277)}...'
        : normalized;

    await _tts.stop();
    await _tts.speak(truncated);
  }

  Future<void> stop() async {
    if (_available) {
      await _tts.stop();
    }
  }

  Future<void> dispose() async {
    await stop();
  }
}
