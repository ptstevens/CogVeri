import { useEffect, useCallback } from 'react';

/**
 * useRecordingKeyboardShortcuts - Global keyboard shortcuts for recording controls
 *
 * Provides accessible keyboard shortcuts that work across the entire application:
 * - Cmd+Shift+P (Mac) / Ctrl+Shift+P (Windows/Linux): Pause/Resume recording
 * - Cmd+Shift+S (Mac) / Ctrl+Shift+S (Windows/Linux): Stop recording
 *
 * These shortcuts follow accessibility best practices:
 * 1. Use modifier keys to avoid conflicts with browser/OS shortcuts
 * 2. Consistent across platforms (Cmd on Mac, Ctrl elsewhere)
 * 3. Mnemonic (P for Pause, S for Stop)
 * 4. Work even when recording fullscreen apps
 */

interface UseRecordingKeyboardShortcutsProps {
  isRecording: boolean;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  enabled?: boolean;
}

export const useRecordingKeyboardShortcuts = ({
  isRecording,
  isPaused,
  onPause,
  onResume,
  onStop,
  enabled = true,
}: UseRecordingKeyboardShortcutsProps) => {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Only handle shortcuts when recording is active and shortcuts are enabled
      if (!isRecording || !enabled) {
        return;
      }

      // Check for the appropriate modifier key based on platform
      const isModifierPressed = event.metaKey || event.ctrlKey;

      if (!isModifierPressed || !event.shiftKey) {
        return;
      }

      // Cmd+Shift+P / Ctrl+Shift+P: Pause/Resume
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        event.stopPropagation();

        if (isPaused) {
          console.log('Keyboard shortcut: Resume recording');
          onResume();
        } else {
          console.log('Keyboard shortcut: Pause recording');
          onPause();
        }
        return;
      }

      // Cmd+Shift+S / Ctrl+Shift+S: Stop
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        event.stopPropagation();

        console.log('Keyboard shortcut: Stop recording');
        onStop();
        return;
      }
    },
    [isRecording, isPaused, enabled, onPause, onResume, onStop]
  );

  useEffect(() => {
    // Add event listener when component mounts
    window.addEventListener('keydown', handleKeyDown, { capture: true });

    // Log when shortcuts are registered
    if (enabled && isRecording) {
      console.log('Recording keyboard shortcuts registered:');
      console.log('  - Cmd+Shift+P / Ctrl+Shift+P: Pause/Resume');
      console.log('  - Cmd+Shift+S / Ctrl+Shift+S: Stop');
    }

    // Remove event listener when component unmounts
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      if (enabled && isRecording) {
        console.log('Recording keyboard shortcuts unregistered');
      }
    };
  }, [handleKeyDown, enabled, isRecording]);

  // Return current shortcut mappings for display purposes
  return {
    shortcuts: {
      pauseResume: {
        mac: 'Cmd+Shift+P',
        windows: 'Ctrl+Shift+P',
        description: isPaused ? 'Resume recording' : 'Pause recording',
      },
      stop: {
        mac: 'Cmd+Shift+S',
        windows: 'Ctrl+Shift+S',
        description: 'Stop recording',
      },
    },
    getPlatformShortcut: (action: 'pauseResume' | 'stop'): string => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const shortcuts = {
        pauseResume: isMac ? 'Cmd+Shift+P' : 'Ctrl+Shift+P',
        stop: isMac ? 'Cmd+Shift+S' : 'Ctrl+Shift+S',
      };
      return shortcuts[action];
    },
  };
};

export default useRecordingKeyboardShortcuts;
