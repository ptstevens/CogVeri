import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BubbleShape, BubbleSize, BubblePosition } from '../../services/webcamCompositor.service';
import { Camera, CameraOff, GripVertical } from 'lucide-react';

interface FloatingWebcamBubbleProps {
  stream: MediaStream | null;
  size?: BubbleSize;
  shape?: BubbleShape;
  position?: BubblePosition;
  visible?: boolean;
  onPositionChange?: (x: number, y: number) => void;
  onVisibilityChange?: (visible: boolean) => void;
}

const SIZE_MAP: Record<BubbleSize, number> = {
  small: 120,
  medium: 180,
  large: 240,
};

const POSITION_MAP: Record<
  BubblePosition,
  { bottom?: number; top?: number; left?: number; right?: number }
> = {
  'bottom-left': { bottom: 100, left: 20 },
  'bottom-right': { bottom: 100, right: 20 },
  'top-left': { top: 100, left: 20 },
  'top-right': { top: 100, right: 20 },
  custom: { bottom: 100, left: 20 },
};

/**
 * FloatingWebcamBubble - Draggable webcam preview that floats during recording
 *
 * This component shows the user's webcam in real-time during recording.
 * It can be dragged to reposition and updates the compositor's bubble position.
 */
export const FloatingWebcamBubble: React.FC<FloatingWebcamBubbleProps> = ({
  stream,
  size = 'medium',
  shape = 'circle',
  position = 'bottom-left',
  visible = true,
  onPositionChange,
  onVisibilityChange,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [customPosition, setCustomPosition] = useState<{ x: number; y: number } | null>(null);
  const sizePx = SIZE_MAP[size];

  // Set up video stream
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Handle drag start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setIsDragging(true);
    e.preventDefault();
  }, []);

  // Handle drag move
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      // Clamp to viewport
      const maxX = window.innerWidth - sizePx;
      const maxY = window.innerHeight - sizePx;
      const clampedX = Math.max(0, Math.min(newX, maxX));
      const clampedY = Math.max(0, Math.min(newY, maxY));

      setCustomPosition({ x: clampedX, y: clampedY });

      // Notify parent of position change (as percentage of screen)
      if (onPositionChange) {
        const percentX = clampedX / window.innerWidth;
        const percentY = clampedY / window.innerHeight;
        onPositionChange(percentX, percentY);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, sizePx, onPositionChange]);

  // Toggle visibility
  const handleToggleVisibility = useCallback(() => {
    onVisibilityChange?.(!visible);
  }, [visible, onVisibilityChange]);

  if (!stream) return null;

  // Calculate position styles
  const positionStyle: React.CSSProperties = customPosition
    ? { left: customPosition.x, top: customPosition.y }
    : POSITION_MAP[position];

  return (
    <div
      ref={containerRef}
      className={`fixed z-50 transition-opacity ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} ${
        visible ? 'opacity-100' : 'opacity-30 hover:opacity-60'
      }`}
      style={{
        ...positionStyle,
        width: sizePx,
        height: sizePx,
      }}
    >
      {/* Webcam video */}
      <div
        className={`relative overflow-hidden ${
          shape === 'circle' ? 'rounded-full' : 'rounded-2xl'
        }`}
        style={{
          width: sizePx,
          height: sizePx,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
          border: '3px solid white',
          backgroundColor: '#1a1a1a', // Dark gray instead of pure black
        }}
      >
        {visible ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{
              transform: 'scaleX(-1)',
              backgroundColor: '#1a1a1a', // Prevent blue flash
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-800">
            <CameraOff className="w-8 h-8 text-gray-400" />
          </div>
        )}

        {/* Drag handle */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute top-1 left-1/2 -translate-x-1/2 p-1 bg-black/50 rounded-full cursor-grab hover:bg-black/70 transition-colors"
          title="Drag to reposition"
        >
          <GripVertical className="w-4 h-4 text-white" />
        </div>

        {/* Toggle visibility button */}
        <button
          onClick={handleToggleVisibility}
          className="absolute bottom-1 right-1 p-1.5 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
          title={visible ? 'Hide camera' : 'Show camera'}
        >
          {visible ? (
            <Camera className="w-4 h-4 text-white" />
          ) : (
            <CameraOff className="w-4 h-4 text-white" />
          )}
        </button>
      </div>
    </div>
  );
};

export default FloatingWebcamBubble;
