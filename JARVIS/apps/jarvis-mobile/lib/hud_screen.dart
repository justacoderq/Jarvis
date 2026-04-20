import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:permission_handler/permission_handler.dart';
import 'services/gemini_live_service.dart';
import 'jarvis_motion_screen.dart';
import 'services/audio_recorder_service.dart';
import 'services/audio_player_service.dart';
import 'services/wake_word_service.dart';
import 'services/voice_feedback_service.dart';
import 'services/camera_frame_service.dart';
import 'services/vitals_service.dart';
import 'services/suite_backend_service.dart';
import 'models/ui_component.dart';
import 'models/vitals_data.dart';
import 'models/task_item.dart';
import 'widgets/hud_overlay_widget.dart';
import 'widgets/vitals_hud_widget.dart';
import 'widgets/waveform_visualizer.dart';
import 'dart:async';

/// Jarvis HUD Screen - Tony Stark style AR interface
class JarvisHUDScreen extends StatefulWidget {
  final String apiKey;
  final String picovoiceKey;
  final String jarvisAgentBaseUrl;
  final String jarvisControlBaseUrl;
  final String jarvisMotionBaseUrl;

  const JarvisHUDScreen({
    super.key,
    required this.apiKey,
    required this.picovoiceKey,
    required this.jarvisAgentBaseUrl,
    required this.jarvisControlBaseUrl,
    required this.jarvisMotionBaseUrl,
  });

  @override
  State<JarvisHUDScreen> createState() => _JarvisHUDScreenState();
}

