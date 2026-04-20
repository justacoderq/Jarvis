import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'hud_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Load environment variables
  await dotenv.load(fileName: ".env");

  // Set to fullscreen immersive mode
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);

  // Request permissions
  await _requestPermissions();

  runApp(const MyApp());
}

Future<void> _requestPermissions() async {
  // Request camera and microphone permissions
  final cameraStatus = await Permission.camera.request();
  final microphoneStatus = await Permission.microphone.request();

  if (cameraStatus.isDenied || microphoneStatus.isDenied) {
    print('Permissions denied. The app may not function correctly.');
  }

  if (cameraStatus.isPermanentlyDenied || microphoneStatus.isPermanentlyDenied) {
    print('Permissions permanently denied. Please enable them in settings.');
  }
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'JARVIS',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: Colors.black,
        primaryColor: Colors.cyanAccent,
        colorScheme: ColorScheme.dark(
          primary: Colors.cyanAccent,
          secondary: Colors.blueAccent,
          surface: Colors.black,
        ),
        useMaterial3: true,
      ),
      home: JarvisHUDScreen(
        apiKey: dotenv.env['GEMINI_API_KEY'] ?? '',
        picovoiceKey: dotenv.env['PICOVOICE_ACCESS_KEY'] ?? '',
      ),
    );
  }
}
