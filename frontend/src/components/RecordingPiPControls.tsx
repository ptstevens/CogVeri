import React, { useEffect, useRef, useState } from 'react';

/**
 * RecordingPiPControls - Global recording controls using Document Picture-in-Picture API
 *
 * Provides an always-on-top window with recording controls that work across all screens
 * and applications. This solves the problem of losing control visibility when recording
 * fullscreen apps or switching between windows.
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
  autoOpen?: boolean; // Auto-open PiP window when recording starts
}

// Extend Window interface to include documentPictureInPicture
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow: (options: { width: number; height: number }) => Promise<Window>;
      window: Window | null;
    };
  }
}

export const RecordingPiPControls: React.FC<RecordingPiPControlsProps> = ({
  isRecording,
  isPaused,
  duration,
  onPause,
  onResume,
  onStop,
  onMinimize,
  autoOpen = false,
}) => {
  const [pipSupported, setPipSupported] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const pipWindowRef = useRef<Window | null>(null);
  const hasAutoOpenedRef = useRef(false); // Track if we've already auto-opened for this recording session

  // Check for Document Picture-in-Picture API support
  useEffect(() => {
    const supported = 'documentPictureInPicture' in window;
    setPipSupported(supported);
    console.log('Document Picture-in-Picture supported:', supported);
  }, []);

  // Format duration as HH:MM:SS or MM:SS
  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Copy stylesheets from main window to PiP window
  const copyStylesToPiP = (pipWindow: Window) => {
    try {
      // Copy all external stylesheets
      const stylesheets = Array.from(document.styleSheets);

      stylesheets.forEach((styleSheet) => {
        try {
          if (styleSheet.href) {
            // External stylesheet - create link element
            const linkElement = pipWindow.document.createElement('link');
            linkElement.rel = 'stylesheet';
            linkElement.href = styleSheet.href;
            pipWindow.document.head.appendChild(linkElement);
          } else if (styleSheet.cssRules) {
            // Inline stylesheet - copy rules
            const cssText = Array.from(styleSheet.cssRules)
              .map(rule => rule.cssText)
              .join('\n');

            const styleElement = pipWindow.document.createElement('style');
            styleElement.textContent = cssText;
            pipWindow.document.head.appendChild(styleElement);
          }
        } catch (e) {
          // Some stylesheets may have CORS issues - skip them
          console.warn('Could not copy stylesheet:', e);
        }
      });

      // Add Tailwind CSS CDN as fallback to ensure styling works
      const tailwindLink = pipWindow.document.createElement('link');
      tailwindLink.rel = 'stylesheet';
      tailwindLink.href = 'https://cdn.jsdelivr.net/npm/tailwindcss@3.3.0/dist/tailwind.min.css';
      pipWindow.document.head.appendChild(tailwindLink);
    } catch (error) {
      console.error('Error copying styles to PiP window:', error);
    }
  };

  // Create and populate PiP window
  const openPiPWindow = async () => {
    if (!window.documentPictureInPicture) {
      console.error('Document Picture-in-Picture not supported');
      return;
    }

    try {
      // Request PiP window with appropriate dimensions
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 360,
        height: isMinimized ? 72 : 280,
      });

      pipWindowRef.current = pipWindow;
      setPipActive(true);

      // Copy styles to PiP window
      copyStylesToPiP(pipWindow);

      // Create controls HTML
      renderPiPControls(pipWindow);

      // Handle PiP window closure
      pipWindow.addEventListener('pagehide', () => {
        console.log('PiP window closed');
        setPipActive(false);
        pipWindowRef.current = null;
      });
    } catch (error) {
      console.error('Failed to open PiP window:', error);
      setPipActive(false);
    }
  };

  // Render controls in PiP window
  const renderPiPControls = (pipWindow: Window) => {
    // Clear existing content
    pipWindow.document.body.innerHTML = '';
    pipWindow.document.body.style.margin = '0';
    pipWindow.document.body.style.padding = '0';
    pipWindow.document.body.style.overflow = 'hidden';

    const container = pipWindow.document.createElement('div');
    container.id = 'pip-controls-container';
    container.className = isMinimized
      ? 'flex items-center justify-between px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white h-full'
      : 'flex flex-col items-center justify-between p-5 bg-white h-full';

    if (isMinimized) {
      // Minimized view - compact single row with purple gradient
      container.innerHTML = `
        <div class="flex items-center gap-2 flex-1">
          <div class="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse"></div>
          <span id="pip-timer" class="text-base font-mono font-semibold">${formatDuration(duration)}</span>
        </div>
        <div class="flex gap-1.5">
          <button id="pip-toggle-pause" class="px-2.5 py-1 rounded-md bg-white bg-opacity-20 hover:bg-opacity-30 text-xs font-medium transition-all">
            ${isPaused ? '▶' : '⏸'}
          </button>
          <button id="pip-stop" class="px-2.5 py-1 rounded-md bg-white bg-opacity-20 hover:bg-opacity-30 text-xs font-medium transition-all">
            ⏹
          </button>
          <button id="pip-expand" class="px-2 py-1 rounded-md bg-white bg-opacity-10 hover:bg-opacity-20 text-xs transition-all">
            ⬆
          </button>
        </div>
      `;
    } else {
      // Expanded view - clean modern design matching your UI
      container.innerHTML = `
        <div class="w-full">
          <div class="bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl p-4 mb-4 shadow-lg">
            <div class="flex items-center justify-center gap-2 mb-1">
              <div class="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse"></div>
              <h2 class="text-lg font-bold">Recording</h2>
            </div>
            <div id="pip-timer" class="text-3xl font-mono font-bold text-center tracking-wide">
              ${formatDuration(duration)}
            </div>
          </div>

          <div class="flex gap-2 mb-3">
            <button id="pip-toggle-pause" class="flex-1 px-4 py-2.5 rounded-lg ${isPaused ? 'bg-green-500 hover:bg-green-600' : 'bg-amber-500 hover:bg-amber-600'} text-white font-medium transition-all shadow-md text-sm">
              ${isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button id="pip-stop" class="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-medium transition-all shadow-md text-sm">
              ⏹ Stop
            </button>
          </div>
        </div>

        <div class="w-full space-y-2">
          <button id="pip-minimize" class="w-full px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium transition-all">
            ⬇ Minimize
          </button>
          <div class="text-center text-[10px] text-gray-500">
            <div>⌘⇧P pause • ⌘⇧S stop</div>
          </div>
        </div>
      `;
    }

    pipWindow.document.body.appendChild(container);

    // Set up event listeners - MUST be done every time we re-render
    const togglePauseBtn = pipWindow.document.getElementById('pip-toggle-pause');
    const stopBtn = pipWindow.document.getElementById('pip-stop');
    const minimizeBtn = pipWindow.document.getElementById('pip-minimize');
    const expandBtn = pipWindow.document.getElementById('pip-expand');

    if (togglePauseBtn) {
      togglePauseBtn.addEventListener('click', () => {
        console.log('Pause/Resume clicked, isPaused:', isPaused);
        if (isPaused) {
          onResume();
        } else {
          onPause();
        }
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        console.log('Stop clicked');
        onStop();
        pipWindow.close();
      });
    }

    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        console.log('Minimize clicked');
        setIsMinimized(true);
        pipWindow.close();
        // Reopen with minimized view
        setTimeout(() => openPiPWindow(), 100);
      });
    }

    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        console.log('Expand clicked');
        setIsMinimized(false);
        pipWindow.close();
        // Reopen with expanded view
        setTimeout(() => openPiPWindow(), 100);
      });
    }
  };

  // Note: We don't need a separate timer interval anymore
  // The timer is updated by the useEffect that watches the duration prop

  // Update PiP window when pause state changes (but NOT for duration changes)
  useEffect(() => {
    if (pipActive && pipWindowRef.current) {
      console.log('Re-rendering PiP controls due to pause/minimize change');
      renderPiPControls(pipWindowRef.current);
    }
  }, [isPaused, isMinimized]);

  // Update ONLY the timer display without re-rendering everything
  useEffect(() => {
    if (pipActive && pipWindowRef.current) {
      const timerElement = pipWindowRef.current.document.getElementById('pip-timer');
      if (timerElement) {
        timerElement.textContent = formatDuration(duration);
      }
    }
  }, [duration, pipActive]);

  // Auto-open PiP window when recording starts (if autoOpen is enabled)
  useEffect(() => {
    if (autoOpen && isRecording && !pipActive && pipSupported && !hasAutoOpenedRef.current) {
      console.log('Auto-opening PiP window...');
      hasAutoOpenedRef.current = true; // Mark that we've auto-opened
      // Open immediately - no delay needed
      openPiPWindow().catch(err => {
        console.error('Failed to auto-open PiP:', err);
      });
    }

    // Reset the auto-open flag when recording stops
    if (!isRecording) {
      hasAutoOpenedRef.current = false;
    }
  }, [autoOpen, isRecording, pipActive, pipSupported]);

  // Close PiP window when recording stops
  useEffect(() => {
    if (!isRecording && pipWindowRef.current) {
      pipWindowRef.current.close();
    }
  }, [isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pipWindowRef.current) {
        pipWindowRef.current.close();
      }
    };
  }, []);

  // Inline fallback controls for unsupported browsers
  if (!pipSupported) {
    return (
      <div className="fixed bottom-4 right-4 bg-white border-2 border-purple-200 p-4 rounded-xl shadow-2xl z-50 max-w-sm">
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mb-3">
          ⚠️ PiP not supported - using fallback controls
        </div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
            <span className="text-lg font-mono font-bold text-gray-900">{formatDuration(duration)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={isPaused ? onResume : onPause}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all shadow-md ${isPaused ? 'bg-green-500 hover:bg-green-600' : 'bg-amber-500 hover:bg-amber-600'} text-white`}
          >
            {isPaused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button
            onClick={onStop}
            className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-medium transition-all shadow-md"
          >
            ⏹ Stop
          </button>
        </div>
      </div>
    );
  }

  // Main render - button to open PiP window
  return (
    <div className="fixed bottom-4 right-4 z-[9999]" style={{ position: 'fixed', bottom: '16px', right: '16px', zIndex: 9999 }}>
      {!pipActive && isRecording && (
        <button
          onClick={openPiPWindow}
          className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-5 py-3 rounded-xl shadow-lg font-medium transition-all transform hover:scale-105 flex items-center gap-2"
        >
          <span>📺</span>
          <span>Open Always-On-Top Controls</span>
        </button>
      )}
      {pipActive && (
        <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <span>✓</span>
          <span>Controls active</span>
        </div>
      )}
    </div>
  );
};

export default RecordingPiPControls;
