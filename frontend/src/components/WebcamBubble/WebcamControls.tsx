import React from 'react';
import { BubbleShape, BubbleSize, BubblePosition } from '../../services/webcamCompositor.service';
import { Camera, CameraOff, Circle, Square, Maximize, Minimize } from 'lucide-react';

interface WebcamControlsProps {
  size: BubbleSize;
  shape: BubbleShape;
  position: BubblePosition;
  visible: boolean;
  onSizeChange: (size: BubbleSize) => void;
  onShapeChange: (shape: BubbleShape) => void;
  onPositionChange: (position: BubblePosition) => void;
  onVisibleChange: (visible: boolean) => void;
  compact?: boolean;
  className?: string;
}

/**
 * WebcamControls - Controls for webcam bubble appearance
 */
export const WebcamControls: React.FC<WebcamControlsProps> = ({
  size,
  shape,
  position,
  visible,
  onSizeChange,
  onShapeChange,
  onPositionChange,
  onVisibleChange,
  compact = false,
  className = '',
}) => {
  const sizes: BubbleSize[] = ['small', 'medium', 'large'];
  const shapes: BubbleShape[] = ['circle', 'rounded'];
  const positions: BubblePosition[] = ['bottom-left', 'bottom-right', 'top-left', 'top-right'];

  if (compact) {
    // Compact inline controls for during recording
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {/* Visibility toggle */}
        <button
          onClick={() => onVisibleChange(!visible)}
          className={`p-2 rounded-lg transition-colors ${
            visible
              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
          title={visible ? 'Hide webcam' : 'Show webcam'}
        >
          {visible ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
        </button>

        {/* Size toggle */}
        <button
          onClick={() => {
            const idx = sizes.indexOf(size);
            onSizeChange(sizes[(idx + 1) % sizes.length]);
          }}
          className="p-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
          title={`Size: ${size}`}
        >
          {size === 'small' ? (
            <Minimize className="w-4 h-4" />
          ) : size === 'large' ? (
            <Maximize className="w-4 h-4" />
          ) : (
            <div className="w-4 h-4 flex items-center justify-center">
              <div className="w-2.5 h-2.5 border-2 border-current rounded-sm" />
            </div>
          )}
        </button>

        {/* Shape toggle */}
        <button
          onClick={() => onShapeChange(shape === 'circle' ? 'rounded' : 'circle')}
          className="p-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
          title={`Shape: ${shape}`}
        >
          {shape === 'circle' ? (
            <Circle className="w-4 h-4" />
          ) : (
            <Square className="w-4 h-4" />
          )}
        </button>
      </div>
    );
  }

  // Full controls for setup modal
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Visibility */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Camera</label>
        <button
          onClick={() => onVisibleChange(!visible)}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-colors ${
            visible
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {visible ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
          <span>{visible ? 'Camera On' : 'Camera Off'}</span>
        </button>
      </div>

      {visible && (
        <>
          {/* Size */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Size</label>
            <div className="flex gap-2">
              {sizes.map((s) => (
                <button
                  key={s}
                  onClick={() => onSizeChange(s)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    size === s
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Shape */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Shape</label>
            <div className="flex gap-2">
              {shapes.map((s) => (
                <button
                  key={s}
                  onClick={() => onShapeChange(s)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    shape === s
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {s === 'circle' ? <Circle className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  <span>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Position */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Position</label>
            <div className="grid grid-cols-2 gap-2">
              {positions.map((p) => {
                const label = p
                  .split('-')
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(' ');
                return (
                  <button
                    key={p}
                    onClick={() => onPositionChange(p)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      position === p
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WebcamControls;
