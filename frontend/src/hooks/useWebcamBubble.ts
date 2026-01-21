import { useState, useCallback, useRef, useEffect } from 'react';
import {
  WebcamCompositor,
  BubbleSize,
  BubbleShape,
  BubblePosition,
  CompositorOptions,
  getWebcamDevices,
  getWebcamStream,
  isWebcamAvailable,
} from '../services/webcamCompositor.service';

export interface WebcamBubbleState {
  // Webcam availability and selection
  isAvailable: boolean;
  isEnabled: boolean;
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;

  // Bubble configuration
  size: BubbleSize;
  shape: BubbleShape;
  position: BubblePosition;
  visible: boolean;

  // Streams
  webcamStream: MediaStream | null;
  previewStream: MediaStream | null;  // For showing webcam preview before recording

  // Compositor
  compositor: WebcamCompositor | null;
  isCompositing: boolean;

  // Errors
  error: string | null;
}

export interface UseWebcamBubbleReturn {
  state: WebcamBubbleState;

  // Setup
  checkAvailability: () => Promise<boolean>;
  refreshDevices: () => Promise<void>;
  selectDevice: (deviceId: string) => Promise<void>;

  // Enable/Disable
  enableWebcam: () => Promise<void>;
  disableWebcam: () => void;
  toggleWebcam: () => Promise<void>;

  // Bubble config
  setSize: (size: BubbleSize) => void;
  setShape: (shape: BubbleShape) => void;
  setPosition: (position: BubblePosition) => void;
  setVisible: (visible: boolean) => void;
  setBubblePixelPosition: (x: number, y: number) => void;

  // Compositing
  startCompositing: (screenStream: MediaStream, options?: CompositorOptions) => Promise<MediaStream>;
  stopCompositing: () => void;
  getCompositedStream: () => MediaStream | null;

  // Preview (before recording)
  startPreview: () => Promise<MediaStream | null>;
  stopPreview: () => void;

  // Cleanup
  cleanup: () => void;
}

const DEFAULT_STATE: WebcamBubbleState = {
  isAvailable: false,
  isEnabled: false,
  devices: [],
  selectedDeviceId: null,
  size: 'medium',
  shape: 'circle',
  position: 'bottom-left',
  visible: true,
  webcamStream: null,
  previewStream: null,
  compositor: null,
  isCompositing: false,
  error: null,
};

/**
 * Hook for managing webcam bubble state and compositing
 */
