import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:permission_handler/permission_handler.dart';
import 'services/gemini_live_service.dart';
import 'services/audio_recorder_service.dart';
import 'services/audio_player_service.dart';
import 'services/wake_word_service.dart';
import 'services/camera_frame_service.dart';
import 'services/vitals_service.dart';
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

  const JarvisHUDScreen({
    super.key,
    required this.apiKey,
    required this.picovoiceKey,
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
  late CameraFrameService _cameraFrameService;
  late VitalsService _vitalsService;

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
  double _micPulse = 1.0;

  @override
  void initState() {
    super.initState();
    _initializeCamera();
    _initializeServices();
    _startPulseAnimation();
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
    _vitalsService = VitalsService();

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
      _handleToolCall(toolCall);
    });

    // Listen to turn complete events to auto-stop recording
    _geminiService.turnCompleteStream.listen((_) {
      print('Turn completed - stopping recording');
      if (_isRecording) {
        _toggleRecording();
      }
      // Reset frame counter for next turn to get fresh frames
      _cameraFrameService.resetFrameCounter();
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
      await _wakeWordService.start();
      print('Wake word detection started');
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

  /// Connect to Gemini
  Future<void> _connect() async {
    try {
      await _geminiService.connect();
    } catch (e) {
      print('Failed to connect: $e');
    }
  }

  /// Handle tool calls from Gemini
  void _handleToolCall(Map<String, dynamic> toolCall) {
    final function = toolCall['function'] as String?;
    if (function == null) return;

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
    } else {
      final status = await Permission.microphone.request();
      if (!status.isGranted) return;

      try {
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
              top: 120 + (index * 160.0),
              left: 20,
              right: 20,
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
    _cameraFrameService.dispose(_cameraController);
    _cameraController?.dispose();
    _audioRecorder.dispose();
    _audioPlayer.dispose();
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
