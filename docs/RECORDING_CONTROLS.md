# Global Recording Controls

## Overview

Relay now features **always-on-top recording controls** that remain visible across all screens, windows, and applications during screen recording sessions. This solves the common problem of losing access to recording controls when recording fullscreen applications or switching between windows.

## Features

### 1. Document Picture-in-Picture (PiP) Controls

The recording controls use the Document Picture-in-Picture API to create a native browser window that:

- **Always stays on top** of all other windows and applications
- **Remains visible** when recording fullscreen apps (e.g., Basecamp, Slack, IDEs)
- **Works across multiple monitors** and screen configurations
- **Persists during screen switches** and workspace changes
- **Provides native OS integration** with proper window management

### 2. Global Keyboard Shortcuts

Accessible keyboard shortcuts work throughout your system:

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Pause/Resume | `Cmd+Shift+P` | `Ctrl+Shift+P` |
| Stop Recording | `Cmd+Shift+S` | `Ctrl+Shift+S` |

**Benefits:**
- Work even when recording fullscreen applications
- Accessible for users who prefer keyboard navigation
- Consistent across platforms
- Won't conflict with browser shortcuts (use modifier keys)

### 3. Dual View Modes

#### Expanded Mode (Default)
- Large, easy-to-read timer (HH:MM:SS format)
- Clear pause/resume and stop buttons
- Visual recording indicator (pulsing red dot)
- Keyboard shortcut reference
- Minimize button to switch to compact mode

#### Minimized Mode
- Compact single-row layout
- Essential controls only (timer + buttons)
- Reduces screen real estate usage
- Expand button to return to full view

### 4. Browser Compatibility & Fallback

| Browser | PiP Support | Fallback |
|---------|-------------|----------|
| Chrome 116+ | ✅ Full support | - |
| Edge 116+ | ✅ Full support | - |
| Firefox | ❌ Not supported | Floating controls |
| Safari | ❌ Not supported | Floating controls |

**Fallback Behavior:**
When the Document Picture-in-Picture API is not available, Relay automatically displays:
- Fixed position controls in the bottom-right corner
- All functionality intact (pause, resume, stop)
- Warning message indicating PiP is unavailable
- Still works with keyboard shortcuts

## User Guide

### Starting a Recording

1. Navigate to a task's recording page
2. Click **"Start Recording"** button
3. Select the screen/window to record
4. After a 3-second countdown, recording begins

### Using PiP Controls

1. Once recording starts, click **"Open Always-On-Top Controls"** button
2. A separate window opens with recording controls
3. This window stays on top of all other windows
4. Use the controls or keyboard shortcuts to manage your recording

### Managing the PiP Window

**To minimize:**
- Click the **"⬇️ Minimize"** button in expanded mode
- The window shrinks to a compact single row

**To expand:**
- Click the **"⬆️"** button in minimized mode
- The window expands to show full controls

**To close:**
- Click the window's close button (×)
- Click **"Open Always-On-Top Controls"** again to reopen

### Keyboard Shortcuts

The shortcuts work globally—even when:
- Recording fullscreen applications
- Focused on a different window
- Switching between monitors
- The PiP window is closed

**Examples:**
- Recording a presentation? Press `Cmd+Shift+P` to pause without leaving fullscreen
- Need to stop quickly? Press `Cmd+Shift+S` from any screen

### Stopping a Recording

1. Click **"⏹️ Stop"** button in PiP controls, or
2. Press `Cmd+Shift+S` (Mac) / `Ctrl+Shift+S` (Windows), or
3. Click **"Stop"** in the main recording page

After stopping:
- Preview your recording
- Upload to the task, or
- Download locally, or
- Discard and retry

## Technical Details

### Architecture

```
RecordingSession.tsx (Main Component)
├── RecordingPiPControls.tsx (PiP Window Management)
│   ├── Browser support detection
│   ├── PiP window creation
│   ├── Style copying (for consistent UI)
│   ├── Timer updates
│   └── Fallback controls
└── useRecordingKeyboardShortcuts (Global Shortcuts Hook)
    ├── Event listener management
    ├── Platform detection (Mac vs Windows)
    └── Keyboard event handling
```

### Key Files

| File | Purpose |
|------|---------|
| `frontend/src/components/RecordingPiPControls.tsx` | PiP window component with controls UI |
| `frontend/src/hooks/useRecordingKeyboardShortcuts.ts` | Global keyboard shortcut handler |
| `frontend/src/pages/recordings/RecordingSession.tsx` | Main recording interface (updated) |
| `frontend/src/services/recording.service.ts` | Recording service (unchanged) |

### Document Picture-in-Picture API

The Document PiP API provides:

```typescript
// Request a PiP window
const pipWindow = await documentPictureInPicture.requestWindow({
  width: 400,
  height: 200,
});

// Render controls
pipWindow.document.body.appendChild(controlsContainer);

// Copy styles for consistent UI
document.styleSheets.forEach(styleSheet => {
  // Copy to pipWindow.document
});

// Handle closure
pipWindow.addEventListener('pagehide', () => {
  // Cleanup
});
```

**Key Advantages:**
- Native browser API (no extensions required)
- Sanctioned "always on top" behavior
- Can contain arbitrary HTML/CSS/JavaScript
- Proper window lifecycle management
- Works with browser security model

