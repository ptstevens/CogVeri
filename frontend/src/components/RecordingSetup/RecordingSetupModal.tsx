import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Monitor, Camera, CameraOff, Mic, MicOff, Video, ChevronDown } from 'lucide-react';
import { WebcamPreview } from '../WebcamBubble';
import {
  BubbleSize,
  BubbleShape,
  BubblePosition,
  getWebcamDevices,
  getWebcamStream,
  isWebcamAvailable,
} from '../../services/webcamCompositor.service';
import { BackgroundSelector } from './BackgroundSelector';
import { useVirtualBackground } from '../../hooks/useVirtualBackground';
import { BackgroundMode } from '../../services/virtualBackground.service';

export interface RecordingSetupConfig {
  hasWebcam: boolean;
  hasAudio: boolean;
  webcamDeviceId: string | null;
  audioDeviceId: string | null;
  webcamConfig: {
    size: BubbleSize;
    shape: BubbleShape;
    position: BubblePosition;
    visible: boolean;
  };
}

interface RecordingSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartRecording: (config: RecordingSetupConfig, webcamStream: MediaStream | null) => void;
  taskTitle?: string;
}

/**
 * RecordingSetupModal - Loom-style pre-recording configuration
 *
 * Allows users to configure:
 * - Webcam on/off with device selection
 * - Microphone on/off with device selection
 * - Webcam bubble appearance (size, shape, position)
 */
