import React, { useEffect, useRef, useState } from 'react';

/**
 * AudioWaveform - Real-time audio visualization component
 *
 * Displays animated bars that react to audio levels from a MediaStream.
 * Used to confirm microphone is working during recording.
 *
 * Can be used:
 * 1. As a React component in the main recording UI
 * 2. Via renderWaveformToElement() for PiP windows (raw DOM)
 */

interface AudioWaveformProps {
  stream: MediaStream | null;
  barCount?: number;
  className?: string;
  barColor?: string;
  barWidth?: number;
  gap?: number;
  minHeight?: number;
  maxHeight?: number;
}

// Audio level data for each bar
interface AudioLevels {
  levels: number[];
  isActive: boolean;
}

/**
 * Hook to analyze audio from a MediaStream
 * Returns normalized levels (0-1) for each frequency band
 */
export function useAudioAnalyzer(stream: MediaStream | null, barCount: number = 4): AudioLevels {
  const [levels, setLevels] = useState<number[]>(Array(barCount).fill(0));
  const [isActive, setIsActive] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stream) {
      setLevels(Array(barCount).fill(0));
      setIsActive(false);
      return;
    }

    // Check if stream has audio tracks
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setLevels(Array(barCount).fill(0));
      setIsActive(false);
      return;
    }

    // Create audio context and analyzer
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64; // Small FFT for quick response
      analyser.smoothingTimeConstant = 0.4; // Some smoothing for natural look

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
      setIsActive(true);

      // Animation loop to update levels
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevels = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);

        // Divide frequency bins into barCount groups and get average for each
        const binSize = Math.floor(dataArray.length / barCount);
        const newLevels: number[] = [];

        for (let i = 0; i < barCount; i++) {
          let sum = 0;
          for (let j = 0; j < binSize; j++) {
            sum += dataArray[i * binSize + j];
          }
          // Normalize to 0-1 range
          newLevels.push(sum / (binSize * 255));
        }

        setLevels(newLevels);
        animationFrameRef.current = requestAnimationFrame(updateLevels);
      };

      updateLevels();
    } catch {
      setIsActive(false);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [stream, barCount]);

  return { levels, isActive };
}

/**
 * React component for audio waveform visualization
 */
export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  stream,
  barCount = 4,
  className = '',
  barColor = '#ef4444', // Red by default
  barWidth = 4,
  gap = 3,
  minHeight = 4,
  maxHeight = 24,
}) => {
  const { levels, isActive } = useAudioAnalyzer(stream, barCount);

  if (!isActive) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <span className="text-gray-500 text-xs">No audio</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-end ${className}`}
      style={{ gap: `${gap}px`, height: `${maxHeight}px` }}
    >
      {levels.map((level, index) => (
        <div
          key={index}
          style={{
            width: `${barWidth}px`,
            height: `${Math.max(minHeight, level * maxHeight)}px`,
            backgroundColor: barColor,
            borderRadius: '2px',
            transition: 'height 0.05s ease-out',
          }}
        />
      ))}
    </div>
  );
};

/**
 * Create a standalone waveform analyzer that can update DOM elements
 * Used for PiP window which doesn't have React
 */
export function createWaveformAnalyzer(
  stream: MediaStream,
  barCount: number = 4
): {
  getLevels: () => number[];
  isActive: () => boolean;
  cleanup: () => void;
} {
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let animationFrame: number | null = null;
  const currentLevels: number[] = Array(barCount).fill(0);
  let active = false;

  // Check if stream has audio
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    return {
      getLevels: () => currentLevels,
      isActive: () => false,
      cleanup: () => {},
    };
  }

  try {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.4;

    source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    active = true;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateLevels = () => {
      if (!analyser) return;

      analyser.getByteFrequencyData(dataArray);

      const binSize = Math.floor(dataArray.length / barCount);

      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        for (let j = 0; j < binSize; j++) {
          sum += dataArray[i * binSize + j];
        }
        currentLevels[i] = sum / (binSize * 255);
      }

      animationFrame = requestAnimationFrame(updateLevels);
    };

    updateLevels();
  } catch {
    // Failed to create waveform analyzer
  }

  return {
    getLevels: () => [...currentLevels],
    isActive: () => active,
    cleanup: () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      if (source) {
        source.disconnect();
      }
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
      }
    },
  };
}

/**
 * Render waveform bars to a DOM element (for PiP window)
 * Call this in an animation loop with getLevels() from createWaveformAnalyzer
 */
export function renderWaveformBars(
  container: HTMLElement,
  levels: number[],
  options: {
    barColor?: string;
    barWidth?: number;
    gap?: number;
    minHeight?: number;
    maxHeight?: number;
  } = {}
): void {
  const { barColor = '#ef4444', barWidth = 4, gap = 3, minHeight = 4, maxHeight = 24 } = options;

  // Create or update bars
  let bars = container.querySelectorAll('.waveform-bar') as NodeListOf<HTMLDivElement>;

  if (bars.length !== levels.length) {
    // Recreate bars if count changed
    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.alignItems = 'flex-end';
    container.style.gap = `${gap}px`;
    container.style.height = `${maxHeight}px`;

    levels.forEach(() => {
      const bar = document.createElement('div');
      bar.className = 'waveform-bar';
      bar.style.width = `${barWidth}px`;
      bar.style.backgroundColor = barColor;
      bar.style.borderRadius = '2px';
      bar.style.transition = 'height 0.05s ease-out';
      container.appendChild(bar);
    });

    bars = container.querySelectorAll('.waveform-bar') as NodeListOf<HTMLDivElement>;
  }

  // Update bar heights
  bars.forEach((bar, index) => {
    const height = Math.max(minHeight, levels[index] * maxHeight);
    bar.style.height = `${height}px`;
  });
}

export default AudioWaveform;
