import { useState, useRef, useEffect } from 'react';

interface VideoQuality {
  quality: string;
  label: string;
  width: number;
  height: number;
  bitrate?: number;
  url: string;
}

interface QualitySelectorProps {
  qualities: VideoQuality[];
  currentQuality: string;
  onQualityChange: (quality: VideoQuality) => void;
  autoEnabled?: boolean;
  onAutoToggle?: (enabled: boolean) => void;
  className?: string;
}

const getQualityLabel = (quality: string): string => {
  switch (quality.toLowerCase()) {
    case 'low':
      return '480p';
    case 'medium':
      return '720p';
    case 'high':
      return '1080p';
    case 'original':
      return 'Original';
    case 'auto':
      return 'Auto';
    default:
      return quality;
  }
};

const getQualityIcon = (quality: string) => {
  const isHD = ['high', '1080p', 'original'].includes(quality.toLowerCase());

  if (isHD) {
    return (
      <span className="text-xs font-bold bg-blue-600 text-white px-1 rounded">
        HD
      </span>
    );
  }

  return null;
};

const QualitySelector = ({
  qualities,
  currentQuality,
  onQualityChange,
  autoEnabled = false,
  onAutoToggle,
  className = '',
}: QualitySelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Sort qualities by resolution (highest first)
  const sortedQualities = [...qualities].sort((a, b) => b.height - a.height);

  const currentQualityData = qualities.find(q => q.quality === currentQuality);

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 text-white hover:bg-white/20 rounded transition-colors"
        title="Video Quality"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <span className="text-sm font-medium">
          {autoEnabled ? 'Auto' : getQualityLabel(currentQuality)}
        </span>
        {getQualityIcon(currentQuality)}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-48 bg-gray-900/95 rounded-lg shadow-xl overflow-hidden backdrop-blur-sm">
          <div className="py-1">
            {/* Auto option */}
            {onAutoToggle && (
              <>
                <button
                  onClick={() => {
                    onAutoToggle(!autoEnabled);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-2 flex items-center justify-between text-left hover:bg-white/10 transition-colors ${
                    autoEnabled ? 'text-blue-400' : 'text-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Auto</span>
                    {autoEnabled && currentQualityData && (
                      <span className="text-xs text-gray-400">
                        ({getQualityLabel(currentQuality)})
                      </span>
                    )}
                  </div>
                  {autoEnabled && (
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
                <div className="border-t border-white/10 my-1" />
              </>
            )}

            {/* Quality options */}
            {sortedQualities.map((quality) => (
              <button
                key={quality.quality}
                onClick={() => {
                  onQualityChange(quality);
                  if (onAutoToggle) {
                    onAutoToggle(false);
                  }
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2 flex items-center justify-between text-left hover:bg-white/10 transition-colors ${
                  !autoEnabled && currentQuality === quality.quality
                    ? 'text-blue-400'
                    : 'text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{getQualityLabel(quality.quality)}</span>
                  {getQualityIcon(quality.quality)}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    {quality.width}x{quality.height}
                  </span>
                  {!autoEnabled && currentQuality === quality.quality && (
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default QualitySelector;
