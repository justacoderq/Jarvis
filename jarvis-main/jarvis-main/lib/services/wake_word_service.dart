import 'package:porcupine_flutter/porcupine.dart';
import 'package:porcupine_flutter/porcupine_manager.dart';
import 'package:porcupine_flutter/porcupine_error.dart';

/// Service for wake word detection using Porcupine
class WakeWordService {
  PorcupineManager? _porcupineManager;
  final String _accessKey;
  final Function() _onWakeWordDetected;
  bool _isListening = false;

  WakeWordService({
    required String accessKey,
    required Function() onWakeWordDetected,
  })  : _accessKey = accessKey,
        _onWakeWordDetected = onWakeWordDetected;

  /// Initialize wake word detection
  Future<void> initialize() async {
    try {
      print('Initializing wake word detection...');
      print('Access key length: ${_accessKey.length}');

      _porcupineManager = await PorcupineManager.fromBuiltInKeywords(
        _accessKey,
        [BuiltInKeyword.JARVIS], // Use the built-in "jarvis" wake word
        _wakeWordCallback,
      );

      print('Wake word detection initialized successfully');
    } on PorcupineException catch (e) {
      print('Failed to initialize wake word detection: ${e.runtimeType}');
      print('Error message: $e');
      print('Error details: ${e.toString()}');
      rethrow;
    } catch (e) {
      print('Unexpected error initializing wake word detection: $e');
      rethrow;
    }
  }

  /// Start listening for wake word
  Future<void> start() async {
    if (_porcupineManager == null) {
      print('Wake word manager not initialized');
      return;
    }

    if (_isListening) {
      print('Already listening for wake word');
      return;
    }

    try {
      await _porcupineManager?.start();
      _isListening = true;
      print('Started listening for wake word');
    } on PorcupineException catch (e) {
      print('Failed to start wake word detection: $e');
    }
  }

  /// Stop listening for wake word
  Future<void> stop() async {
    if (_porcupineManager == null || !_isListening) {
      return;
    }

    try {
      await _porcupineManager?.stop();
      _isListening = false;
      print('Stopped listening for wake word');
    } on PorcupineException catch (e) {
      print('Failed to stop wake word detection: $e');
    }
  }

  /// Wake word callback
  void _wakeWordCallback(int keywordIndex) {
    print('Wake word detected! Index: $keywordIndex');
    _onWakeWordDetected();
  }

  /// Check if currently listening
  bool get isListening => _isListening;

  /// Dispose of resources
  Future<void> dispose() async {
    try {
      await stop();
      await _porcupineManager?.delete();
      _porcupineManager = null;
      print('Wake word service disposed');
    } catch (e) {
      print('Error disposing wake word service: $e');
    }
  }
}
