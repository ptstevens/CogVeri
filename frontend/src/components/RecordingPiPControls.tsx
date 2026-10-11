import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createWaveformAnalyzer, renderWaveformBars } from './AudioWaveform';

/**
 * RecordingPiPControls - Loom-inspired dark theme recording controls
 *
 * Provides an always-on-top window with recording controls using the
 * Document Picture-in-Picture API. Features:
 * - Dark theme matching Loom's professional look
 * - Real-time audio waveform visualization
 * - Compact and expanded modes
 * - Callback to notify parent when PiP is active
 *
 * Browser Support: Chrome 116+, Edge 116+
 * Fallback: Displays inline controls for unsupported browsers
 */

interface RecordingPiPControlsProps {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onMinimize?: () => void;
  autoOpen?: boolean;
  safeMinutes?: number;
  mediaStream?: MediaStream | null;
  webcamStream?: MediaStream | null; // Optional webcam stream for preview
  onPiPStateChange?: (isActive: boolean) => void;
}

// Extend Window interface for Document Picture-in-Picture
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow: (options: { width: number; height: number }) => Promise<Window>;
      window: Window | null;
    };
  }
}

// Inline styles for PiP window (no external dependencies)
const PIP_STYLES = `
  :root {
    --pip-bg: #111827;
    --pip-bg-secondary: #1f2937;
    --pip-text: #ffffff;
    --pip-text-muted: #9ca3af;
    --pip-accent: #ef4444;
    --pip-accent-glow: rgba(239, 68, 68, 0.5);
    --pip-safe: #14b8a6;
    --pip-pause: #f59e0b;
    --pip-btn-bg: rgba(255, 255, 255, 0.1);
    --pip-btn-hover: rgba(255, 255, 255, 0.2);
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    background: var(--pip-bg);
    color: var(--pip-text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
    height: 100vh;
  }

  .pip-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 16px;
  }

  .pip-container.minimized {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
  }

  .pip-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .pip-status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pip-dot {
    width: 10px;
    height: 10px;
    background: var(--pip-accent);
    border-radius: 50%;
    box-shadow: 0 0 12px var(--pip-accent-glow), 0 0 24px var(--pip-accent-glow);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .pip-dot.paused {
    background: var(--pip-pause);
    box-shadow: 0 0 12px rgba(245, 158, 11, 0.5);
    animation: none;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.1); }
  }

  .pip-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--pip-accent);
  }

  .pip-label.paused {
    color: var(--pip-pause);
  }

  .pip-timer-section {
    text-align: center;
    margin-bottom: 16px;
  }

  .pip-timer {
    font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    font-size: 32px;
    font-weight: 700;
    letter-spacing: 2px;
  }

  .pip-timer.minimized {
    font-size: 16px;
    letter-spacing: 1px;
  }

  .pip-waveform {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 4px;
    height: 32px;
    margin-bottom: 16px;
  }

  .pip-waveform.minimized {
    height: 20px;
    margin-bottom: 0;
    margin-left: 12px;
  }

  .pip-safe {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 12px;
    color: var(--pip-safe);
    margin-bottom: 16px;
  }

  .pip-safe.minimized {
    margin-bottom: 0;
    margin-left: auto;
    margin-right: 8px;
  }

  .pip-buttons {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }

  .pip-buttons.minimized {
    margin-bottom: 0;
    gap: 4px;
  }

  .pip-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 16px;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .pip-btn.minimized {
    flex: none;
    padding: 6px 10px;
    font-size: 14px;
    border-radius: 6px;
  }

  .pip-btn-pause {
    background: var(--pip-pause);
    color: white;
  }

  .pip-btn-pause:hover {
    background: #d97706;
  }

  .pip-btn-resume {
    background: var(--pip-safe);
    color: white;
  }

  .pip-btn-resume:hover {
    background: #0d9488;
  }

  .pip-btn-stop {
    background: linear-gradient(135deg, #dc2626, #b91c1c);
    color: white;
  }

  .pip-btn-stop:hover {
    background: linear-gradient(135deg, #b91c1c, #991b1b);
  }

  .pip-footer {
    margin-top: auto;
    text-align: center;
  }

  .pip-minimize-btn {
    width: 100%;
    padding: 8px;
    background: var(--pip-bg-secondary);
    border: none;
    border-radius: 6px;
    color: var(--pip-text-muted);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
    margin-bottom: 8px;
  }

  .pip-minimize-btn:hover {
    background: var(--pip-btn-bg);
    color: var(--pip-text);
  }

  .pip-shortcuts {
    font-size: 10px;
    color: var(--pip-text-muted);
  }

  .pip-expand-btn {
    padding: 6px 8px;
    background: var(--pip-btn-bg);
    border: none;
    border-radius: 4px;
    color: var(--pip-text-muted);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .pip-expand-btn:hover {
    background: var(--pip-btn-hover);
    color: var(--pip-text);
  }

  /* Webcam Preview */
  .pip-webcam-container {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 10;
  }

  .pip-webcam {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid var(--pip-text);
    background: var(--pip-bg-secondary);
    transform: scaleX(-1);
  }

  .pip-webcam.minimized {
    width: 40px;
    height: 40px;
  }

  .pip-webcam-container.minimized {
    position: static;
    margin-left: auto;
  }
`;

