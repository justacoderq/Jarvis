import 'dart:async';
import 'dart:convert';

import 'package:porcupine_flutter/porcupine.dart';
import 'package:porcupine_flutter/porcupine_error.dart';
import 'package:porcupine_flutter/porcupine_manager.dart';
import 'package:vosk_flutter/vosk_flutter.dart';

enum WakeWordMode {
  porcupine,
  vosk,
  pushToTalk,
}

class WakeWordService {
  static const _voskModelAsset = 'assets/models/vosk-model-small-en-us-0.15.zip';
  static const _wakeGrammar = <String>[
    'jarvis',
    'hey jarvis',
    'jarvis productivity update',
    'hey jarvis productivity update',
  ];
  static const _wakePhrases = <String>['jarvis', 'hey jarvis'];
  static const _productivityPhrases = <String>[
    'jarvis productivity update',
    'hey jarvis productivity update',
  ];

  WakeWordService({
    required String accessKey,
    required Function() onWakeWordDetected,
    Function(String command)? onVoiceCommandDetected,
  })  : _accessKey = accessKey,
        _onWakeWordDetected = onWakeWordDetected,
        _onVoiceCommandDetected = onVoiceCommandDetected;

  final String _accessKey;
  final Function() _onWakeWordDetected;
  final Function(String command)? _onVoiceCommandDetected;

  final VoskFlutterPlugin _vosk = VoskFlutterPlugin.instance();
  final ModelLoader _modelLoader = ModelLoader();

  PorcupineManager? _porcupineManager;
  Model? _voskModel;
  Recognizer? _voskRecognizer;
  SpeechService? _voskSpeechService;
  StreamSubscription<String>? _voskPartialSubscription;
  StreamSubscription<String>? _voskResultSubscription;

  bool _isListening = false;
  bool _isStarting = false;
  WakeWordMode _mode = WakeWordMode.pushToTalk;
  DateTime? _lastWakeAt;

  Future<void> initialize() async {
    if (_accessKey.trim().isEmpty) {
      await _initializeVoskFallback();
      return;
    }

    try {
      print('Initializing wake word detection...');
      print('Access key length: ${_accessKey.length}');

      _porcupineManager = await PorcupineManager.fromBuiltInKeywords(
        _accessKey,
        [BuiltInKeyword.JARVIS],
        _wakeWordCallback,
      );
      _mode = WakeWordMode.porcupine;

      print('Wake word detection initialized successfully');
    } on PorcupineException catch (e) {
      print('Failed to initialize wake word detection: ${e.runtimeType}');
      print('Error message: $e');
      print('Error details: ${e.toString()}');
      await _initializeVoskFallback();
    } catch (e) {
      print('Unexpected error initializing wake word detection: $e');
      await _initializeVoskFallback();
    }
  }

  Future<void> _initializeVoskFallback() async {
    try {
      print('Initializing Vosk wake-word fallback...');
      final modelPath = await _modelLoader.loadFromAssets(_voskModelAsset);
      _voskModel = await _vosk.createModel(modelPath);
      _voskRecognizer = await _vosk.createRecognizer(
        model: _voskModel!,
        sampleRate: 16000,
        grammar: _wakeGrammar,
      );
      _voskSpeechService = await _vosk.initSpeechService(_voskRecognizer!);
      _voskPartialSubscription = _voskSpeechService!.onPartial().listen(
        _handleVoskResult,
      );
      _voskResultSubscription = _voskSpeechService!.onResult().listen(
        _handleVoskResult,
      );
      _mode = WakeWordMode.vosk;
      print('Vosk wake-word fallback initialized successfully');
    } catch (e) {
      _mode = WakeWordMode.pushToTalk;
      print('Vosk wake-word fallback failed: $e');
      print('Using push-to-talk fallback');
    }
  }

  Future<void> start() async {
    if (_mode == WakeWordMode.pushToTalk) {
      _isListening = false;
      print('Wake word engine unavailable - push-to-talk mode active');
      return;
    }

    if (_mode == WakeWordMode.vosk) {
      if (_voskSpeechService == null || _voskRecognizer == null) {
        print('Vosk wake-word service not initialized');
        return;
      }
      if (_isListening || _isStarting) {
        return;
      }

      _isStarting = true;
      try {
        await _voskRecognizer!.reset();
        await _voskSpeechService!.start(
          onRecognitionError: (Object error) {
            print('Vosk recognition error: $error');
            _isListening = false;
            _isStarting = false;
          },
        );
        _isListening = true;
        print('Started Vosk wake-word listening');
      } catch (e) {
        _isListening = false;
        print('Failed to start Vosk wake-word listening: $e');
      } finally {
        _isStarting = false;
      }
      return;
    }

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

  void _handleVoskResult(String payload) {
    final transcript = _extractTranscript(payload);
    if (transcript.isEmpty) {
      return;
    }

    final productivityMatch = _productivityPhrases.any(transcript.contains);
    if (productivityMatch) {
      final now = DateTime.now();
      if (_lastWakeAt != null &&
          now.difference(_lastWakeAt!) < const Duration(seconds: 3)) {
        return;
      }
      _lastWakeAt = now;
      print('Vosk voice command detected: $transcript');
      unawaited(stop());
      _onVoiceCommandDetected?.call('productivity_update');
      return;
    }

    final now = DateTime.now();
    if (_lastWakeAt != null &&
        now.difference(_lastWakeAt!) < const Duration(seconds: 3)) {
      return;
    }

    final matched = _wakePhrases.any(transcript.contains);
    if (!matched) {
      return;
    }

    _lastWakeAt = now;
    print('Vosk wake phrase detected: $transcript');
    unawaited(stop());
    _onWakeWordDetected();
  }

  String _extractTranscript(String payload) {
    try {
      final decoded = jsonDecode(payload);
      if (decoded is! Map) {
        return payload.toLowerCase().trim();
      }

      final partial = decoded['partial']?.toString().toLowerCase().trim() ?? '';
      final text = decoded['text']?.toString().toLowerCase().trim() ?? '';
      return partial.isNotEmpty ? partial : text;
    } catch (_) {
      return payload.toLowerCase().trim();
    }
  }

  Future<void> stop() async {
    if (_mode == WakeWordMode.vosk) {
      if (_voskSpeechService != null) {
        try {
          await _voskSpeechService!.stop();
        } catch (e) {
          print('Failed to stop Vosk wake-word listening: $e');
        }
      }
      _isListening = false;
      _isStarting = false;
      return;
    }

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

  void _wakeWordCallback(int keywordIndex) {
    print('Wake word detected! Index: $keywordIndex');
    _onWakeWordDetected();
  }

  bool get isListening => _isListening;
  bool get isAvailable => _mode == WakeWordMode.porcupine || _mode == WakeWordMode.vosk;
  WakeWordMode get mode => _mode;
  bool get speechFallbackArmed => _isListening && _mode == WakeWordMode.vosk;

  Future<void> dispose() async {
    try {
      await stop();
      await _voskPartialSubscription?.cancel();
      await _voskResultSubscription?.cancel();
      await _voskSpeechService?.dispose();
      await _voskRecognizer?.dispose();
      _voskModel?.dispose();
      await _porcupineManager?.delete();
      _porcupineManager = null;
      print('Wake word service disposed');
    } catch (e) {
      print('Error disposing wake word service: $e');
    }
  }
}
