import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'services/gemini_live_service.dart';
import 'services/audio_recorder_service.dart';
import 'services/audio_player_service.dart';
import 'models/ui_component.dart';
import 'widgets/ui_component_widget.dart';

/// Main screen for interacting with Gemini Live API
/// Supports both audio and text communication
class GeminiLiveChatScreen extends StatefulWidget {
  final String apiKey;

  const GeminiLiveChatScreen({
    super.key,
    required this.apiKey,
  });

  @override
  State<GeminiLiveChatScreen> createState() => _GeminiLiveChatScreenState();
}

class _GeminiLiveChatScreenState extends State<GeminiLiveChatScreen> {
  late GeminiLiveService _geminiService;
  late AudioRecorderService _audioRecorder;
  late AudioPlayerService _audioPlayer;

  final TextEditingController _textController = TextEditingController();
  final List<ChatMessage> _messages = [];
  final List<UIComponent> _uiComponents = [];
  final ScrollController _scrollController = ScrollController();

  bool _isConnected = false;
  bool _isRecording = false;
  bool _isConnecting = false;
  int _componentIdCounter = 0;

  @override
  void initState() {
    super.initState();
    _initializeServices();
  }

  /// Initialize all services
  void _initializeServices() {
    _geminiService = GeminiLiveService(apiKey: widget.apiKey);
    _audioRecorder = AudioRecorderService(_geminiService);
    _audioPlayer = AudioPlayerService(_geminiService);

    // Listen to text responses
    _geminiService.textOutputStream.listen((text) {
      setState(() {
        // Check if last message is from Gemini and append to it
        if (_messages.isNotEmpty && _messages.last.isFromGemini) {
          _messages.last = ChatMessage(
            text: _messages.last.text + text,
            isFromGemini: true,
          );
        } else {
          _messages.add(ChatMessage(text: text, isFromGemini: true));
        }
      });
      _scrollToBottom();
    });

    // Listen to connection state
    _geminiService.connectionStateStream.listen((isConnected) {
      setState(() {
        _isConnected = isConnected;
        _isConnecting = false;
      });
    });

    // Listen to tool calls and create UI components
    _geminiService.toolCallStream.listen((toolCall) {
      _handleToolCall(toolCall);
    });
  }

