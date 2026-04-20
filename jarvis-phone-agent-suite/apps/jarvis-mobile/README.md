# JARVIS

<div align="center">

**An advanced AI-powered voice assistant featuring a Tony Stark-inspired augmented reality interface**

[Demo Video](https://www.youtube.com/shorts/sJgnRn_ejG4)

</div>

---

## Overview

JARVIS is a sophisticated Flutter-based voice assistant that brings the futuristic AI assistant experience to life. Inspired by Tony Stark's iconic AI companion, this application combines cutting-edge voice recognition, artificial intelligence, and an immersive heads-up display (HUD) interface to create a seamless human-computer interaction experience.

The application leverages Google's Gemini AI for intelligent conversational capabilities, Picovoice for wake word detection, and features real-time camera integration for visual context awareness.

## Key Features

- **Voice-Activated AI Assistant** - Intelligent conversational AI powered by Google Gemini for natural language understanding and contextual responses
- **Wake Word Detection** - Hands-free activation using the wake phrase "Jarvis" via Picovoice technology
- **Augmented Reality HUD** - Futuristic heads-up display interface with dynamic visual elements and animations
- **Live Camera Feed** - Real-time camera integration providing visual context for enhanced AI interactions
- **Audio Waveform Visualization** - Real-time audio visualization during voice interactions
- **Task Management System** - Voice-controlled task creation, tracking, and management
- **System Vitals Display** - Comprehensive system status monitoring and information display

## Prerequisites

Before setting up JARVIS, ensure you have the following:

- **Flutter SDK** (version 3.5.4 or higher)
- **Android Device or Emulator** (iOS support coming soon)
- **Google Gemini API Key** - [Get your API key](https://makersuite.google.com/app/apikey)
- **Picovoice Access Key** - [Sign up for Picovoice](https://console.picovoice.ai/)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/JoshTheMenace/jarvis.git
cd jarvis
```

### 2. Install Dependencies

```bash
flutter pub get
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Add your API credentials to the `.env` file:

```env
GEMINI_API_KEY=your_gemini_api_key_here
PICOVOICE_ACCESS_KEY=your_picovoice_access_key_here
```

### 4. Run the Application

```bash
flutter run
```

## Permissions

JARVIS requires the following permissions to function properly:

- **Camera Access** - For real-time visual context and AR overlay
- **Microphone Access** - For voice recognition and wake word detection

These permissions will be requested automatically on first launch.

## Technology Stack

JARVIS is built using modern, production-ready technologies:

- **[Flutter](https://flutter.dev/)** - Cross-platform mobile development framework
- **[Google Gemini AI](https://deepmind.google/technologies/gemini/)** - Advanced conversational AI and natural language processing
- **[Picovoice](https://picovoice.ai/)** - On-device wake word detection and voice recognition
- **WebSocket** - Real-time bidirectional communication
- **[Just Audio](https://pub.dev/packages/just_audio)** - High-performance audio playback
- **[Camera Plugin](https://pub.dev/packages/camera)** - Native camera integration

## Architecture

The application follows a clean architecture pattern with separation of concerns:

- **Presentation Layer** - Flutter UI components with custom HUD widgets
- **Business Logic Layer** - State management and application logic
- **Data Layer** - API integrations and data handling
- **Services** - Voice recognition, AI processing, and camera management

## Contributing

Contributions are welcome! If you'd like to contribute to JARVIS, please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is available for educational and personal use.

## Acknowledgments

- Inspired by the JARVIS AI system from the Marvel Cinematic Universe
- Built with Flutter and powered by Google's Gemini AI
- Wake word detection by Picovoice

---

<div align="center">

**Built with ❤️ using Flutter**

</div>