export function useWebcamBubble(): UseWebcamBubbleReturn {
  const [state, setState] = useState<WebcamBubbleState>(DEFAULT_STATE);
  const compositorRef = useRef<WebcamCompositor | null>(null);
  const compositedStreamRef = useRef<MediaStream | null>(null);
  // ★ Memory Leak Fix: Use refs to track streams for cleanup
  // State values captured in useEffect cleanup closures become stale
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);

  // Check webcam availability
  const checkAvailability = useCallback(async (): Promise<boolean> => {
    try {
      const available = await isWebcamAvailable();
      setState(prev => ({ ...prev, isAvailable: available, error: null }));
      return available;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isAvailable: false,
        error: 'Failed to check webcam availability',
      }));
      return false;
    }
  }, []);

  // Refresh device list
  const refreshDevices = useCallback(async (): Promise<void> => {
    try {
      const devices = await getWebcamDevices();
      setState(prev => ({
        ...prev,
        devices,
        // Auto-select first device if none selected
        selectedDeviceId: prev.selectedDeviceId || (devices[0]?.deviceId ?? null),
        error: null,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        devices: [],
        error: 'Failed to get webcam devices',
      }));
    }
  }, []);

  // Select a specific webcam device
  const selectDevice = useCallback(async (deviceId: string): Promise<void> => {
    setState(prev => ({ ...prev, selectedDeviceId: deviceId }));

    // If webcam is enabled, restart with new device
    if (state.isEnabled && state.webcamStream) {
      try {
        // Stop current stream
        state.webcamStream.getTracks().forEach(track => track.stop());

        // Get new stream
        const stream = await getWebcamStream(deviceId);
        webcamStreamRef.current = stream;
        setState(prev => ({ ...prev, webcamStream: stream, error: null }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: 'Failed to switch webcam device',
        }));
      }
    }
  }, [state.isEnabled, state.webcamStream]);

  // Enable webcam (get stream)
  const enableWebcam = useCallback(async (): Promise<void> => {
    if (state.webcamStream) return;

    try {
      const stream = await getWebcamStream(state.selectedDeviceId ?? undefined);
      webcamStreamRef.current = stream;
      setState(prev => ({
        ...prev,
        webcamStream: stream,
        isEnabled: true,
        error: null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to access webcam';
      setState(prev => ({
        ...prev,
        isEnabled: false,
        error: message.includes('Permission') ? 'Webcam permission denied' : message,
      }));
    }
  }, [state.selectedDeviceId, state.webcamStream]);

  // Disable webcam (stop stream)
  const disableWebcam = useCallback((): void => {
    if (state.webcamStream) {
      state.webcamStream.getTracks().forEach(track => track.stop());
    }
    webcamStreamRef.current = null;
    setState(prev => ({
      ...prev,
      webcamStream: null,
      isEnabled: false,
    }));
  }, [state.webcamStream]);

  // Toggle webcam
  const toggleWebcam = useCallback(async (): Promise<void> => {
    if (state.isEnabled) {
      disableWebcam();
    } else {
      await enableWebcam();
    }
  }, [state.isEnabled, disableWebcam, enableWebcam]);

  // Bubble config setters
  const setSize = useCallback((size: BubbleSize): void => {
    setState(prev => ({ ...prev, size }));
    compositorRef.current?.updateBubbleConfig({ size });
  }, []);

  const setShape = useCallback((shape: BubbleShape): void => {
    setState(prev => ({ ...prev, shape }));
    compositorRef.current?.updateBubbleConfig({ shape });
  }, []);

  const setPosition = useCallback((position: BubblePosition): void => {
    setState(prev => ({ ...prev, position }));
    compositorRef.current?.updateBubbleConfig({ position });
  }, []);

  const setVisible = useCallback((visible: boolean): void => {
    setState(prev => ({ ...prev, visible }));
    compositorRef.current?.setWebcamVisible(visible);
  }, []);

  const setBubblePixelPosition = useCallback((x: number, y: number): void => {
    compositorRef.current?.setBubblePixelPosition(x, y);
    setState(prev => ({ ...prev, position: 'custom' }));
  }, []);

  // Start compositing screen + webcam
  const startCompositing = useCallback(async (
    screenStream: MediaStream,
    options: CompositorOptions = {}
  ): Promise<MediaStream> => {
    // Ensure webcam is enabled
    if (!state.webcamStream) {
      await enableWebcam();
    }

    const webcamStream = state.webcamStream;
    if (!webcamStream) {
      throw new Error('Webcam not available');
    }

    // Create compositor with current config
    const compositor = new WebcamCompositor(screenStream, webcamStream, {
      ...options,
      bubble: {
        size: state.size,
        shape: state.shape,
        position: state.position,
        visible: state.visible,
      },
    });

    // Start compositing
    const compositedStream = await compositor.start();

    compositorRef.current = compositor;
    compositedStreamRef.current = compositedStream;

    setState(prev => ({
      ...prev,
      compositor,
      isCompositing: true,
      error: null,
    }));

    return compositedStream;
  }, [state.webcamStream, state.size, state.shape, state.position, state.visible, enableWebcam]);

  // Stop compositing
  const stopCompositing = useCallback((): void => {
    if (compositorRef.current) {
      compositorRef.current.stop();
      compositorRef.current = null;
    }
    compositedStreamRef.current = null;

    setState(prev => ({
      ...prev,
      compositor: null,
      isCompositing: false,
    }));
  }, []);

  // Get current composited stream
  const getCompositedStream = useCallback((): MediaStream | null => {
    return compositedStreamRef.current;
  }, []);

  // Start preview (before recording)
  const startPreview = useCallback(async (): Promise<MediaStream | null> => {
    try {
      // Stop any existing preview
      if (state.previewStream) {
        state.previewStream.getTracks().forEach(track => track.stop());
      }

      const stream = await getWebcamStream(state.selectedDeviceId ?? undefined);
      previewStreamRef.current = stream;
      setState(prev => ({
        ...prev,
        previewStream: stream,
        isEnabled: true,
        error: null,
      }));
      return stream;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to start webcam preview',
      }));
      return null;
    }
  }, [state.selectedDeviceId, state.previewStream]);

  // Stop preview
  const stopPreview = useCallback((): void => {
    if (state.previewStream) {
      state.previewStream.getTracks().forEach(track => track.stop());
      previewStreamRef.current = null;
      setState(prev => ({ ...prev, previewStream: null }));
    }
  }, [state.previewStream]);

  // Full cleanup
  const cleanup = useCallback((): void => {
    stopCompositing();
    stopPreview();
    disableWebcam();
    setState(DEFAULT_STATE);
  }, [stopCompositing, stopPreview, disableWebcam]);

  // Cleanup on unmount
  // ★ Memory Leak Fix: Use refs instead of state in cleanup
  // State captured in closure would be stale (initial null values)
  useEffect(() => {
    return () => {
      if (compositorRef.current) {
        compositorRef.current.stop();
      }
      // Use refs to access current stream values (not stale state)
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Check availability on mount
  useEffect(() => {
    checkAvailability().then(available => {
      if (available) {
        refreshDevices();
      }
    });
  }, []);

  return {
    state,
    checkAvailability,
    refreshDevices,
    selectDevice,
    enableWebcam,
    disableWebcam,
    toggleWebcam,
    setSize,
    setShape,
    setPosition,
    setVisible,
    setBubblePixelPosition,
    startCompositing,
    stopCompositing,
    getCompositedStream,
    startPreview,
    stopPreview,
    cleanup,
  };
}

export default useWebcamBubble;
