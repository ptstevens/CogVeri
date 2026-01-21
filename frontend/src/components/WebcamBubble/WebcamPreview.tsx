import React, { useEffect, useRef } from 'react';
import { BubbleShape, BubbleSize } from '../../services/webcamCompositor.service';

interface WebcamPreviewProps {
  stream: MediaStream | null;
  size?: BubbleSize;
  shape?: BubbleShape;
  mirrored?: boolean;
  className?: string;
  onClick?: () => void;
}

const SIZE_MAP: Record<BubbleSize, number> = {
  small: 80,
  medium: 120,
  large: 160,
};

/**
 * WebcamPreview - Displays live webcam feed in a bubble shape
 * Used for pre-recording preview in the setup modal
 */
export const WebcamPreview: React.FC<WebcamPreviewProps> = ({
  stream,
  size = 'medium',
  shape = 'circle',
  mirrored = true,
  className = '',
  onClick,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sizePx = SIZE_MAP[size];

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!stream) {
      video.srcObject = null;
      return;
    }

    // Set stream and play
    video.srcObject = stream;
    video.play().catch(err => {
      console.error('[WebcamPreview] Failed to play:', err);
    });
  }, [stream]);

  if (!stream) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-800 text-gray-400 ${className}`}
        style={{
          width: sizePx,
          height: sizePx,
          borderRadius: shape === 'circle' ? '50%' : '16px',
        }}
      >
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-black ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        width: sizePx,
        height: sizePx,
        borderRadius: shape === 'circle' ? '50%' : '16px',
      }}
      onClick={onClick}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{
          transform: mirrored ? 'scaleX(-1)' : 'none',
        }}
      />
      {/* White border */}
      <div
        className="absolute inset-0 border-3 border-white pointer-events-none"
        style={{
          borderRadius: shape === 'circle' ? '50%' : '16px',
          borderWidth: '3px',
        }}
      />
    </div>
  );
};

export default WebcamPreview;
