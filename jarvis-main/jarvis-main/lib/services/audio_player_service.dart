import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:path_provider/path_provider.dart';
import 'package:just_audio/just_audio.dart';
import 'gemini_live_service.dart';

/// Service to handle audio playback from Gemini Live API
/// Receives PCM audio at 24kHz, 16-bit, mono and plays it
class AudioPlayerService {
  final GeminiLiveService _geminiService;
  final AudioPlayer _audioPlayer = AudioPlayer();
  StreamSubscription<Uint8List>? _audioSubscription;
  final List<Uint8List> _audioBuffer = [];
  bool _isPlaying = false;
  Timer? _playbackTimer;

  AudioPlayerService(this._geminiService) {
    _initializeAudioPlayback();
  }

  /// Initialize audio playback by listening to the Gemini audio stream
  void _initializeAudioPlayback() {
    _audioSubscription = _geminiService.audioOutputStream.listen(
      (audioData) {
        _handleAudioData(audioData);
      },
      onError: (error) {
        print('Error in audio playback stream: $error');
      },
    );
  }

  /// Handle incoming audio data from Gemini
  void _handleAudioData(Uint8List audioData) {
    // Add to buffer
    _audioBuffer.add(audioData);

    // If not currently playing, start playback
    if (!_isPlaying && _audioBuffer.isNotEmpty) {
      _playBufferedAudio();
    }
  }

  /// Play all buffered audio data
  Future<void> _playBufferedAudio() async {
    if (_audioBuffer.isEmpty || _isPlaying) {
      return;
    }

    try {
      _isPlaying = true;

      // Combine all buffered chunks
      final combinedData = _combineAudioChunks(_audioBuffer);
      _audioBuffer.clear();

      // Convert PCM to WAV
      final wavData = _convertPCMtoWAV(combinedData);

      // Save to temporary file
      final tempFile = await _saveTempAudioFile(wavData);

      // Play the audio file
      await _audioPlayer.setFilePath(tempFile.path);
      await _audioPlayer.play();

      // Wait for playback to complete
      await _audioPlayer.playerStateStream.firstWhere(
        (state) => state.processingState == ProcessingState.completed,
      );

      // Delete temporary file
      await tempFile.delete();

      _isPlaying = false;

      // If more audio has been buffered, play it
      if (_audioBuffer.isNotEmpty) {
        _playBufferedAudio();
      }
    } catch (e) {
      print('Error playing audio: $e');
      _isPlaying = false;
    }
  }

  /// Combine multiple audio chunks into a single buffer
  Uint8List _combineAudioChunks(List<Uint8List> chunks) {
    final totalLength = chunks.fold<int>(0, (sum, chunk) => sum + chunk.length);
    final combined = Uint8List(totalLength);
    var offset = 0;

    for (var chunk in chunks) {
      combined.setRange(offset, offset + chunk.length, chunk);
      offset += chunk.length;
    }

    return combined;
  }

  /// Convert PCM audio data to WAV format
  /// Gemini returns 24kHz, 16-bit, mono PCM
  Uint8List _convertPCMtoWAV(Uint8List pcmData) {
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;

    final byteRate = sampleRate * numChannels * bitsPerSample ~/ 8;
    final blockAlign = numChannels * bitsPerSample ~/ 8;
    final dataSize = pcmData.length;

    final header = BytesBuilder();

    // RIFF header
    header.add('RIFF'.codeUnits);
    header.add(_int32ToBytes(36 + dataSize)); // File size - 8
    header.add('WAVE'.codeUnits);

    // fmt chunk
    header.add('fmt '.codeUnits);
    header.add(_int32ToBytes(16)); // fmt chunk size
    header.add(_int16ToBytes(1)); // Audio format (PCM)
    header.add(_int16ToBytes(numChannels));
    header.add(_int32ToBytes(sampleRate));
    header.add(_int32ToBytes(byteRate));
    header.add(_int16ToBytes(blockAlign));
    header.add(_int16ToBytes(bitsPerSample));

    // data chunk
    header.add('data'.codeUnits);
    header.add(_int32ToBytes(dataSize));
    header.add(pcmData);

    return header.toBytes();
  }

  /// Convert 32-bit integer to little-endian bytes
  Uint8List _int32ToBytes(int value) {
    return Uint8List(4)
      ..buffer.asByteData().setInt32(0, value, Endian.little);
  }

  /// Convert 16-bit integer to little-endian bytes
  Uint8List _int16ToBytes(int value) {
    return Uint8List(2)
      ..buffer.asByteData().setInt16(0, value, Endian.little);
  }

  /// Save audio data to a temporary file
  Future<File> _saveTempAudioFile(Uint8List audioData) async {
    final tempDir = await getTemporaryDirectory();
    final tempFile = File('${tempDir.path}/gemini_audio_${DateTime.now().millisecondsSinceEpoch}.wav');
    await tempFile.writeAsBytes(audioData);
    return tempFile;
  }

  /// Stop audio playback and clear buffer
  Future<void> stopPlayback() async {
    try {
      await _audioPlayer.stop();
      _audioBuffer.clear();
      _isPlaying = false;
    } catch (e) {
      print('Error stopping playback: $e');
    }
  }

  /// Dispose of resources
  void dispose() {
    _playbackTimer?.cancel();
    _audioSubscription?.cancel();
    _audioPlayer.dispose();
  }
}