class _JarvisHUDScreenState extends State<JarvisHUDScreen>
    with TickerProviderStateMixin {
  late GeminiLiveService _geminiService;
  late AudioRecorderService _audioRecorder;
  late AudioPlayerService _audioPlayer;
  late WakeWordService _wakeWordService;
  late VoiceFeedbackService _voiceFeedbackService;
  late CameraFrameService _cameraFrameService;
  late VitalsService _vitalsService;
  late SuiteBackendService _suiteBackendService;

  CameraController? _cameraController;
  List<CameraDescription>? _cameras;
  bool _isCameraInitialized = false;
  bool _isSharingCamera = false;

  final List<UIComponent> _uiComponents = [];
  final Map<String, AnimationController> _componentAnimations = {};

  bool _isConnected = false;
  bool _isRecording = false;
  bool _showTranscript = false;
  String _lastTranscript = '';
  int _componentIdCounter = 0;

  VitalsData? _currentVitals;
  double _currentAudioLevel = 0.0;

  Timer? _pulseTimer;
  Timer? _backendHealthTimer;
  Timer? _focusModeTimer;
  double _micPulse = 1.0;
  final TextEditingController _commandController = TextEditingController();
  BackendHealth _jarvisAgentHealth = const BackendHealth(ok: false, label: 'AGENT OFFLINE', detail: 'Not checked');
  BackendHealth _jarvisControlHealth = const BackendHealth(ok: false, label: 'CONTROL OFFLINE', detail: 'Not checked');
  SuiteExecutionMode _selectedMode = SuiteExecutionMode.jarvisAgent;
  bool _isExecutingBackendCommand = false;
  bool _wakeWordAvailable = false;
  bool _resumeWakeWordWhenPlaybackStops = false;
  bool _jarvisAgentBackgroundWorkersInitialized = false;
  NotificationWatcherStatus _notificationStatus = const NotificationWatcherStatus(
    running: false,
    queueLength: 0,
    filterCount: 0,
  );
  SchedulerStatus _schedulerStatus = const SchedulerStatus(
    running: false,
    taskCount: 0,
  );
  List<NotificationTriageEntry> _notificationEntries = const [];
  List<SchedulerLogEntry> _schedulerEntries = const [];
  bool _focusModeEnabled = false;
  DateTime? _focusModeStartedAt;
  JiggleMicroBreak? _recommendedMicroBreak;
  String _productivitySummary = 'No briefing generated yet.';
  int _demoNotificationIndex = 0;

  @override
  void initState() {
    super.initState();
    _initializeCamera();
    _initializeServices();
    _startPulseAnimation();
    _startBackendHealthPolling();
  }

  /// Initialize camera
  Future<void> _initializeCamera() async {
    try {
      final cameraStatus = await Permission.camera.request();
      if (!cameraStatus.isGranted) {
        print('Camera permission denied - using black background');
        return;
      }

      _cameras = await availableCameras();
      if (_cameras != null && _cameras!.isNotEmpty) {
        // Use back camera by default
        final camera = _cameras!.firstWhere(
          (cam) => cam.lensDirection == CameraLensDirection.back,
          orElse: () => _cameras!.first,
        );

        _cameraController = CameraController(
          camera,
          ResolutionPreset.high,
          enableAudio: false,
        );

        await _cameraController!.initialize();
        if (mounted) {
          setState(() {
            _isCameraInitialized = true;
          });
        }
        print('Camera initialized successfully');
      }
    } catch (e) {
      print('Error initializing camera: $e');
      print('Continuing without camera - using black background');
      // Continue without camera - the UI will show black background
      if (mounted) {
        setState(() {
          _isCameraInitialized = false;
        });
      }
    }
  }

  /// Initialize Gemini services
  void _initializeServices() {
    _geminiService = GeminiLiveService(apiKey: widget.apiKey);
    _audioRecorder = AudioRecorderService(_geminiService);
    _audioPlayer = AudioPlayerService(_geminiService);
    _cameraFrameService = CameraFrameService();
    _voiceFeedbackService = VoiceFeedbackService();
    _vitalsService = VitalsService();
    _suiteBackendService = SuiteBackendService(
      jarvisAgentBaseUrl: widget.jarvisAgentBaseUrl,
      jarvisControlBaseUrl: widget.jarvisControlBaseUrl,
      jarvisMotionBaseUrl: widget.jarvisMotionBaseUrl,
    );

    // Initialize wake word service
    _wakeWordService = WakeWordService(
      accessKey: widget.picovoiceKey,
      onWakeWordDetected: _onWakeWordDetected,
    );

    // Listen to vitals updates
    _vitalsService.vitalsStream.listen((vitals) {
      setState(() {
        _currentVitals = vitals;
      });
    });

    // Listen to audio level updates for waveform
    _audioRecorder.audioLevelStream.listen((level) {
      setState(() {
        _currentAudioLevel = level;
      });
    });

    // Start vitals monitoring
    _vitalsService.start();
    unawaited(_voiceFeedbackService.initialize());

    // Listen to text responses for transcript
    _geminiService.textOutputStream.listen((text) {
      setState(() {
        _lastTranscript = text;
        _showTranscript = true;
      });

      // Auto-hide transcript after 5 seconds
      Future.delayed(const Duration(seconds: 5), () {
        if (mounted) {
          setState(() {
            _showTranscript = false;
          });
        }
      });
    });

    // Listen to connection state
    _geminiService.connectionStateStream.listen((isConnected) {
      setState(() {
        _isConnected = isConnected;
      });
    });

    // Listen to tool calls and create UI components
    _geminiService.toolCallStream.listen((toolCall) {
      _handleGeminiToolCall(toolCall);
    });

    // Listen to turn complete events to auto-stop recording
    _geminiService.turnCompleteStream.listen((_) {
      print('Turn completed - stopping recording');
      if (_isRecording) {
        _resumeWakeWordWhenPlaybackStops = true;
        _toggleRecording();
      }
      // Reset frame counter for next turn to get fresh frames
      _cameraFrameService.resetFrameCounter();
    });

    _audioPlayer.playbackStateStream.listen((isPlaying) async {
      if (!isPlaying && _resumeWakeWordWhenPlaybackStops) {
        _resumeWakeWordWhenPlaybackStops = false;
        await _wakeWordService.start();
      }
    });

    // Auto-connect to Gemini
    _connect();

    // Initialize and start wake word detection
    _initializeWakeWord();
  }

  /// Initialize wake word detection
  Future<void> _initializeWakeWord() async {
    try {
      final status = await Permission.microphone.request();
      if (!status.isGranted) {
        print('Microphone permission denied - wake word detection disabled');
        return;
      }

      await _wakeWordService.initialize();
      if (!mounted) return;
      setState(() {
        _wakeWordAvailable = _wakeWordService.isAvailable;
      });
      await _wakeWordService.start();
      print(_wakeWordAvailable
          ? 'Wake word detection started'
          : 'Push-to-talk mode enabled');
    } catch (e) {
      print('Error initializing wake word detection: $e');
    }
  }

  /// Handle wake word detection
  void _onWakeWordDetected() {
    print('Wake word "Jarvis" detected!');
    if (!_isRecording && _isConnected) {
      _toggleRecording();
    }
  }

  /// Start pulse animation for microphone
  void _startPulseAnimation() {
    _pulseTimer = Timer.periodic(const Duration(milliseconds: 500), (timer) {
      if (_isRecording && mounted) {
        setState(() {
          _micPulse = _micPulse == 1.0 ? 1.3 : 1.0;
        });
      }
    });
  }

  void _startBackendHealthPolling() {
    _refreshBackendHealth();
    _backendHealthTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      _refreshBackendHealth();
    });
  }

  Future<void> _refreshBackendHealth() async {
    final jarvisAgent = await _suiteBackendService.checkJarvisAgentHealth();
    final jarvisControl = await _suiteBackendService.checkJarvisControlHealth();
    if (!mounted) return;
    setState(() {
      _jarvisAgentHealth = jarvisAgent;
      _jarvisControlHealth = jarvisControl;
    });

    if (jarvisAgent.ok && !_jarvisAgentBackgroundWorkersInitialized) {
      final initialized = await _suiteBackendService.ensureJarvisAgentNotificationWatcher(
        defaultPackages: const ['*'],
      );
      if (!mounted) return;
      if (initialized) {
        setState(() {
          _jarvisAgentBackgroundWorkersInitialized = true;
          _jarvisAgentHealth = const BackendHealth(
            ok: true,
            label: 'INBOXOPS ONLINE',
            detail: 'Command server + notification watcher active',
          );
        });
      }
    }

    if (jarvisAgent.ok) {
      await _refreshProductivityInsights();
    }
  }

  Future<void> _refreshProductivityInsights() async {
    try {
      final notificationStatus = await _suiteBackendService.getJarvisAgentNotificationStatus();
      final notificationLog = await _suiteBackendService.getJarvisAgentNotificationLog();
      final schedulerStatus = await _suiteBackendService.getJarvisAgentSchedulerStatus();
      final schedulerLog = await _suiteBackendService.getJarvisAgentSchedulerLog();

      if (!mounted) return;
      setState(() {
        _notificationStatus = notificationStatus;
        _notificationEntries = notificationLog.reversed.take(5).toList();
        _schedulerStatus = schedulerStatus;
        _schedulerEntries = schedulerLog.reversed.take(3).toList();
        _productivitySummary = _buildBriefingText(
          notificationStatus: notificationStatus,
          notificationEntries: notificationLog,
          schedulerStatus: schedulerStatus,
          schedulerEntries: schedulerLog,
          microBreak: _recommendedMicroBreak,
        );
      });
    } catch (e) {
      print('Failed to refresh productivity insights: $e');
    }
  }

  String _buildBriefingText({
    required NotificationWatcherStatus notificationStatus,
    required List<NotificationTriageEntry> notificationEntries,
    required SchedulerStatus schedulerStatus,
    required List<SchedulerLogEntry> schedulerEntries,
    JiggleMicroBreak? microBreak,
  }) {
    final latestNotification = notificationEntries.isNotEmpty ? notificationEntries.last : null;
    final latestSchedule = schedulerEntries.isNotEmpty ? schedulerEntries.last : null;
    final focusText = _focusModeEnabled
        ? 'Focus mode active for ${_formatFocusDuration()}.'
        : 'Focus mode is currently off.';

    final parts = <String>[
      notificationStatus.running
          ? 'Notification watcher is active with ${notificationStatus.filterCount} filters.'
          : 'Notification watcher is offline.',
      latestNotification != null
          ? 'Latest notification action: ${latestNotification.action.toUpperCase()} for ${latestNotification.title}.'
          : 'No recent notification actions.',
      schedulerStatus.running
          ? 'Scheduler is running with ${schedulerStatus.taskCount} tasks.'
          : 'Scheduler is idle.',
      latestSchedule != null
          ? 'Latest scheduled task ${latestSchedule.success ? 'succeeded' : 'failed'}: ${latestSchedule.taskName}.'
          : 'No recent scheduled workflow runs.',
      focusText,
      if (microBreak != null) 'Recommended break: ${microBreak.title} for ${microBreak.minutes} minutes.',
    ];

    return parts.join(' ');
  }

  String _formatFocusDuration() {
    if (_focusModeStartedAt == null) return '0m';
    final elapsed = DateTime.now().difference(_focusModeStartedAt!);
    if (elapsed.inHours >= 1) {
      final minutes = elapsed.inMinutes.remainder(60).toString().padLeft(2, '0');
      return '${elapsed.inHours}h ${minutes}m';
    }
    return '${elapsed.inMinutes}m';
  }

  Future<void> _showDailyBriefing() async {
    await _refreshProductivityInsights();
    if (!mounted) return;

    final component = UIComponent.card(
      id: 'briefing_${DateTime.now().millisecondsSinceEpoch}',
      title: 'DAILY BRIEFING',
      subtitle: 'AI productivity snapshot',
      content: _productivitySummary,
    );

    _addComponentWithAnimation(component);
    await _voiceFeedbackService.speak(_productivitySummary);
  }

  Future<void> _suggestMicroBreak({String? prompt}) async {
    try {
      final breakPlan = await _suiteBackendService.generateJarvisMotionBreak(
        prompt: prompt ??
            (_focusModeEnabled
                ? 'a desk posture and energy reset after a deep focus session'
                : 'a quick desk stretch to improve focus'),
      );
      if (!mounted) return;

      setState(() {
        _recommendedMicroBreak = breakPlan;
        _productivitySummary = _buildBriefingText(
          notificationStatus: _notificationStatus,
          notificationEntries: _notificationEntries.reversed.toList(),
          schedulerStatus: _schedulerStatus,
          schedulerEntries: _schedulerEntries.reversed.toList(),
          microBreak: breakPlan,
        );
      });

      final component = UIComponent.list(
        id: 'microbreak_${DateTime.now().millisecondsSinceEpoch}',
        title: breakPlan.title,
        items: [
          breakPlan.summary,
          ...breakPlan.steps.map((step) => '${step}'),
        ],
      );
      _addComponentWithAnimation(component);
      await _voiceFeedbackService.speak('${breakPlan.title}. ${breakPlan.summary}');
    } catch (e) {
      print('Failed to generate micro-break: $e');
    }
  }

  Future<void> _toggleFocusMode() async {
    if (_focusModeEnabled) {
      _focusModeTimer?.cancel();
      if (!mounted) return;
      setState(() {
        _focusModeEnabled = false;
        _focusModeStartedAt = null;
      });

      _addComponentWithAnimation(
        UIComponent.card(
          id: 'focus_off_${DateTime.now().millisecondsSinceEpoch}',
          title: 'FOCUS MODE ENDED',
          subtitle: 'Workflow session closed',
          content: 'Focus mode stopped. You can resume later or ask for a fresh briefing.',
        ),
      );
      return;
    }

    if (!mounted) return;
    setState(() {
      _focusModeEnabled = true;
      _focusModeStartedAt = DateTime.now();
    });

    _focusModeTimer?.cancel();
    _focusModeTimer = Timer(const Duration(minutes: 30), () {
      unawaited(_suggestMicroBreak(
        prompt: 'a 3 minute posture reset after 30 minutes of focused tablet work',
      ));
    });

    _addComponentWithAnimation(
      UIComponent.card(
        id: 'focus_on_${DateTime.now().millisecondsSinceEpoch}',
        title: 'FOCUS MODE ACTIVE',
        subtitle: 'Deep work session',
        content: 'JARVIS will track this session and recommend a motion micro-break soon.',
      ),
    );
  }

  Future<void> _generateDemoNotification() async {
    final scenarios = <Map<String, String>>[
      {
        'package': 'com.google.android.gm',
        'title': 'Investor update needed before 4 PM',
        'action': 'alert',
        'reason': 'High-priority email tied to today\'s deadline.',
      },
      {
        'package': 'com.whatsapp',
        'title': 'Design lead: please review the launch deck',
        'action': 'act',
        'reason': 'Direct request from a collaborator.',
      },
      {
        'package': 'com.google.android.calendar',
        'title': 'Meeting starts in 10 minutes',
        'action': 'alert',
        'reason': 'Upcoming calendar event requires preparation.',
      },
      {
        'package': 'com.discord',
        'title': 'Hackathon mentor replied in team channel',
        'action': 'log',
        'reason': 'Useful update for demo activity.',
      },
    ];

    final scenario = scenarios[_demoNotificationIndex % scenarios.length];
    _demoNotificationIndex += 1;

    final entry = NotificationTriageEntry(
      timestamp: DateTime.now(),
      packageName: scenario['package']!,
      title: scenario['title']!,
      action: scenario['action']!,
      reason: scenario['reason']!,
    );

    if (!mounted) return;
    setState(() {
      _notificationStatus = NotificationWatcherStatus(
        running: true,
        queueLength: 0,
        filterCount: _notificationStatus.filterCount == 0 ? 1 : _notificationStatus.filterCount,
      );
      _notificationEntries = [entry, ..._notificationEntries].take(5).toList();
      _productivitySummary = _buildBriefingText(
        notificationStatus: _notificationStatus,
        notificationEntries: _notificationEntries.reversed.toList(),
        schedulerStatus: _schedulerStatus,
        schedulerEntries: _schedulerEntries.reversed.toList(),
        microBreak: _recommendedMicroBreak,
      );
    });

    _addComponentWithAnimation(
      UIComponent.card(
        id: 'demo_notification_${DateTime.now().millisecondsSinceEpoch}',
        title: 'DEMO NOTIFICATION',
        subtitle: scenario['package'],
        content: '${scenario['title']}\nAction: ${scenario['action']!.toUpperCase()}\nWhy: ${scenario['reason']}',
      ),
    );

    await _voiceFeedbackService.speak(
      'Demo notification received. ${scenario['title']}. Recommended action ${scenario['action']}.',
    );
  }

  Future<void> _submitBackendCommand() async {
    final prompt = _commandController.text.trim();
    if (prompt.isEmpty || _isExecutingBackendCommand) return;

    setState(() {
      _isExecutingBackendCommand = true;
    });

    final result = _selectedMode == SuiteExecutionMode.jarvisAgent
        ? await _suiteBackendService.executeJarvisAgentCommand(prompt)
        : await _suiteBackendService.executeJarvisControlGoal(prompt);

    if (!mounted) return;

    final component = UIComponent.card(
      id: 'backend_result_${DateTime.now().millisecondsSinceEpoch}',
      title: '${result.source} ${result.success ? 'COMPLETE' : 'ERROR'}',
      subtitle: _selectedMode == SuiteExecutionMode.jarvisAgent
          ? 'InboxOps rooted operator'
          : 'TaskRunner ADB engine',
      content: result.message,
    );

    _addComponentWithAnimation(component);
    _commandController.clear();
    setState(() {
      _isExecutingBackendCommand = false;
    });
    unawaited(_speakBackendResult(result));
  }

  Future<void> _speakBackendResult(SuiteCommandResult result) async {
    await _wakeWordService.stop();
    await _audioPlayer.stopPlayback();
    await _voiceFeedbackService.speak('${result.source}. ${result.message}');

    if (!_isRecording && mounted) {
      await _wakeWordService.start();
    }
  }

  Future<void> _openJarvisMotion() async {
    final wasRecording = _isRecording;
    final hadCameraPreview = _isCameraInitialized;

    if (_isRecording) {
      await _toggleRecording();
    }

    if (_isSharingCamera && _cameraController != null) {
      await _cameraFrameService.stopCapturing(_cameraController!);
      if (mounted) {
        setState(() {
          _isSharingCamera = false;
        });
      }
    }

    if (_cameraController != null) {
      _cameraFrameService.dispose(_cameraController);
      await _cameraController!.dispose();
      _cameraController = null;
      if (mounted) {
        setState(() {
          _isCameraInitialized = false;
        });
      }
    }

    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => JarvisMotionScreen(baseUrl: widget.jarvisMotionBaseUrl),
      ),
    );

    if (hadCameraPreview && mounted) {
      await Future<void>.delayed(const Duration(milliseconds: 250));
      await _initializeCamera();
    }

    if (wasRecording && mounted) {
      await _toggleRecording();
    }
  }

  Future<void> _emergencyStop() async {
    final released = await _suiteBackendService.releaseJarvisAgentLock();
    if (!mounted) return;
    final component = UIComponent.card(
      id: 'emergency_stop_${DateTime.now().millisecondsSinceEpoch}',
      title: released ? 'EMERGENCY STOP SENT' : 'EMERGENCY STOP FAILED',
      subtitle: 'InboxOps lock control',
      content: released ? 'Device lock released successfully.' : 'Could not reach InboxOps lock endpoint.',
    );
    _addComponentWithAnimation(component);
    await _refreshBackendHealth();
  }

  Widget _buildBackendStatusPanel() {
    Widget statusRow(String title, BackendHealth health, Color activeColor) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: health.ok ? activeColor : Colors.redAccent,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: activeColor,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 1.0,
                    ),
                  ),
                  Text(
                    health.detail,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.7),
                      fontSize: 10,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      width: 260,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.75),
        border: Border.all(color: Colors.cyanAccent.withOpacity(0.45)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'SUITE BACKENDS',
            style: TextStyle(
              color: Colors.cyanAccent,
              fontSize: 12,
              fontWeight: FontWeight.bold,
              letterSpacing: 1.4,
            ),
          ),
          const SizedBox(height: 10),
          statusRow('INBOXOPS', _jarvisAgentHealth, Colors.tealAccent),
          statusRow('TASKRUNNER', _jarvisControlHealth, Colors.orangeAccent),
          TextButton(
            onPressed: _refreshBackendHealth,
            style: TextButton.styleFrom(padding: EdgeInsets.zero),
            child: const Text(
              'REFRESH STATUS',
              style: TextStyle(color: Colors.cyanAccent, fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCommandDock() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.82),
        border: Border.all(color: Colors.cyanAccent.withOpacity(0.5)),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'PHONE AUTONOMY DOCK',
            style: TextStyle(
              color: Colors.cyanAccent,
              fontSize: 12,
              fontWeight: FontWeight.bold,
              letterSpacing: 1.4,
            ),
          ),
          const SizedBox(height: 10),
          SegmentedButton<SuiteExecutionMode>(
            segments: const [
              ButtonSegment(
                value: SuiteExecutionMode.jarvisAgent,
                label: Text('InboxOps'),
                icon: Icon(Icons.phone_android),
              ),
              ButtonSegment(
                value: SuiteExecutionMode.jarvisControl,
                label: Text('TaskRunner'),
                icon: Icon(Icons.smart_toy),
              ),
            ],
            selected: <SuiteExecutionMode>{_selectedMode},
            onSelectionChanged: (selection) {
              setState(() {
                _selectedMode = selection.first;
              });
            },
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _commandController,
            style: const TextStyle(color: Colors.white),
            minLines: 1,
            maxLines: 3,
            decoration: InputDecoration(
              hintText: _selectedMode == SuiteExecutionMode.jarvisAgent
                  ? 'Send a rooted-phone command, notification task, or schedule request'
                  : 'Send an ADB phone-control goal',
              hintStyle: TextStyle(color: Colors.white.withOpacity(0.4)),
              filled: true,
              fillColor: Colors.white.withOpacity(0.06),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: Colors.cyanAccent.withOpacity(0.3)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: Colors.cyanAccent.withOpacity(0.3)),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            _wakeWordService.mode == WakeWordMode.porcupine
                ? 'Voice ready: say "Jarvis"'
                : _wakeWordService.mode == WakeWordMode.vosk
                    ? (_wakeWordService.speechFallbackArmed
                        ? 'Free Vosk wake word live: say "Jarvis"'
                        : 'Free Vosk wake word paused')
                    : 'Push-to-talk active: tap MIC',
            style: TextStyle(
              color: _wakeWordService.mode == WakeWordMode.pushToTalk
                  ? Colors.orangeAccent
                  : _wakeWordService.mode == WakeWordMode.porcupine
                  ? Colors.tealAccent
                  : Colors.lightGreenAccent,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              OutlinedButton.icon(
                onPressed: _toggleRecording,
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.cyanAccent,
                  side: BorderSide(color: Colors.cyanAccent.withOpacity(0.6)),
                ),
                icon: Icon(_isRecording ? Icons.mic : Icons.mic_none),
                label: Text(_isRecording ? 'LISTENING' : 'MIC'),
              ),
              OutlinedButton(
                onPressed: _showDailyBriefing,
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.amberAccent,
                  side: const BorderSide(color: Colors.amberAccent),
                ),
                child: const Text('BRIEF'),
              ),
              OutlinedButton(
                onPressed: _toggleFocusMode,
                style: OutlinedButton.styleFrom(
                  foregroundColor: _focusModeEnabled ? Colors.redAccent : Colors.lightGreenAccent,
                  side: BorderSide(
                    color: _focusModeEnabled ? Colors.redAccent : Colors.lightGreenAccent,
                  ),
                ),
                child: Text(_focusModeEnabled ? 'END FOCUS' : 'FOCUS'),
              ),
              OutlinedButton(
                onPressed: () => _suggestMicroBreak(),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.pinkAccent,
                  side: const BorderSide(color: Colors.pinkAccent),
                ),
                child: const Text('BREAK'),
              ),
              OutlinedButton(
                onPressed: _generateDemoNotification,
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.amberAccent,
                  side: const BorderSide(color: Colors.amberAccent),
                ),
                child: const Text('DEMO ALERT'),
              ),
              ElevatedButton(
                onPressed: _isExecutingBackendCommand ? null : _submitBackendCommand,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.cyanAccent,
                  foregroundColor: Colors.black,
                ),
                child: Text(_isExecutingBackendCommand ? 'EXECUTING...' : 'EXECUTE'),
              ),
              OutlinedButton(
                onPressed: _openJarvisMotion,
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.limeAccent,
                  side: const BorderSide(color: Colors.limeAccent),
                ),
                child: const Text('MOTION'),
              ),
              OutlinedButton(
                onPressed: _emergencyStop,
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.redAccent,
                  side: const BorderSide(color: Colors.redAccent),
                ),
                child: const Text('STOP'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildProductivityPanel() {
    final latestNotification = _notificationEntries.isNotEmpty ? _notificationEntries.first : null;
    final latestScheduler = _schedulerEntries.isNotEmpty ? _schedulerEntries.first : null;

    String actionLabel(NotificationTriageEntry entry) {
      switch (entry.action.toLowerCase()) {
        case 'act':
          return 'ACTED';
        case 'alert':
          return 'ALERT';
        case 'log':
          return 'LOGGED';
        case 'ignore':
          return 'IGNORED';
        default:
          return entry.action.toUpperCase();
      }
    }

    return Container(
      width: 300,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.78),
        border: Border.all(color: Colors.amberAccent.withOpacity(0.45)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'PRODUCTIVITY LAYER',
            style: TextStyle(
              color: Colors.amberAccent,
              fontSize: 12,
              fontWeight: FontWeight.bold,
              letterSpacing: 1.3,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _focusModeEnabled
                ? 'Focus mode active for ${_formatFocusDuration()}'
                : 'Focus mode inactive',
            style: TextStyle(
              color: _focusModeEnabled ? Colors.lightGreenAccent : Colors.white70,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _notificationStatus.running
                ? 'Watcher live • queue ${_notificationStatus.queueLength}'
                : 'Watcher offline',
            style: const TextStyle(
              color: Colors.cyanAccent,
              fontSize: 11,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            latestNotification != null
                ? 'Latest notification: ${actionLabel(latestNotification)} • ${latestNotification.title}'
                : 'No notification actions yet',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.white, fontSize: 11),
          ),
          const SizedBox(height: 8),
          Text(
            latestScheduler != null
                ? 'Latest schedule: ${latestScheduler.taskName} ${latestScheduler.success ? 'OK' : 'FAIL'}'
                : _schedulerStatus.running
                    ? 'Scheduler running with ${_schedulerStatus.taskCount} tasks'
                    : 'No scheduled workflow activity',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.white70, fontSize: 11),
          ),
          const SizedBox(height: 8),
          Text(
            _recommendedMicroBreak != null
                ? 'Break ready: ${_recommendedMicroBreak!.title}'
                : 'No micro-break queued',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.pinkAccent, fontSize: 11),
          ),
        ],
      ),
    );
  }

  /// Connect to Gemini
  Future<void> _connect() async {
    try {
      await _geminiService.connect();
    } catch (e) {
      print('Failed to connect: $e');
    }
  }

  Future<void> _handleSuiteToolCall(Map<String, dynamic> toolCall) async {
    final function = toolCall['function'] as String?;
    final functionId = toolCall['id'] as String?;
    if (function == null || functionId == null) return;

    switch (function) {
      case 'run_phone_agent_task':
        final mode = (toolCall['mode'] as String? ?? 'jarvis-agent').toLowerCase();
        final prompt = toolCall['prompt'] as String? ?? '';
        if (prompt.trim().isEmpty) {
          await _geminiService.sendFunctionResponse(
            functionId,
            function,
            'Task rejected because no prompt was provided.',
          );
          return;
        }

        final useControl = mode == 'phonepilot' || mode == 'jarvis-control' || mode == 'taskrunner';
        final result = useControl
            ? await _suiteBackendService.executeJarvisControlGoal(prompt)
            : await _suiteBackendService.executeJarvisAgentCommand(prompt);

        final component = UIComponent.card(
          id: 'suite_exec_${DateTime.now().millisecondsSinceEpoch}',
          title: '${result.source} ${result.success ? 'COMPLETE' : 'ERROR'}',
          subtitle: useControl ? 'TaskRunner ADB engine' : 'InboxOps rooted operator',
          content: result.message,
        );
        _addComponentWithAnimation(component);
        await _refreshBackendHealth();
        await _geminiService.sendFunctionResponse(
          functionId,
          function,
          '${result.source}: ${result.message}',
        );
        return;

      case 'get_suite_status':
        final status = await _suiteBackendService.getSuiteStatusSummary();
        await _refreshBackendHealth();
        await _geminiService.sendFunctionResponse(functionId, function, status);
        return;

      case 'stop_phone_agent':
        final released = await _suiteBackendService.releaseJarvisAgentLock();
        await _refreshBackendHealth();
        await _geminiService.sendFunctionResponse(
          functionId,
          function,
          released
              ? 'InboxOps emergency stop sent successfully.'
              : 'Failed to reach InboxOps emergency stop endpoint.',
        );
        return;
    }
  }

  /// Handle tool calls from Gemini
  void _handleGeminiToolCall(Map<String, dynamic> toolCall) {
    final function = toolCall['function'] as String?;
    if (function == null) return;

    if (function == 'run_phone_agent_task' ||
        function == 'get_suite_status' ||
        function == 'stop_phone_agent') {
      unawaited(_handleSuiteToolCall(toolCall));
      return;
    }

    // Use provided ID if available, otherwise generate one
    final componentId = toolCall['id'] as String? ?? 'component_${_componentIdCounter++}';
    UIComponent? component;

    switch (function) {
      case 'show_note':
        component = UIComponent.note(
          id: componentId,
          title: toolCall['title'] ?? 'Note',
          content: toolCall['content'] ?? '',
        );
        break;

      case 'show_reminder':
        final timeStr = toolCall['time'] as String?;
        DateTime? time;
        if (timeStr != null) {
          try {
            time = DateTime.parse(timeStr);
          } catch (e) {
            time = DateTime.now().add(const Duration(hours: 1));
          }
        } else {
          time = DateTime.now().add(const Duration(hours: 1));
        }

        component = UIComponent.reminder(
          id: componentId,
          title: toolCall['title'] ?? 'Reminder',
          time: time,
          description: toolCall['description'],
        );
        break;

      case 'show_calendar_event':
        final startTimeStr = toolCall['startTime'] as String?;
        final endTimeStr = toolCall['endTime'] as String?;

        DateTime? startTime;
        DateTime? endTime;

        if (startTimeStr != null) {
          try {
            startTime = DateTime.parse(startTimeStr);
          } catch (e) {
            startTime = DateTime.now();
          }
        } else {
          startTime = DateTime.now();
        }

        if (endTimeStr != null) {
          try {
            endTime = DateTime.parse(endTimeStr);
          } catch (e) {
            endTime = null;
          }
        }

        component = UIComponent.calendarEvent(
          id: componentId,
          title: toolCall['title'] ?? 'Event',
          startTime: startTime,
          endTime: endTime,
          description: toolCall['description'],
        );
        break;

      case 'show_list':
        final items = (toolCall['items'] as List?)?.cast<String>() ?? [];
        component = UIComponent.list(
          id: componentId,
          title: toolCall['title'] ?? 'List',
          items: items,
        );
        break;

      case 'show_card':
        component = UIComponent.card(
          id: componentId,
          title: toolCall['title'] ?? 'Card',
          subtitle: toolCall['subtitle'],
          content: toolCall['content'],
        );
        break;

      case 'create_task_list':
        final taskDescriptions = (toolCall['tasks'] as List?)?.cast<String>() ?? [];
        final tasks = taskDescriptions.asMap().entries.map((entry) {
          return TaskItem(
            id: 'task_${componentId}_${entry.key}',
            description: entry.value,
            isCompleted: false,
          );
        }).toList();

        component = UIComponent.taskList(
          id: componentId,
          title: toolCall['title'] ?? 'Mission Tasks',
          tasks: tasks,
        );
        break;

      case 'complete_task':
        final taskListId = toolCall['task_list_id'] as String?;
        final taskNumber = toolCall['task_number'] as int?;

        if (taskListId != null && taskNumber != null) {
          _completeTask(taskListId, taskNumber);
        }
        return; // Don't add a new component for complete_task

      case 'clear_screen':
        _clearAllComponents();
        return; // Don't add a component for clear_screen
    }

    if (component != null) {
      _addComponentWithAnimation(component);
    }
  }

  /// Add component with slide-in animation
  void _addComponentWithAnimation(UIComponent component) {
    final controller = AnimationController(
      duration: const Duration(milliseconds: 400),
      vsync: this,
    );

    setState(() {
      _uiComponents.add(component);
      _componentAnimations[component.id] = controller;
    });

    controller.forward();
  }

  /// Remove component with animation
  void _removeComponent(String id) {
    final controller = _componentAnimations[id];
    if (controller != null) {
      controller.reverse().then((_) {
        setState(() {
          _uiComponents.removeWhere((component) => component.id == id);
          _componentAnimations.remove(id);
        });
        controller.dispose();
      });
    }
  }

  /// Clear all components from the screen
  void _clearAllComponents() {
    print('Clearing all components');

    // Reverse all animations
    for (var controller in _componentAnimations.values) {
      controller.reverse();
    }

    // After animations complete, clear everything
    Future.delayed(const Duration(milliseconds: 400), () {
      if (mounted) {
        setState(() {
          _uiComponents.clear();
          for (var controller in _componentAnimations.values) {
            controller.dispose();
          }
          _componentAnimations.clear();
        });
      }
    });
  }

  /// Complete a task in a task list
  void _completeTask(String taskListId, int taskNumber) {
    print('Completing task $taskNumber in list $taskListId');

    // Find the task list component
    final taskListIndex = _uiComponents.indexWhere(
      (component) => component.id == taskListId && component.type == UIComponentType.taskList,
    );

    if (taskListIndex == -1) {
      print('Task list not found: $taskListId');
      return;
    }

    final taskList = _uiComponents[taskListIndex];
    final tasks = taskList.tasks;

    // Validate task number
    if (taskNumber < 1 || taskNumber > tasks.length) {
      print('Invalid task number: $taskNumber (valid range: 1-${tasks.length})');
      return;
    }

    // Get the task ID (taskNumber is 1-indexed, list is 0-indexed)
    final taskId = tasks[taskNumber - 1].id;

    // Update the component with the completed task
    final updatedComponent = taskList.updateTaskStatus(taskId, true);

    setState(() {
      _uiComponents[taskListIndex] = updatedComponent;
    });

    print('Task $taskNumber marked as complete');
  }

  /// Toggle voice recording
  Future<void> _toggleRecording() async {
    if (!_isConnected) return;

    if (_isRecording) {
      await _audioRecorder.stopRecording();

      // Stop camera sharing
      if (_isSharingCamera && _cameraController != null) {
        await _cameraFrameService.stopCapturing(_cameraController!);
        setState(() {
          _isSharingCamera = false;
        });
      }

      setState(() {
        _isRecording = false;
        _micPulse = 1.0;
      });
      if (!_resumeWakeWordWhenPlaybackStops) {
        await _wakeWordService.start();
      }
    } else {
      final status = await Permission.microphone.request();
      if (!status.isGranted) return;

      try {
        await _wakeWordService.stop();
        await _audioRecorder.startRecording();

        // Start camera sharing when recording starts
        if (_cameraController != null && _isCameraInitialized) {
          try {
            await _cameraFrameService.startCapturing(
              cameraController: _cameraController!,
              onFrameCaptured: (bytes) async {
                try {
                  await _geminiService.sendVideoFrame(bytes);
                } catch (e) {
                  print('Error sending video frame: $e');
                }
              },
              intervalMs: 2500, // 1 frame every 2.5 seconds to reduce lag
            );

            setState(() {
              _isSharingCamera = true;
            });
            print('Started camera frame streaming');
          } catch (e) {
            print('Failed to start camera sharing: $e');
          }
        }

        setState(() {
          _isRecording = true;
        });
      } catch (e) {
        print('Failed to start recording: $e');
        await _wakeWordService.start();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Camera background
          if (_isCameraInitialized && _cameraController != null)
            Positioned.fill(
              child: CameraPreview(_cameraController!),
            )
          else
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black,
                      Colors.grey.shade900,
                      Colors.black,
                    ],
                  ),
                ),
              ),
            ),

          // Dark overlay for better contrast
          Positioned.fill(
            child: Container(
              color: Colors.black.withOpacity(0.3),
            ),
          ),

          // HUD Grid pattern overlay
          Positioned.fill(
            child: CustomPaint(
              painter: HUDGridPainter(),
            ),
          ),

          // UI Components floating overlays
          ...List.generate(_uiComponents.length, (index) {
            final component = _uiComponents[index];
            final animation = _componentAnimations[component.id];

            if (animation == null) return const SizedBox.shrink();

            return Positioned(
              top: 130 + (index * 150.0),
              left: 20,
              right: 340,
              child: SlideTransition(
                position: Tween<Offset>(
                  begin: const Offset(1.0, 0.0),
                  end: Offset.zero,
                ).animate(CurvedAnimation(
                  parent: animation,
                  curve: Curves.easeOutCubic,
                )),
                child: FadeTransition(
                  opacity: animation,
                  child: HUDOverlayWidget(
                    component: component,
                    onDismiss: () => _removeComponent(component.id),
                  ),
                ),
              ),
            );
          }),

          // Transcript overlay (bottom)
          if (_showTranscript)
            Positioned(
              bottom: 120,
              left: 20,
              right: 20,
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.7),
                  border: Border.all(
                    color: Colors.cyanAccent.withOpacity(0.5),
                    width: 1,
                  ),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  _lastTranscript,
                  style: const TextStyle(
                    color: Colors.cyanAccent,
                    fontSize: 14,
                    fontFamily: 'monospace',
                  ),
                ),
              ),
            ),

          // Vitals HUD (top)
          if (_currentVitals != null)
            Positioned(
              top: 20,
              left: 20,
              right: 20,
              child: VitalsHUDWidget(vitals: _currentVitals!),
            ),

          Positioned(
            top: 110,
            right: 20,
            child: SizedBox(
              width: 300,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _buildBackendStatusPanel(),
                  const SizedBox(height: 12),
                  _buildProductivityPanel(),
                ],
              ),
            ),
          ),

          Positioned(
            left: 0,
            right: 0,
            bottom: 96,
            child: _buildCommandDock(),
          ),

          // Waveform visualizer (bottom)
          Positioned(
            bottom: 20,
            left: 20,
            right: 20,
            child: WaveformVisualizer(
              isActive: _isRecording,
              audioLevel: _currentAudioLevel,
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _pulseTimer?.cancel();
    _backendHealthTimer?.cancel();
    _focusModeTimer?.cancel();
    _commandController.dispose();
    _cameraFrameService.dispose(_cameraController);
    _cameraController?.dispose();
    _audioRecorder.dispose();
    _audioPlayer.dispose();
    unawaited(_voiceFeedbackService.dispose());
    _geminiService.dispose();
    _wakeWordService.dispose();
    _vitalsService.dispose();
    for (var controller in _componentAnimations.values) {
      controller.dispose();
    }
    super.dispose();
  }
}

/// Custom painter for HUD grid effect
class HUDGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.cyanAccent.withOpacity(0.05)
      ..strokeWidth = 0.5
      ..style = PaintingStyle.stroke;

    // Vertical lines
    for (double x = 0; x < size.width; x += 50) {
      canvas.drawLine(
        Offset(x, 0),
        Offset(x, size.height),
        paint,
      );
    }

    // Horizontal lines
    for (double y = 0; y < size.height; y += 50) {
      canvas.drawLine(
        Offset(0, y),
        Offset(size.width, y),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
