import React, { useState, useRef, useEffect } from 'react';

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
  className?: string;
}

// Curated emoji categories for business/productivity use
const EMOJI_CATEGORIES = {
  'Tasks & Work': [
    '📝',
    '✅',
    '📋',
    '📌',
    '🎯',
    '💼',
    '📁',
    '📂',
    '🗂️',
    '📊',
    '📈',
    '📉',
    '🏆',
    '⭐',
    '🌟',
    '💡',
  ],
  Communication: [
    '💬',
    '📧',
    '📨',
    '📩',
    '✉️',
    '📞',
    '📱',
    '💻',
    '🖥️',
    '🎥',
    '📹',
    '🎬',
    '📺',
    '🔔',
    '📢',
    '🗣️',
  ],
  'Time & Schedule': [
    '⏰',
    '⌛',
    '⏳',
    '📅',
    '📆',
    '🕐',
    '🕑',
    '🕒',
    '⚡',
    '🚀',
    '🔄',
    '⏪',
    '⏩',
    '▶️',
    '⏸️',
    '⏹️',
  ],
  'Status & Priority': [
    '🔴',
    '🟠',
    '🟡',
    '🟢',
    '🔵',
    '🟣',
    '⚪',
    '⚫',
    '🚨',
    '⚠️',
    '✨',
    '🔥',
    '❗',
    '❓',
    '💯',
    '🎉',
  ],
  'People & Teams': [
    '👤',
    '👥',
    '🧑‍💻',
    '👨‍💼',
    '👩‍💼',
    '🤝',
    '👋',
    '✋',
    '👍',
    '👎',
    '👏',
    '🙌',
    '💪',
    '🧠',
    '👀',
    '🎓',
  ],
  'Documents & Files': [
    '📄',
    '📃',
    '📑',
    '🗒️',
    '📖',
    '📚',
    '🔖',
    '🏷️',
    '📎',
    '🖇️',
    '✂️',
    '📐',
    '📏',
    '🖊️',
    '✏️',
    '🖍️',
  ],
  'Tools & Settings': [
    '🔧',
    '🔨',
    '⚙️',
    '🛠️',
    '🔩',
    '🔑',
    '🔒',
    '🔓',
    '🔍',
    '🔎',
    '💾',
    '💿',
    '📡',
    '🔌',
    '🔋',
    '⌨️',
  ],
  'Categories & Labels': [
    '📦',
    '🎁',
    '🏠',
    '🏢',
    '🏭',
    '🏪',
    '🛒',
    '💰',
    '💵',
    '💳',
    '🧾',
    '📮',
    '🗃️',
    '🗄️',
    '🗑️',
    '📤',
  ],
};

const EmojiPicker: React.FC<EmojiPickerProps> = ({ value, onChange, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    Object.keys(EMOJI_CATEGORIES)[0]
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleEmojiSelect = (emoji: string) => {
    onChange(emoji);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors flex items-center justify-center gap-2"
      >
        <span className="text-2xl leading-none">{value || '📝'}</span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Picker Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg">
          {/* Category Tabs */}
          <div className="flex overflow-x-auto border-b border-gray-200 p-1 gap-1 scrollbar-thin">
            {Object.keys(EMOJI_CATEGORIES).map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={`px-2 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
                  selectedCategory === category
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Emoji Grid */}
          <div className="p-2 max-h-48 overflow-y-auto">
            <div className="grid grid-cols-8 gap-1">
              {EMOJI_CATEGORIES[selectedCategory as keyof typeof EMOJI_CATEGORIES].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleEmojiSelect(emoji)}
                  className={`p-2 text-xl rounded hover:bg-gray-100 transition-colors ${
                    value === emoji ? 'bg-blue-100 ring-2 ring-blue-500' : ''
                  }`}
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Current Selection */}
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 rounded-b-lg flex items-center justify-between">
            <span className="text-xs text-gray-500">Selected:</span>
            <span className="text-2xl">{value || '📝'}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmojiPicker;