  /// Handle tool calls from Gemini and create appropriate UI components
  void _handleToolCall(Map<String, dynamic> toolCall) {
    final function = toolCall['function'] as String?;
    if (function == null) return;

    final componentId = 'component_${_componentIdCounter++}';
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
            print('Error parsing reminder time: $e');
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
            print('Error parsing event start time: $e');
            startTime = DateTime.now();
          }
        } else {
          startTime = DateTime.now();
        }

        if (endTimeStr != null) {
          try {
            endTime = DateTime.parse(endTimeStr);
          } catch (e) {
            print('Error parsing event end time: $e');
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
    }

    if (component != null) {
      setState(() {
        _uiComponents.add(component!);
      });
    }
  }

  /// Remove a UI component
  void _removeComponent(String id) {
    setState(() {
      _uiComponents.removeWhere((component) => component.id == id);
    });
  }

  /// Connect to Gemini Live API
  Future<void> _connect() async {
    setState(() {
      _isConnecting = true;
    });

    try {
      await _geminiService.connect();
      _showSnackBar('Connected to Gemini Live', isError: false);
    } catch (e) {
      _showSnackBar('Failed to connect: $e', isError: true);
      setState(() {
        _isConnecting = false;
      });
    }
  }

  /// Disconnect from Gemini Live API
  Future<void> _disconnect() async {
    try {
      if (_isRecording) {
        await _stopRecording();
      }
      await _geminiService.disconnect();
      _showSnackBar('Disconnected from Gemini Live', isError: false);
    } catch (e) {
      _showSnackBar('Error disconnecting: $e', isError: true);
    }
  }

  /// Toggle audio recording
  Future<void> _toggleRecording() async {
    if (_isRecording) {
      await _stopRecording();
    } else {
      await _startRecording();
    }
  }

  /// Start audio recording
  Future<void> _startRecording() async {
    // Check microphone permission
    final status = await Permission.microphone.request();
    if (!status.isGranted) {
      _showSnackBar('Microphone permission denied', isError: true);
      return;
    }

    try {
      await _audioRecorder.startRecording();
      setState(() {
        _isRecording = true;
      });
    } catch (e) {
      _showSnackBar('Failed to start recording: $e', isError: true);
    }
  }

  /// Stop audio recording
  Future<void> _stopRecording() async {
    try {
      await _audioRecorder.stopRecording();
      setState(() {
        _isRecording = false;
      });
    } catch (e) {
      _showSnackBar('Failed to stop recording: $e', isError: true);
    }
  }

  /// Send text message
  Future<void> _sendTextMessage() async {
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    setState(() {
      _messages.add(ChatMessage(text: text, isFromGemini: false));
    });

    _textController.clear();
    _scrollToBottom();

    try {
      await _geminiService.sendText(text);
    } catch (e) {
      _showSnackBar('Failed to send message: $e', isError: true);
    }
  }

  /// Scroll to bottom of message list
  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  /// Show snackbar message
  void _showSnackBar(String message, {required bool isError}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red : Colors.green,
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Jarvis AI Assistant'),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        actions: [
          // Connection status indicator
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: Center(
              child: Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: _isConnected ? Colors.green : Colors.red,
                  shape: BoxShape.circle,
                ),
              ),
            ),
          ),
          // Connect/Disconnect button
          IconButton(
            icon: Icon(_isConnected ? Icons.power_off : Icons.power),
            onPressed: _isConnecting
                ? null
                : (_isConnected ? _disconnect : _connect),
            tooltip: _isConnected ? 'Disconnect' : 'Connect',
          ),
        ],
      ),
      body: Column(
        children: [
          // Connection status banner
          if (!_isConnected)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              color: Colors.orange.shade100,
              child: Text(
                _isConnecting
                    ? 'Connecting to Gemini Live...'
                    : 'Not connected. Tap the power button to connect.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.orange.shade900),
              ),
            ),

          // UI Components section
          if (_uiComponents.isNotEmpty)
            Container(
              constraints: const BoxConstraints(maxHeight: 300),
              child: ListView.builder(
                padding: const EdgeInsets.only(top: 8),
                itemCount: _uiComponents.length,
                itemBuilder: (context, index) {
                  final component = _uiComponents[index];
                  return UIComponentWidget(
                    component: component,
                    onDismiss: () => _removeComponent(component.id),
                  );
                },
              ),
            ),

          // Message list
          Expanded(
            child: _messages.isEmpty
                ? const Center(
                    child: Text(
                      'Start a conversation with Jarvis!\nUse the microphone or type a message.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.grey,
                        fontSize: 16,
                      ),
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(8),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final message = _messages[index];
                      return ChatBubble(message: message);
                    },
                  ),
          ),

          // Input controls
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.grey.shade100,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.1),
                  blurRadius: 4,
                  offset: const Offset(0, -2),
                ),
              ],
            ),
            child: Row(
              children: [
                // Microphone button
                IconButton(
                  icon: Icon(
                    _isRecording ? Icons.mic : Icons.mic_none,
                    size: 32,
                  ),
                  color: _isRecording ? Colors.red : Colors.blue,
                  onPressed: _isConnected ? _toggleRecording : null,
                  tooltip: _isRecording ? 'Stop recording' : 'Start recording',
                ),

                const SizedBox(width: 8),

                // Text input field
                Expanded(
                  child: TextField(
                    controller: _textController,
                    enabled: _isConnected,
                    decoration: const InputDecoration(
                      hintText: 'Type a message...',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                    ),
                    onSubmitted: (_) => _sendTextMessage(),
                  ),
                ),

                const SizedBox(width: 8),

                // Send button
                IconButton(
                  icon: const Icon(Icons.send),
                  color: Colors.blue,
                  onPressed: _isConnected ? _sendTextMessage : null,
                  tooltip: 'Send message',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _textController.dispose();
    _scrollController.dispose();
    _audioRecorder.dispose();
    _audioPlayer.dispose();
    _geminiService.dispose();
    super.dispose();
  }
}

/// Represents a chat message
class ChatMessage {
  String text;
  final bool isFromGemini;

  ChatMessage({
    required this.text,
    required this.isFromGemini,
  });
}

/// Widget to display a chat bubble
class ChatBubble extends StatelessWidget {
  final ChatMessage message;

  const ChatBubble({
    super.key,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment:
          message.isFromGemini ? Alignment.centerLeft : Alignment.centerRight,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.75,
        ),
        decoration: BoxDecoration(
          color: message.isFromGemini
              ? Colors.grey.shade300
              : Colors.blue.shade100,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              message.isFromGemini ? 'Gemini' : 'You',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 12,
                color: Colors.grey.shade700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              message.text,
              style: const TextStyle(fontSize: 16),
            ),
          ],
        ),
      ),
    );
  }
}