export const RecordingSetupModal: React.FC<RecordingSetupModalProps> = ({
  isOpen,
  onClose,
  onStartRecording,
  taskTitle,
}) => {
  // Webcam state
  const [webcamAvailable, setWebcamAvailable] = useState(false);
  const [webcamEnabled, setWebcamEnabled] = useState(false);
  const [webcamDevices, setWebcamDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedWebcamId, setSelectedWebcamId] = useState<string | null>(null);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [rawWebcamStream, setRawWebcamStream] = useState<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);

  // Virtual background hook
  const virtualBackground = useVirtualBackground();

  // Local state to track background changes and trigger reprocessing
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('none');
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);

  // Audio state
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Webcam bubble config
  // Size is user-configurable, shape and position are fixed
  const [bubbleSize, setBubbleSize] = useState<BubbleSize>('medium');
  const bubbleShape: BubbleShape = 'circle';
  const bubblePosition: BubblePosition = 'bottom-left';

  // UI state
  const [showWebcamDevices, setShowWebcamDevices] = useState(false);
  const [showAudioDevices, setShowAudioDevices] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // Check webcam availability and enumerate devices
  useEffect(() => {
    if (!isOpen) return;

    const init = async () => {
      // Check webcam - this will trigger permission request
      const available = await isWebcamAvailable();
      setWebcamAvailable(available);

      if (available) {
        const devices = await getWebcamDevices();
        setWebcamDevices(devices);
        if (devices.length > 0 && !selectedWebcamId) {
          setSelectedWebcamId(devices[0].deviceId);
        }
      }

      // Get audio devices - need permission first for labels
      try {
        // Request mic permission to get full device list
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          tempStream.getTracks().forEach((track) => track.stop());
        } catch {
          // Mic permission not granted
        }

        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = allDevices.filter((d) => d.kind === 'audioinput');
        setAudioDevices(audioInputs);
        if (audioInputs.length > 0 && !selectedAudioId) {
          setSelectedAudioId(audioInputs[0].deviceId);
        }
      } catch {
        // Failed to enumerate audio devices
      }
    };

    init();
  }, [isOpen]);

  // Start/stop webcam preview when enabled changes
  useEffect(() => {
    if (!isOpen) return;

    const updateWebcamStream = async () => {
      if (webcamEnabled && selectedWebcamId) {
        try {
          // Stop existing streams
          if (rawWebcamStream) {
            rawWebcamStream.getTracks().forEach((track) => track.stop());
          }
          virtualBackground.stop();

          // Get raw webcam stream
          const stream = await getWebcamStream(selectedWebcamId);
          setRawWebcamStream(stream);

          // Apply virtual background if enabled
          if (virtualBackground.mode !== 'none') {
            const processedStream = await virtualBackground.processStream(stream);
            setWebcamStream(processedStream);
          } else {
            setWebcamStream(stream);
          }

          setWebcamError(null);
        } catch {
          setWebcamError('Failed to access camera');
          setWebcamEnabled(false);
        }
      } else if (!webcamEnabled) {
        if (rawWebcamStream) {
          rawWebcamStream.getTracks().forEach((track) => track.stop());
          setRawWebcamStream(null);
        }
        virtualBackground.stop();
        setWebcamStream(null);
      }
    };

    updateWebcamStream();
  }, [webcamEnabled, selectedWebcamId, isOpen]);

  // Handle background mode change from selector
  const handleBackgroundModeChange = useCallback(
    (mode: BackgroundMode) => {
      console.log('[RecordingSetup] Background mode changed to:', mode);
      setBackgroundMode(mode);
      virtualBackground.setMode(mode);
    },
    [virtualBackground]
  );

  // Handle background image change from selector
  // IMPORTANT: Wait for image to load BEFORE updating state to prevent race conditions
  const handleBackgroundImageChange = useCallback(
    async (url: string | null) => {
      console.log('[RecordingSetup] Background image changed to:', url);
      // Load image first (this populates the ref in the hook)
      await virtualBackground.setBackgroundImage(url);
      // NOW update local state (triggers useEffect after image is ready)
      setBackgroundImageUrl(url);
      console.log('[RecordingSetup] Background image ready, state updated');
    },
    [virtualBackground]
  );

  // Re-process stream when background mode or image changes
  useEffect(() => {
    if (!rawWebcamStream || !webcamEnabled) {
      console.log('[RecordingSetup] Skip processing: no stream or not enabled');
      return;
    }

    const updateProcessedStream = async () => {
      try {
        if (backgroundMode !== 'none') {
          console.log('[RecordingSetup] Processing stream with mode:', backgroundMode);
          // Stop any existing processing first
          virtualBackground.stop();
          const processedStream = await virtualBackground.processStream(rawWebcamStream);
          console.log('[RecordingSetup] Got processed stream:', processedStream?.id);
          setWebcamStream(processedStream);
        } else {
          virtualBackground.stop();
          setWebcamStream(rawWebcamStream);
        }
      } catch (err) {
        console.error('[RecordingSetup] Failed to process stream:', err);
        // Fall back to raw stream on error
        setWebcamStream(rawWebcamStream);
      }
    };

    updateProcessedStream();
  }, [backgroundMode, backgroundImageUrl, rawWebcamStream, webcamEnabled]);

  // Cleanup on close - only if NOT starting recording
  // When starting recording, the parent takes ownership of the webcam stream
  // This ref tracks whether we're transitioning to recording vs just closing
  const isStartingRef = useRef(false);

  useEffect(() => {
    if (!isOpen && !isStartingRef.current) {
      // Stop raw webcam stream
      if (rawWebcamStream) {
        rawWebcamStream.getTracks().forEach((track) => track.stop());
        setRawWebcamStream(null);
      }
      // Stop processed stream
      if (webcamStream && webcamStream !== rawWebcamStream) {
        webcamStream.getTracks().forEach((track) => track.stop());
      }
      setWebcamStream(null);
      // Dispose virtual background processor
      virtualBackground.dispose();
    }
    // Reset the flag when modal opens
    if (isOpen) {
      isStartingRef.current = false;
    }
  }, [isOpen]);

  // Toggle webcam
  const toggleWebcam = useCallback(() => {
    setWebcamEnabled((prev) => !prev);
  }, []);

  // Toggle audio
  const toggleAudio = useCallback(() => {
    setAudioEnabled((prev) => !prev);
  }, []);

  // Handle start recording
  const handleStartRecording = useCallback(async () => {
    setIsStarting(true);

    const config: RecordingSetupConfig = {
      hasWebcam: webcamEnabled,
      hasAudio: audioEnabled,
      webcamDeviceId: selectedWebcamId,
      audioDeviceId: selectedAudioId,
      webcamConfig: {
        size: bubbleSize,
        shape: bubbleShape,
        position: bubblePosition,
        visible: true,
      },
    };

    // Mark that we're starting recording - prevents cleanup effect from stopping the stream
    isStartingRef.current = true;

    // Pass the webcam stream to the parent (don't stop it - parent now owns it)
    onStartRecording(config, webcamEnabled ? webcamStream : null);
  }, [
    webcamEnabled,
    audioEnabled,
    selectedWebcamId,
    selectedAudioId,
    webcamStream,
    onStartRecording,
  ]);

  // Handle close
  const handleClose = useCallback(() => {
    if (rawWebcamStream) {
      rawWebcamStream.getTracks().forEach((track) => track.stop());
      setRawWebcamStream(null);
    }
    if (webcamStream && webcamStream !== rawWebcamStream) {
      webcamStream.getTracks().forEach((track) => track.stop());
    }
    setWebcamStream(null);
    virtualBackground.dispose();
    setWebcamEnabled(false);
    setIsStarting(false);
    onClose();
  }, [rawWebcamStream, webcamStream, virtualBackground, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-gray-700 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <Video className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Recording Setup</h2>
              {taskTitle && (
                <p className="text-sm text-gray-400 truncate max-w-[200px]">{taskTitle}</p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Screen Capture (always on) */}
          <div className="flex items-center justify-between p-4 bg-gray-800/60 rounded-xl border border-gray-700/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-700 rounded-lg flex items-center justify-center">
                <Monitor className="w-4 h-4 text-gray-300" />
              </div>
              <span className="text-white font-medium">Screen Capture</span>
            </div>
            <span className="text-xs text-primary-400 bg-primary-500/20 px-3 py-1.5 rounded-full font-medium">
              Always On
            </span>
          </div>

          {/* Camera Toggle */}
          <div className="space-y-3">
            <button
              onClick={toggleWebcam}
              disabled={!webcamAvailable}
              className={`w-full flex items-center justify-between p-4 rounded-xl transition-all ${
                webcamEnabled
                  ? 'bg-primary-600/15 border border-primary-500/40 shadow-sm shadow-primary-500/10'
                  : 'bg-gray-800/60 border border-gray-700/50 hover:bg-gray-800 hover:border-gray-600'
              } ${!webcamAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    webcamEnabled ? 'bg-primary-500/20' : 'bg-gray-700'
                  }`}
                >
                  {webcamEnabled ? (
                    <Camera className="w-4 h-4 text-primary-400" />
                  ) : (
                    <CameraOff className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <div className="text-left">
                  <span className="text-white font-medium block truncate max-w-[180px]">
                    {webcamDevices.find((d) => d.deviceId === selectedWebcamId)?.label || 'Camera'}
                  </span>
                  {webcamError && <span className="text-xs text-red-400">{webcamError}</span>}
                </div>
              </div>
              <span
                className={`text-sm font-medium px-3 py-1.5 rounded-full transition-colors ${
                  webcamEnabled ? 'bg-primary-500 text-white' : 'bg-gray-600 text-gray-300'
                }`}
              >
                {webcamEnabled ? 'On' : 'Off'}
              </span>
            </button>

            {/* Webcam Preview & Controls */}
            {webcamEnabled && (
              <div className="flex gap-4 p-4 bg-gray-800/50 rounded-xl items-center">
                {/* Live Preview */}
                <WebcamPreview stream={webcamStream} size={bubbleSize} shape={bubbleShape} />

                {/* Size selector */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-gray-400">Size</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setBubbleSize('medium')}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        bubbleSize === 'medium'
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Medium
                    </button>
                    <button
                      onClick={() => setBubbleSize('large')}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        bubbleSize === 'large'
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Large
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Virtual Background Selector */}
            {webcamEnabled && (
              <div className="p-4 bg-gray-800/50 rounded-xl">
                <BackgroundSelector
                  mode={backgroundMode}
                  backgroundImageUrl={backgroundImageUrl}
                  isLoading={virtualBackground.isLoading}
                  onModeChange={handleBackgroundModeChange}
                  onBackgroundImageChange={handleBackgroundImageChange}
                />
              </div>
            )}

            {/* Camera device selector */}
            {webcamEnabled && webcamDevices.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowWebcamDevices(!showWebcamDevices)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-800/80 rounded-lg text-sm text-gray-300 hover:bg-gray-700 transition-colors border border-gray-700"
                >
                  <span className="truncate">
                    {webcamDevices.find((d) => d.deviceId === selectedWebcamId)?.label ||
                      'Select camera'}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform flex-shrink-0 ml-2 ${showWebcamDevices ? 'rotate-180' : ''}`}
                  />
                </button>
                {showWebcamDevices && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 rounded-lg border border-gray-700 shadow-xl z-20 max-h-40 overflow-y-auto">
                    {webcamDevices.map((device) => (
                      <button
                        key={device.deviceId}
                        onClick={() => {
                          setSelectedWebcamId(device.deviceId);
                          setShowWebcamDevices(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-700 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                          selectedWebcamId === device.deviceId
                            ? 'text-purple-400 bg-gray-700/50'
                            : 'text-gray-300'
                        }`}
                      >
                        {device.label || `Camera ${webcamDevices.indexOf(device) + 1}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Microphone Toggle */}
          <div className="space-y-3">
            <button
              onClick={toggleAudio}
              className={`w-full flex items-center justify-between p-4 rounded-xl transition-all ${
                audioEnabled
                  ? 'bg-primary-600/15 border border-primary-500/40 shadow-sm shadow-primary-500/10'
                  : 'bg-gray-800/60 border border-gray-700/50 hover:bg-gray-800 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    audioEnabled ? 'bg-primary-500/20' : 'bg-gray-700'
                  }`}
                >
                  {audioEnabled ? (
                    <Mic className="w-4 h-4 text-primary-400" />
                  ) : (
                    <MicOff className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <span className="text-white font-medium truncate max-w-[180px]">
                  {audioDevices.find((d) => d.deviceId === selectedAudioId)?.label || 'Microphone'}
                </span>
              </div>
              <span
                className={`text-sm font-medium px-3 py-1.5 rounded-full transition-colors ${
                  audioEnabled ? 'bg-primary-500 text-white' : 'bg-gray-600 text-gray-300'
                }`}
              >
                {audioEnabled ? 'On' : 'Off'}
              </span>
            </button>

            {/* Audio device selector - Opens upward to stay within modal */}
            {audioEnabled && audioDevices.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowAudioDevices(!showAudioDevices)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-800/80 rounded-lg text-sm text-gray-300 hover:bg-gray-700 transition-colors border border-gray-700"
                >
                  <span className="truncate">
                    {audioDevices.find((d) => d.deviceId === selectedAudioId)?.label ||
                      'Select microphone'}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform flex-shrink-0 ml-2 ${showAudioDevices ? 'rotate-180' : ''}`}
                  />
                </button>
                {showAudioDevices && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 rounded-lg border border-gray-700 shadow-xl z-20 max-h-40 overflow-y-auto">
                    {audioDevices.map((device) => (
                      <button
                        key={device.deviceId}
                        onClick={() => {
                          setSelectedAudioId(device.deviceId);
                          setShowAudioDevices(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-700 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                          selectedAudioId === device.deviceId
                            ? 'text-purple-400 bg-gray-700/50'
                            : 'text-gray-300'
                        }`}
                      >
                        {device.label || `Microphone ${audioDevices.indexOf(device) + 1}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer - Fixed at bottom */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-900 flex-shrink-0">
          <button
            onClick={handleStartRecording}
            disabled={isStarting}
            className="w-full py-4 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-red-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isStarting ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Starting...</span>
              </>
            ) : (
              <>
                <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                <span>Start Recording</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecordingSetupModal;
