/**
 * useVirtualBackground Hook
 *
 * React hook for managing virtual background effects on webcam streams.
 * Provides blur and virtual background image functionality.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  VirtualBackgroundProcessor,
  BackgroundMode,
  VirtualBackgroundConfig,
  isVirtualBackgroundSupported,
  loadBackgroundImage,
} from '../services/virtualBackground.service';

export interface UseVirtualBackgroundReturn {
  /** Whether the browser supports virtual backgrounds */
  isSupported: boolean;
  /** Whether the ML model has been loaded */
  isInitialized: boolean;
  /** Whether the model is currently loading */
  isLoading: boolean;
  /** Error message if initialization failed */
  error: string | null;
  /** Current background mode */
  mode: BackgroundMode;
  /** Set background mode (triggers model load if needed) */
  setMode: (mode: BackgroundMode) => void;
  /** Currently selected background image URL */
  backgroundImageUrl: string | null;
  /** Set background image by URL */
  setBackgroundImage: (url: string | null) => Promise<void>;
  /** Process an input stream and return stream with effects applied */
  processStream: (inputStream: MediaStream) => Promise<MediaStream>;
  /** Get the output canvas for preview */
  getPreviewCanvas: () => HTMLCanvasElement | null;
  /** Stop processing and cleanup */
  stop: () => void;
  /** Full cleanup including model disposal */
  dispose: () => void;
}

export function useVirtualBackground(): UseVirtualBackgroundReturn {
  // State
  const [isSupported] = useState(() => isVirtualBackgroundSupported());
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setModeState] = useState<BackgroundMode>('none');
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);

  // Refs
  const processorRef = useRef<VirtualBackgroundProcessor | null>(null);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const inputStreamRef = useRef<MediaStream | null>(null);

  /**
   * Initialize the processor (lazy - only when needed)
   */
  const initializeProcessor = useCallback(async (): Promise<VirtualBackgroundProcessor> => {
    if (processorRef.current?.isReady()) {
      return processorRef.current;
    }

    setIsLoading(true);
    setError(null);

    try {
      const config: VirtualBackgroundConfig = {
        mode,
        backgroundImage: backgroundImageRef.current,
      };

      const processor = new VirtualBackgroundProcessor(config);
      await processor.initialize();

      processorRef.current = processor;
      setIsInitialized(true);
      setIsLoading(false);

      return processor;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to initialize virtual background';
      setError(message);
      setIsLoading(false);
      throw err;
    }
  }, [mode]);

  /**
   * Set background mode
   */
  const setMode = useCallback((newMode: BackgroundMode) => {
    setModeState(newMode);

    // Update processor config if it exists
    if (processorRef.current) {
      processorRef.current.setConfig({ mode: newMode });
    }
  }, []);

  /**
   * Set background image by URL
   * IMPORTANT: URL state is only updated AFTER image loads to prevent race conditions
   */
  const setBackgroundImage = useCallback(async (url: string | null): Promise<void> => {
    if (url) {
      try {
        // Load image FIRST, before updating state
        const img = await loadBackgroundImage(url);
        backgroundImageRef.current = img;

        // Update processor if it exists
        if (processorRef.current) {
          processorRef.current.setConfig({ backgroundImage: img });
        }

        // NOW update state (after image is loaded and ref is set)
        setBackgroundImageUrl(url);
      } catch (err) {
        backgroundImageRef.current = null;
        setBackgroundImageUrl(null);
        throw err;
      }
    } else {
      backgroundImageRef.current = null;
      setBackgroundImageUrl(null);

      if (processorRef.current) {
        processorRef.current.setConfig({ backgroundImage: null });
      }
    }
  }, []);

  /**
   * Process an input stream
   * Returns a new stream with virtual background applied
   */
  const processStream = useCallback(
    async (inputStream: MediaStream): Promise<MediaStream> => {
      console.log('[useVirtualBackground] processStream called, mode:', mode);

      // If no effect, return original stream
      if (mode === 'none') {
        console.log('[useVirtualBackground] Mode is none, returning original stream');
        inputStreamRef.current = inputStream;
        return inputStream;
      }

      // Store input stream reference
      inputStreamRef.current = inputStream;

      // Initialize processor if needed
      console.log('[useVirtualBackground] Initializing processor...');
      const processor = await initializeProcessor();
      console.log('[useVirtualBackground] Processor initialized');

      // Update config
      console.log(
        '[useVirtualBackground] Setting config, backgroundImage:',
        backgroundImageRef.current
          ? `${backgroundImageRef.current.width}x${backgroundImageRef.current.height}`
          : 'null'
      );
      processor.setConfig({
        mode,
        backgroundImage: backgroundImageRef.current,
      });

      // Start processing
      console.log('[useVirtualBackground] Starting processing...');
      const outputStream = await processor.startProcessing(inputStream);
      console.log('[useVirtualBackground] Got output stream:', outputStream?.id);
      return outputStream;
    },
    [mode, initializeProcessor]
  );

  /**
   * Get preview canvas
   */
  const getPreviewCanvas = useCallback((): HTMLCanvasElement | null => {
    return processorRef.current?.getOutputCanvas() ?? null;
  }, []);

  /**
   * Stop processing
   */
  const stop = useCallback(() => {
    processorRef.current?.stop();
    inputStreamRef.current = null;
  }, []);

  /**
   * Full cleanup
   */
  const dispose = useCallback(() => {
    processorRef.current?.dispose();
    processorRef.current = null;
    backgroundImageRef.current = null;
    inputStreamRef.current = null;
    setIsInitialized(false);
    setModeState('none');
    setBackgroundImageUrl(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      processorRef.current?.dispose();
    };
  }, []);

  return {
    isSupported,
    isInitialized,
    isLoading,
    error,
    mode,
    setMode,
    backgroundImageUrl,
    setBackgroundImage,
    processStream,
    getPreviewCanvas,
    stop,
    dispose,
  };
}

export default useVirtualBackground;