### Keyboard Shortcuts Implementation

Global shortcuts use capture phase event listening:

```typescript
const handleKeyDown = (event: KeyboardEvent) => {
  const isModifierPressed = event.metaKey || event.ctrlKey;

  if (isModifierPressed && event.shiftKey) {
    if (event.key === 'p') {
      // Pause/Resume
    } else if (event.key === 's') {
      // Stop
    }
  }
};

window.addEventListener('keydown', handleKeyDown, { capture: true });
```

**Benefits of this approach:**
- Works across entire application
- Captures events before they reach other handlers
- Platform-aware (Cmd on Mac, Ctrl elsewhere)
- Properly prevents default browser behavior

### State Management

The PiP controls maintain state consistency through:

1. **Props from parent component**
   - `isRecording`: Current recording state
   - `isPaused`: Pause state
   - `duration`: Current recording duration

2. **Local state**
   - `pipActive`: Whether PiP window is open
   - `isMinimized`: Current view mode

3. **Effect synchronization**
   - Timer updates every second
   - PiP window updates when pause state changes
   - Automatic cleanup on recording stop

### Performance Considerations

- **Timer updates**: Throttled to 1-second intervals
- **Style copying**: One-time operation on PiP window creation
- **Event listeners**: Properly cleaned up on component unmount
- **PiP window**: Lightweight HTML/CSS only

## Best Practices

### For Users

1. **Open PiP controls immediately** after starting a recording
2. **Test keyboard shortcuts** before important recordings
3. **Use minimized mode** for long recordings to reduce distraction
4. **Keep PiP window visible** - don't close it during recording

### For Developers

1. **Browser detection**: Always check for API support
2. **Fallback UI**: Provide alternative controls for unsupported browsers
3. **Style copying**: Ensure PiP window matches main app styling
4. **Cleanup**: Properly close PiP window and remove event listeners
5. **Accessibility**: Provide keyboard shortcuts for all actions

## Troubleshooting

### PiP Window Not Opening

**Symptoms:**
- Click "Open Always-On-Top Controls" but nothing happens
- Console error about `documentPictureInPicture`

**Solutions:**
1. Update to Chrome 116+ or Edge 116+
2. Check browser console for errors
3. Use fallback controls (automatically displayed)

### Keyboard Shortcuts Not Working

**Symptoms:**
- Pressing `Cmd+Shift+P` or `Cmd+Shift+S` has no effect

**Solutions:**
1. Ensure recording is active
2. Check if another app is capturing global shortcuts
3. Try using PiP window buttons instead
4. Verify correct modifier key for your platform

### PiP Window Closes Unexpectedly

**Symptoms:**
- PiP window disappears during recording

**Solutions:**
1. Reopen by clicking "Open Always-On-Top Controls" button
2. Recording continues unaffected
3. Use keyboard shortcuts as alternative

### Styles Not Appearing in PiP Window

**Symptoms:**
- PiP controls look unstyled or different from main app

**Solutions:**
1. Component uses Tailwind CDN as fallback
2. Check browser console for CORS errors
3. Inline styles are copied automatically

## Browser Support Matrix

| Feature | Chrome 116+ | Edge 116+ | Firefox | Safari |
|---------|-------------|-----------|---------|--------|
| Document PiP | ✅ | ✅ | ❌ | ❌ |
| Global Shortcuts | ✅ | ✅ | ✅ | ✅ |
| Fallback Controls | ✅ | ✅ | ✅ | ✅ |
| Screen Recording | ✅ | ✅ | ✅ | ✅ |

## Future Enhancements

Potential improvements for future versions:

1. **Draggable PiP window** - Allow users to reposition the window
2. **Custom window sizes** - User preferences for PiP dimensions
3. **Recording preview** - Show small preview in PiP window
4. **Customizable shortcuts** - Let users configure their own shortcuts
5. **Multi-monitor awareness** - Remember PiP position per monitor
6. **Annotations in PiP** - Add drawing tools for live annotations
7. **Countdown timer** - Show recording time limit if configured

## Resources

- [Document Picture-in-Picture API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API)
- [Chrome Developer Blog - Document PiP](https://developer.chrome.com/docs/web-platform/document-picture-in-picture/)
- [MediaRecorder API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [getDisplayMedia() API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)

## Changelog

### Version 1.0.0 (Current)
- ✨ Initial release of global recording controls
- ✨ Document Picture-in-Picture implementation
- ✨ Global keyboard shortcuts (Cmd+Shift+P, Cmd+Shift+S)
- ✨ Dual view modes (expanded/minimized)
- ✨ Browser support detection and fallback
- ✨ Style copying for consistent UI
- ✨ Automatic cleanup and error handling

## Contributing

When contributing to the recording controls feature:

1. Test in both Chrome and Edge (PiP supported browsers)
2. Test fallback behavior in Firefox/Safari
3. Verify keyboard shortcuts on both Mac and Windows
4. Ensure proper cleanup of event listeners
5. Test with various screen configurations (single/multi-monitor)
6. Check accessibility (keyboard-only navigation)
7. Update this documentation for any changes

---

**Questions or Issues?**
- Check the browser console for detailed error messages
- Verify you're using a supported browser version
- Review the troubleshooting section above
- File an issue in the project repository
