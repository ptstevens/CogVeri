/**
 * BackgroundSelector Component
 *
 * UI for selecting virtual background effects:
 * - None (no effect)
 * - Blur (medium intensity)
 * - Gradient colors (blue, cyan, white, pink)
 * - Custom upload
 */

import React, { useRef, useCallback } from 'react';
import { Ban, Sparkles, Upload, Check, Loader2 } from 'lucide-react';
import { BackgroundMode } from '../../services/virtualBackground.service';

interface BackgroundSelectorProps {
  mode: BackgroundMode;
  backgroundImageUrl: string | null;
  isLoading: boolean;
  onModeChange: (mode: BackgroundMode) => void;
  onBackgroundImageChange: (url: string | null) => Promise<void>;
}

// Gradient background colors (SVG data URLs)
const createGradientSvg = (color1: string, color2: string): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:${color1}"/>
        <stop offset="100%" style="stop-color:${color2}"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const GRADIENT_BACKGROUNDS = [
  { id: 'blue', name: 'Blue', src: createGradientSvg('#1e3a5f', '#3b82f6'), color: 'from-blue-900 to-blue-500' },
  { id: 'cyan', name: 'Cyan', src: createGradientSvg('#0e7490', '#22d3ee'), color: 'from-cyan-700 to-cyan-400' },
  { id: 'white', name: 'White', src: createGradientSvg('#f8fafc', '#e2e8f0'), color: 'from-slate-50 to-slate-200' },
  { id: 'pink', name: 'Pink', src: createGradientSvg('#9d174d', '#f472b6'), color: 'from-pink-800 to-pink-400' },
];


export const BackgroundSelector: React.FC<BackgroundSelectorProps> = ({
  mode,
  backgroundImageUrl,
  isLoading,
  onModeChange,
  onBackgroundImageChange,
}) => {
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle blur toggle (single option using medium blur)
  const handleBlurToggle = useCallback(() => {
    if (mode.startsWith('blur')) {
      // If already on blur, turn it off
      onModeChange('none');
    } else {
      // Set to medium blur
      onModeChange('blur-medium');
    }
  }, [mode, onModeChange]);

  // Handle preset background selection
  const handlePresetSelect = useCallback(async (src: string) => {
    try {
      await onBackgroundImageChange(src);
      onModeChange('image');
    } catch (err) {
      // Error handled by parent
    }
  }, [onModeChange, onBackgroundImageChange]);

  // Handle custom image upload
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return;
    }

    setUploadingImage(true);

    try {
      // Convert to data URL
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      await onBackgroundImageChange(dataUrl);
      onModeChange('image');
    } catch (err) {
      // Error handled by parent
    } finally {
      setUploadingImage(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onModeChange, onBackgroundImageChange]);

  const isBlurMode = mode.startsWith('blur');
  const isImageMode = mode === 'image';
  const isNoneMode = mode === 'none';

  return (
    <div className="space-y-3">
      <label className="text-xs text-gray-400 block">Background</label>

      {/* Main options row */}
      <div className="flex gap-2">
        {/* None button */}
        <button
          onClick={() => {
            onModeChange('none');
            onBackgroundImageChange(null);
          }}
          className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors ${
            isNoneMode
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          <Ban className="w-3.5 h-3.5" />
          <span>None</span>
        </button>

        {/* Blur button (single toggle) */}
        <button
          onClick={handleBlurToggle}
          className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors ${
            isBlurMode
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Blur</span>
        </button>

        {/* Image button (shows active state when image mode) */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingImage}
          className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors ${
            isImageMode
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          } disabled:opacity-50`}
        >
          {uploadingImage ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          <span>Upload</span>
        </button>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Gradient backgrounds row */}
      <div className="flex gap-2">
        {GRADIENT_BACKGROUNDS.map((bg) => {
          const isSelected = isImageMode && backgroundImageUrl === bg.src;
          return (
            <button
              key={bg.id}
              onClick={() => handlePresetSelect(bg.src)}
              disabled={isLoading}
              className={`relative w-10 h-10 rounded-lg overflow-hidden border-2 transition-all ${
                isSelected
                  ? 'border-purple-500 ring-2 ring-purple-500/30'
                  : 'border-gray-600 hover:border-gray-500'
              } disabled:opacity-50`}
              title={bg.name}
            >
              <div className={`w-full h-full bg-gradient-to-b ${bg.color}`} />
              {isSelected && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Check className="w-4 h-4 text-white drop-shadow-md" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Loading background model...</span>
        </div>
      )}

      {/* Custom uploaded image preview */}
      {isImageMode && backgroundImageUrl && !GRADIENT_BACKGROUNDS.find(bg => bg.src === backgroundImageUrl) && (
        <div className="flex items-center gap-2 p-2 bg-gray-800 rounded-lg">
          <img
            src={backgroundImageUrl}
            alt="Custom background"
            className="w-12 h-8 object-cover rounded"
          />
          <span className="text-xs text-gray-300 flex-1">Custom image</span>
          <button
            onClick={() => {
              onBackgroundImageChange(null);
              onModeChange('none');
            }}
            className="text-xs text-gray-400 hover:text-red-400"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
};

export default BackgroundSelector;
