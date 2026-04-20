import 'dart:async';
import 'dart:typed_data';
import 'package:camera/camera.dart';
import 'package:image/image.dart' as img;

/// Service to capture and process camera frames for streaming to Gemini
class CameraFrameService {
  StreamSubscription<CameraImage>? _imageStreamSubscription;
  bool _isCapturing = false;
  Timer? _throttleTimer;
  bool _canSendFrame = true;
  int _framesSentThisTurn = 0;
  int _maxFramesPerTurn = 4; // Limit frames to avoid buffer buildup

  /// Start capturing frames using image stream (MUCH faster than takePicture)
  Future<void> startCapturing({
    required CameraController cameraController,
    required Function(Uint8List) onFrameCaptured,
    int intervalMs = 1000,
  }) async {
    if (_isCapturing) return;

    if (!cameraController.value.isInitialized) {
      throw Exception('Camera not initialized');
    }

    _isCapturing = true;
    _canSendFrame = true;
    _framesSentThisTurn = 0; // Reset frame counter

    print('Starting camera frame capture (${intervalMs}ms interval, max $_maxFramesPerTurn frames)');

    // Throttle frame sending
    _throttleTimer = Timer.periodic(
      Duration(milliseconds: intervalMs),
      (_) {
        _canSendFrame = true;
      },
    );

    // Start image stream
    await cameraController.startImageStream((CameraImage image) {
      // Check if we can send and haven't exceeded frame limit
      if (!_canSendFrame || _framesSentThisTurn >= _maxFramesPerTurn) return;
      _canSendFrame = false;

      // Process image in background
      _processCameraImage(image).then((bytes) {
        if (bytes != null) {
          _framesSentThisTurn++;
          print('Sent frame $_framesSentThisTurn/$_maxFramesPerTurn');
          onFrameCaptured(bytes);
        }
      }).catchError((e) {
        print('Error processing camera image: $e');
      });
    });
  }

  /// Convert CameraImage to JPEG bytes
  Future<Uint8List?> _processCameraImage(CameraImage image) async {
    try {
      // Convert YUV420 or BGRA8888 to RGB
      img.Image? imgLib;

      if (image.format.group == ImageFormatGroup.yuv420) {
        imgLib = _convertYUV420ToImage(image);
      } else if (image.format.group == ImageFormatGroup.bgra8888) {
        imgLib = _convertBGRA8888ToImage(image);
      } else {
        print('Unsupported image format: ${image.format.group}');
        return null;
      }

      if (imgLib == null) return null;

      // Resize to reduce bandwidth (640x480 is good for AI analysis)
      final resized = img.copyResize(
        imgLib,
        width: 640,
        height: 480,
      );

      // Encode as JPEG with moderate quality
      final jpeg = img.encodeJpg(resized, quality: 70);

      return Uint8List.fromList(jpeg);
    } catch (e) {
      print('Error in _processCameraImage: $e');
      return null;
    }
  }

  /// Convert YUV420 to RGB image
  img.Image? _convertYUV420ToImage(CameraImage image) {
    final int width = image.width;
    final int height = image.height;

    final int uvRowStride = image.planes[1].bytesPerRow;
    final int uvPixelStride = image.planes[1].bytesPerPixel ?? 1;

    final imgLib = img.Image(width: width, height: height);

    for (int y = 0; y < height; y++) {
      for (int x = 0; x < width; x++) {
        final int uvIndex = uvPixelStride * (x ~/ 2) + uvRowStride * (y ~/ 2);
        final int index = y * width + x;

        final yp = image.planes[0].bytes[index];
        final up = image.planes[1].bytes[uvIndex];
        final vp = image.planes[2].bytes[uvIndex];

        // Convert YUV to RGB
        int r = (yp + vp * 1436 / 1024 - 179).round().clamp(0, 255);
        int g = (yp - up * 46549 / 131072 + 44 - vp * 93604 / 131072 + 91)
            .round()
            .clamp(0, 255);
        int b = (yp + up * 1814 / 1024 - 227).round().clamp(0, 255);

        imgLib.setPixelRgb(x, y, r, g, b);
      }
    }

    return imgLib;
  }

  /// Convert BGRA8888 to RGB image
  img.Image? _convertBGRA8888ToImage(CameraImage image) {
    final imgLib = img.Image.fromBytes(
      width: image.width,
      height: image.height,
      bytes: image.planes[0].bytes.buffer,
      order: img.ChannelOrder.bgra, // Important: BGRA format
    );

    return imgLib;
  }

  /// Stop capturing frames
  Future<void> stopCapturing(CameraController cameraController) async {
    if (!_isCapturing) return;

    print('Stopping camera frame capture');

    _throttleTimer?.cancel();
    _throttleTimer = null;

    try {
      await cameraController.stopImageStream();
    } catch (e) {
      print('Error stopping image stream: $e');
    }

    _isCapturing = false;
  }

  bool get isCapturing => _isCapturing;

  /// Reset frame counter to allow sending new frames for a new turn
  void resetFrameCounter() {
    _framesSentThisTurn = 0;
    _canSendFrame = true;
    print('Frame counter reset - ready for new turn');
  }

  Future<void> dispose(CameraController? cameraController) async {
    if (cameraController != null && _isCapturing) {
      await stopCapturing(cameraController);
    }
  }
}