export const RecordingPiPControls: React.FC<RecordingPiPControlsProps> = ({
  isRecording,
  isPaused,
  duration,
  onPause,
  onResume,
  onStop,
  autoOpen = false,
  safeMinutes,
  mediaStream,
  webcamStream,
  onPiPStateChange,
}) => {
  const [pipSupported, setPipSupported] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true); // Start minimized for compact view
  const pipWindowRef = useRef<Window | null>(null);
  const hasAutoOpenedRef = useRef(false);
  const waveformAnalyzerRef = useRef<ReturnType<typeof createWaveformAnalyzer> | null>(null);
  const waveformAnimationRef = useRef<number | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);

  // Store callbacks in refs to avoid stale closures in event handlers
  const onPauseRef = useRef(onPause);
  const onResumeRef = useRef(onResume);
  const onStopRef = useRef(onStop);
  const isPausedRef = useRef(isPaused);
  const webcamStreamRef = useRef(webcamStream);

  // Keep refs updated
  useEffect(() => {
    onPauseRef.current = onPause;
    onResumeRef.current = onResume;
    onStopRef.current = onStop;
    isPausedRef.current = isPaused;
    webcamStreamRef.current = webcamStream;
  }, [onPause, onResume, onStop, isPaused, webcamStream]);

  // Check for PiP support
  useEffect(() => {
    const supported = 'documentPictureInPicture' in window;
    setPipSupported(supported);
  }, []);

  // Notify parent of PiP state changes
  useEffect(() => {
    onPiPStateChange?.(pipActive);
  }, [pipActive, onPiPStateChange]);

  // Format duration
  const formatDuration = useCallback((seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Render PiP controls - only called on initial open or layout changes
  const renderPiPControls = useCallback(
    (pipWindow: Window, minimized: boolean, paused: boolean) => {
      const doc = pipWindow.document;
      doc.body.innerHTML = '';
      doc.head.innerHTML = '';

      // Add styles
      const styleEl = doc.createElement('style');
      styleEl.textContent = PIP_STYLES;
      doc.head.appendChild(styleEl);

      // Determine platform for keyboard shortcut hints
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? '⌘⇧' : 'Ctrl+Shift+';

      const container = doc.createElement('div');
      container.className = `pip-container${minimized ? ' minimized' : ''}`;

      if (minimized) {
        container.innerHTML = `
        <div class="pip-status">
          <div id="pip-dot" class="pip-dot${paused ? ' paused' : ''}"></div>
          <span id="pip-timer" class="pip-timer minimized">${formatDuration(duration)}</span>
          <div id="pip-waveform" class="pip-waveform minimized"></div>
        </div>
        <div id="pip-safe" class="pip-safe minimized" style="display: none;">
          <span>🔒</span>
          <span id="pip-safe-text">0m</span>
        </div>
        <div class="pip-buttons minimized">
          <button id="pip-toggle-pause" class="pip-btn minimized ${paused ? 'pip-btn-resume' : 'pip-btn-pause'}">
            ${paused ? '▶' : '⏸'}
          </button>
          <button id="pip-stop" class="pip-btn minimized pip-btn-stop">⏹</button>
          <button id="pip-expand" class="pip-expand-btn">⬆</button>
          <div class="pip-webcam-container minimized">
            <video id="pip-webcam" class="pip-webcam minimized" autoplay playsinline muted></video>
          </div>
        </div>
      `;
      } else {
        container.innerHTML = `
        <div class="pip-webcam-container">
          <video id="pip-webcam" class="pip-webcam" autoplay playsinline muted></video>
        </div>

        <div class="pip-header">
          <div class="pip-status">
            <div id="pip-dot" class="pip-dot${paused ? ' paused' : ''}"></div>
            <span id="pip-label" class="pip-label${paused ? ' paused' : ''}">${paused ? 'Paused' : 'Recording'}</span>
          </div>
        </div>

        <div class="pip-timer-section">
          <div id="pip-timer" class="pip-timer">${formatDuration(duration)}</div>
        </div>

        <div id="pip-waveform" class="pip-waveform"></div>

        <div id="pip-safe" class="pip-safe" style="display: none;">
          <span>🔒</span>
          <span id="pip-safe-text">Starting upload...</span>
        </div>

        <div class="pip-buttons">
          <button id="pip-toggle-pause" class="pip-btn ${paused ? 'pip-btn-resume' : 'pip-btn-pause'}">
            ${paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button id="pip-stop" class="pip-btn pip-btn-stop">
            ⏹ Stop
          </button>
        </div>

        <div class="pip-footer">
          <button id="pip-minimize" class="pip-minimize-btn">⬇ Minimize</button>
          <div class="pip-shortcuts">${modKey}P pause • ${modKey}S stop</div>
        </div>
      `;
      }

      doc.body.appendChild(container);

      // Set up event listeners using refs to avoid stale closures
      const togglePauseBtn = doc.getElementById('pip-toggle-pause');
      const stopBtn = doc.getElementById('pip-stop');
      const minimizeBtn = doc.getElementById('pip-minimize');
      const expandBtn = doc.getElementById('pip-expand');

      if (togglePauseBtn) {
        togglePauseBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isPausedRef.current) {
            onResumeRef.current();
          } else {
            onPauseRef.current();
          }
        });
      }

      if (stopBtn) {
        // Store reference to main window before PiP context
        const mainWindow = window;
        stopBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          onStopRef.current();
          pipWindow.close();
          // Try to focus main tab (may be blocked by browser, but works in most cases)
          try {
            mainWindow.focus();
          } catch (err) {
            // Browser may block focus - that's okay
          }
        });
      }

      if (minimizeBtn) {
        minimizeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsMinimized(true);
        });
      }

      if (expandBtn) {
        expandBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsMinimized(false);
        });
      }

      // Start waveform animation
      const waveformContainer = doc.getElementById('pip-waveform');
      if (waveformContainer && waveformAnalyzerRef.current) {
        const animate = () => {
          if (!waveformAnalyzerRef.current || !pipWindowRef.current) return;

          const levels = waveformAnalyzerRef.current.getLevels();
          renderWaveformBars(waveformContainer, levels, {
            barColor: isPausedRef.current ? '#f59e0b' : '#ef4444',
            maxHeight: minimized ? 16 : 24,
            barWidth: minimized ? 3 : 5,
          });

          waveformAnimationRef.current = requestAnimationFrame(animate);
        };
        animate();
      }

      // Set up webcam preview if available
      const webcamVideo = doc.getElementById('pip-webcam') as HTMLVideoElement;
      if (webcamVideo && webcamStreamRef.current) {
        webcamVideo.srcObject = webcamStreamRef.current;
        webcamVideo.style.display = 'block';
        webcamVideoRef.current = webcamVideo;
      } else if (webcamVideo) {
        // Hide webcam container if no stream
        webcamVideo.style.display = 'none';
        const container = webcamVideo.parentElement;
        if (container) container.style.display = 'none';
      }
    },
    [formatDuration, duration]
  );

  // Open PiP window
  const openPiPWindow = useCallback(async () => {
    if (!window.documentPictureInPicture) return;

    try {
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 320,
        height: isMinimized ? 56 : 240,
      });

      pipWindowRef.current = pipWindow;
      setPipActive(true);

      // Set up waveform if we have a stream
      if (mediaStream) {
        waveformAnalyzerRef.current = createWaveformAnalyzer(mediaStream, 4);
      }

      renderPiPControls(pipWindow, isMinimized, isPaused);

      pipWindow.addEventListener('pagehide', () => {
        setPipActive(false);
        pipWindowRef.current = null;
        if (waveformAnimationRef.current) {
          cancelAnimationFrame(waveformAnimationRef.current);
        }
        if (waveformAnalyzerRef.current) {
          waveformAnalyzerRef.current.cleanup();
          waveformAnalyzerRef.current = null;
        }
      });
    } catch {
      setPipActive(false);
    }
  }, [isMinimized, isPaused, mediaStream, renderPiPControls]);

  // Re-render when minimize state changes (requires layout change)
  useEffect(() => {
    if (pipActive && pipWindowRef.current) {
      // Close and reopen with new size
      const currentWindow = pipWindowRef.current;
      currentWindow.close();
      // Small delay to ensure window is closed
      setTimeout(() => {
        openPiPWindow();
      }, 50);
    }
  }, [isMinimized]); // Only on minimize change

  // Update pause state visually without full re-render
  useEffect(() => {
    if (!pipActive || !pipWindowRef.current) return;

    const doc = pipWindowRef.current.document;
    const dot = doc.getElementById('pip-dot');
    const label = doc.getElementById('pip-label');
    const toggleBtn = doc.getElementById('pip-toggle-pause');

    if (dot) {
      dot.className = `pip-dot${isPaused ? ' paused' : ''}`;
    }
    if (label) {
      label.className = `pip-label${isPaused ? ' paused' : ''}`;
      label.textContent = isPaused ? 'Paused' : 'Recording';
    }
    if (toggleBtn) {
      toggleBtn.className = `pip-btn ${isMinimized ? 'minimized ' : ''}${isPaused ? 'pip-btn-resume' : 'pip-btn-pause'}`;
      toggleBtn.textContent = isMinimized
        ? isPaused
          ? '▶'
          : '⏸'
        : isPaused
          ? '▶ Resume'
          : '⏸ Pause';
    }
  }, [isPaused, pipActive, isMinimized]);

  // Update timer only (no re-render)
  useEffect(() => {
    if (pipActive && pipWindowRef.current) {
      const timerEl = pipWindowRef.current.document.getElementById('pip-timer');
      if (timerEl) {
        timerEl.textContent = formatDuration(duration);
      }
    }
  }, [duration, pipActive, formatDuration]);

  // Update safe minutes only (no re-render)
  useEffect(() => {
    if (pipActive && pipWindowRef.current && safeMinutes !== undefined) {
      const safeEl = pipWindowRef.current.document.getElementById('pip-safe');
      const safeTextEl = pipWindowRef.current.document.getElementById('pip-safe-text');
      if (safeEl) {
        safeEl.style.display = 'flex';
      }
      if (safeTextEl) {
        safeTextEl.textContent = isMinimized
          ? `${safeMinutes}m`
          : safeMinutes > 0
            ? `${safeMinutes} min safely uploaded`
            : 'Starting upload...';
      }
    }
  }, [safeMinutes, pipActive, isMinimized]);

  // Auto-open PiP
  useEffect(() => {
    if (autoOpen && isRecording && !pipActive && pipSupported && !hasAutoOpenedRef.current) {
      hasAutoOpenedRef.current = true;
      openPiPWindow();
    }
    if (!isRecording) {
      hasAutoOpenedRef.current = false;
    }
  }, [autoOpen, isRecording, pipActive, pipSupported, openPiPWindow]);

  // Close PiP when recording stops
  useEffect(() => {
    if (!isRecording && pipWindowRef.current) {
      pipWindowRef.current.close();
    }
  }, [isRecording]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (pipWindowRef.current) {
        pipWindowRef.current.close();
      }
      if (waveformAnimationRef.current) {
        cancelAnimationFrame(waveformAnimationRef.current);
      }
      if (waveformAnalyzerRef.current) {
        waveformAnalyzerRef.current.cleanup();
      }
    };
  }, []);

  // Determine platform for shortcut hints
  const isMac =
    typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? '⌘⇧' : 'Ctrl+Shift+';

  // Fallback controls for unsupported browsers (dark theme)
  if (!pipSupported) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80">
        <div className="bg-gray-900 rounded-xl shadow-2xl p-4 border border-gray-800">
          <div className="text-xs text-amber-400 bg-amber-900/30 border border-amber-700/50 rounded-lg px-2 py-1 mb-3">
            ⚠️ Floating controls not supported in this browser
          </div>

          <div className="flex items-center gap-2 mb-3">
            <div
              className={`w-2.5 h-2.5 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{
                boxShadow: isPaused
                  ? '0 0 12px rgba(245, 158, 11, 0.5)'
                  : '0 0 12px rgba(239, 68, 68, 0.5)',
              }}
            />
            <span
              className={`text-xs font-semibold uppercase ${isPaused ? 'text-amber-500' : 'text-red-500'}`}
            >
              {isPaused ? 'Paused' : 'Recording'}
            </span>
          </div>

          <div className="text-2xl font-mono font-bold text-white text-center mb-4">
            {formatDuration(duration)}
          </div>

          {safeMinutes !== undefined && (
            <div className="flex items-center justify-center gap-2 text-primary-400 text-sm mb-4">
              <span>🔒</span>
              <span>
                {safeMinutes > 0 ? `${safeMinutes} min safely uploaded` : 'Starting upload...'}
              </span>
            </div>
          )}

          <div className="flex gap-2 mb-3">
            <button
              onClick={isPaused ? onResume : onPause}
              className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-all ${
                isPaused ? 'bg-primary-500 hover:bg-primary-600' : 'bg-amber-500 hover:bg-amber-600'
              } text-white`}
            >
              {isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button
              onClick={onStop}
              className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-medium transition-all"
            >
              ⏹ Stop
            </button>
          </div>

          <div className="text-center text-xs text-gray-500">
            {modKey}P pause • {modKey}S stop
          </div>
        </div>
      </div>
    );
  }

  // Main render - button to open PiP
  return (
    <div className="fixed bottom-4 right-4 z-[9999]">
      {!pipActive && isRecording && (
        <button
          onClick={openPiPWindow}
          className="bg-gray-900 hover:bg-gray-800 text-white px-5 py-3 rounded-xl shadow-lg font-medium transition-all border border-gray-700 flex items-center gap-3"
        >
          <div
            className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"
            style={{ boxShadow: '0 0 12px rgba(239, 68, 68, 0.5)' }}
          />
          <span>Open Recording Controls</span>
        </button>
      )}
      {pipActive && (
        <div className="bg-gray-900 text-primary-400 px-4 py-2 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 border border-gray-700">
          <span>✓</span>
          <span>Controls active</span>
        </div>
      )}
    </div>
  );
};

export default RecordingPiPControls;
