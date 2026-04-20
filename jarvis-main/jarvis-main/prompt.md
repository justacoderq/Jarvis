Project Brief: Flutter Dynamic UI Client1. Core ObjectiveYour task is to build the Flutter "face" of the "Jarvis" assistant. This app will connect to a Python WebSocket server, stream the device's microphone and camera, and listen for two types of responses:AI Audio (Binary): Raw audio bytes to be played in real-time.AI Commands (Text): JSON commands that you will use to dynamically build and modify the UI.2. Core Technologiesflutterweb_socket_channel (for WebSocket communication)provider (for state management)camera (for video streaming)mic_stream (for raw PCM audio streaming)just_audio (for playing the incoming AI audio stream)dart:convert (for jsonEncode/jsonDecode and base64Encode)permission_handler (to request mic/camera permissions)3. Communication Protocol (The Contract)You MUST adhere to the COMMUNICATION_PROTOCOL.md file.Sending to Server (Text): You MUST send all media as base64-encoded strings wrapped in a JSON object, e.g., {"type": "audio_stream", "payload": "..."}.Receiving from Server (Binary/Text): You must check the message type.if (message is String): It's a JSON UI command.if (message is List<int>): It's raw audio bytes.4. Core Tasks4.1. Permissions and Setup (main.dart)On startup, use permission_handler to request Permission.camera and Permission.microphone.Wrap your MyApp in a ChangeNotifierProvider for the DynamicUiModel.// --- main.dart ---
import 'package.flutter/material.dart';
import 'package:provider/provider.dart';
import 'dynamic_ui_model.dart';
import 'home_screen.dart';

void main() {
// TODO: Add permission handling logic here first
runApp(
ChangeNotifierProvider(
create: (context) => DynamicUiModel(),
child: MyApp(),
),
);
}
// ... (MyApp widget)
4.2. State Management (dynamic_ui_model.dart)This class will hold the list of widgets to be rendered.It MUST have a method to process JSON commands from the WebSocket.This code is provided for you. You must build your UI based on this state.// --- dynamic_ui_model.dart ---
import 'package:flutter/material.dart';
import 'dart:convert';

class DynamicUiModel extends ChangeNotifier {
// A list of JSON objects, each defining a widget
final List<Map<String, dynamic>> _widgetConfigs = [];
List<Map<String, dynamic>> get widgetConfigs => _widgetConfigs;

// Called by the WebSocket listener
void handleCommand(String jsonString) {
try {
final command = jsonDecode(jsonString);

      if (command['type'] == 'ui_command') {
        if (command['action'] == 'add') {
          // Add or update if ID already exists
          _widgetConfigs.removeWhere((w) => w['component_id'] == command['component_id']);
          _widgetConfigs.add(command);
        }
        if (command['action'] == 'remove') {
          _widgetConfigs.removeWhere((w) => w['component_id'] == command['component_id']);
        }
        if (command['action'] == 'clear') {
          _widgetConfigs.clear();
        }
        notifyListeners(); // This tells the UI to rebuild
      }
    } catch (e) {
      print("Failed to handle command: $e");
    }
}
}
4.3. WebSocket & Media Service (home_screen.dart)In your HomeScreen's initState, you must:Initialize WebSocketChannel.connect(...).Initialize just_audio player.Initialize mic_stream and camera controller.1. Sending Media (Client -> Server)Audio: Listen to the mic_stream (ensure it's PCM). On each data chunk, send it:// --- Audio Streaming Logic ---
micStreamSubscription = micStream.listen((audioBytes) {
String base64Audio = base64Encode(audioBytes);
_channel.sink.add(jsonEncode({
"type": "audio_stream",
"payload": base64Audio
}));
});
Video: Listen to controller.startImageStream(). Throttle it (e.g., using a Timer) to ~5 FPS. On each frame, convert to JPEG, base64, and send:// --- Video Streaming Logic (Inside startImageStream) ---
// 1. Convert CameraImage to JPEG (you'll need a helper function/package)
// 2. String base64Video = base64Encode(jpegBytes);
// 3. _channel.sink.add(jsonEncode({
//      "type": "video_stream",
//      "payload": base64Video
//    }));
2. Receiving Media (Server -> Client)This is the most important listener. You MUST check the message type.// --- WebSocket Listener Logic ---
   _channel.stream.listen((message) {
   if (message is String) {
   // It's a JSON command
   Provider.of<DynamicUiModel>(context, listen: false).handleCommand(message);
   } else if (message is List<int>) {
   // It's AI audio bytes (Uint8List)
   // TODO: Pipe these bytes to your just_audio player
   }
   });
   4.4. The Dynamic UI View (home_screen.dart)Your build method must show the CameraPreview in the background.Overlayed on top (e.g., in a ListView), you must render the dynamic widgets.Use a Consumer<DynamicUiModel> to watch for state changes.Implement the "Widget Factory" to build widgets from the JSON state.// --- Flutter UI View (in HomeScreen's build method) ---
   Consumer<DynamicUiModel>(
   builder: (context, model, child) {
   return ListView.builder( // Or a Stack for overlay
   itemCount: model.widgetConfigs.length,
   itemBuilder: (context, index) {
   final config = model.widgetConfigs[index];
   // The "factory" that builds widgets from JSON
   return _buildWidgetFromConfig(config);
   },
   );
   },
   )

// --- The "Widget Factory" ---
Widget _buildWidgetFromConfig(Map<String, dynamic> config) {
final componentType = config['component_type'];
// The 'data' field is a JSON *string*, so you must decode it *again*.
final data = jsonDecode(config['data']);

switch (componentType) {
case 'data_card':
return Card(
child: ListTile(
title: Text(data['title'] ?? 'N/A'),
subtitle: Text(data['value'] ?? 'N/A'),
),
);
case 'note_input':
return Padding(
padding: const EdgeInsets.all(8.0),
child: TextField(
decoration: InputDecoration(
labelText: data['label'] ?? 'New Note',
border: OutlineInputBorder(),
fillColor: Colors.white.withAlpha(200),
filled: true,
),
),
);
case 'alert':
return Container(
color: Colors.red,
child: ListTile(
leading: Icon(Icons.warning, color: Colors.white),
title: Text(data['text'] ?? 'ALERT', style: TextStyle(color: Colors.white)),
),
);
default:
return SizedBox.shrink(); // Hide unknown components
}
}
5. "Hello, World" (Proof of Concept)Your app must be able to handle this flow:App connects to WebSocket and starts streaming audio.The user speaks: "Jarvis, take a note."The WebSocket stream.listen receives a text message (a String).The string is passed to DynamicUiModel.handleCommand().notifyListeners() is called.The Consumer widget rebuilds, and the ListView.builder calls _buildWidgetFromConfig with the new JSON.A TextField (the note_input) must instantly appear on the screen.