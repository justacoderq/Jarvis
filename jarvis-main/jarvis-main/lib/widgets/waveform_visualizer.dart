import 'package:flutter/material.dart';
import 'dart:math';

/// Animated waveform visualizer that shows when Jarvis is listening
class WaveformVisualizer extends StatefulWidget {
  final bool isActive;
  final double audioLevel; // 0.0 to 1.0

  const WaveformVisualizer({
    super.key,
    required this.isActive,
    this.audioLevel = 0.0,
  });

  @override
  State<WaveformVisualizer> createState() => _WaveformVisualizerState();
}

class _WaveformVisualizerState extends State<WaveformVisualizer>
    with SingleTickerProviderStateMixin {
  late AnimationController _animationController;
  final Random _random = Random();
  List<double> _barHeights = [];
  final int _barCount = 40;

  @override
  void initState() {
    super.initState();
    _barHeights = List.generate(_barCount, (index) => 0.2);

    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 100),
    )..addListener(() {
        if (widget.isActive) {
          setState(() {
            _updateBarHeights();
          });
        }
      });

    if (widget.isActive) {
      _animationController.repeat();
    }
  }

  @override
  void didUpdateWidget(WaveformVisualizer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isActive && !_animationController.isAnimating) {
      _animationController.repeat();
    } else if (!widget.isActive && _animationController.isAnimating) {
      _animationController.stop();
      setState(() {
        _barHeights = List.generate(_barCount, (index) => 0.1);
      });
    }
  }

  void _updateBarHeights() {
    // Create a wave pattern that responds to audio level
    final baseLevel = widget.audioLevel.clamp(0.0, 1.0);

    for (int i = 0; i < _barCount; i++) {
      // Create a wave pattern
      final wave = sin((i / _barCount) * pi * 2 + _animationController.value * pi * 2);

      // Combine wave with randomness and audio level
      final randomFactor = _random.nextDouble() * 0.3;
      final height = (baseLevel * 0.5 + 0.2) * (wave * 0.5 + 0.5) + randomFactor;

      _barHeights[i] = height.clamp(0.1, 1.0);
    }
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.isActive) {
      return const SizedBox.shrink();
    }

    return Container(
      height: 80,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.7),
        border: Border.all(
          color: Colors.cyanAccent.withOpacity(0.3),
          width: 1,
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          // Listening indicator
          Container(
            margin: const EdgeInsets.only(right: 12),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: Colors.red,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.red.withOpacity(0.5),
                        blurRadius: 8,
                        spreadRadius: 2,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  'LISTENING',
                  style: TextStyle(
                    color: Colors.cyanAccent,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1.5,
                    fontFamily: 'monospace',
                  ),
                ),
              ],
            ),
          ),

          // Waveform bars
          Expanded(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: List.generate(_barCount, (index) {
                return Flexible(
                  child: Container(
                    width: 3,
                    height: _barHeights[index] * 50,
                    margin: const EdgeInsets.symmetric(horizontal: 0.5),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.bottomCenter,
                        end: Alignment.topCenter,
                        colors: [
                          Colors.cyanAccent,
                          Colors.cyanAccent.withOpacity(0.3),
                        ],
                      ),
                      borderRadius: BorderRadius.circular(2),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.cyanAccent.withOpacity(0.3),
                          blurRadius: 2,
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }
}
