import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';

const DEFAULT_TASK_TYPES = [
  'Software Demo',
  'Bug Report',
  'Training Video',
  'Process Documentation',
  'Customer Onboarding',
  'Feature Walkthrough',
  'Troubleshooting Guide',
];

export interface TaskTypeSelectorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
}

export function TaskTypeSelector({
  value,
  onChange,
  placeholder = 'Select or type a task type...',
  label,
  error,
  disabled = false,
}: TaskTypeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const id = useId();
  const inputId = `${id}-input`;
  const listboxId = `${id}-listbox`;
  const errorId = `${id}-error`;

  // Combine default and custom types
  const allTypes = [...DEFAULT_TASK_TYPES, ...customTypes];

  // Filter options based on input
  const filteredOptions = allTypes.filter((type) =>
    type.toLowerCase().includes(inputValue.toLowerCase())
  );

  // Check if input is a new custom value
  const isNewCustomValue =
    inputValue.trim() !== '' &&
    !allTypes.some((type) => type.toLowerCase() === inputValue.toLowerCase());

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  const handleSelect = useCallback(
    (selectedValue: string) => {
      onChange(selectedValue);
      setInputValue('');
      setIsOpen(false);
      setHighlightedIndex(-1);
    },
    [onChange]
  );

  const handleAddCustom = useCallback(() => {
    const trimmedValue = inputValue.trim();
    if (trimmedValue && isNewCustomValue) {
      setCustomTypes((prev) => [...prev, trimmedValue]);
      handleSelect(trimmedValue);
    }
  }, [inputValue, isNewCustomValue, handleSelect]);

  const handleClear = useCallback(() => {
    onChange('');
    setInputValue('');
    inputRef.current?.focus();
  }, [onChange]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const totalOptions = filteredOptions.length + (isNewCustomValue ? 1 : 0);

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          }
          setHighlightedIndex((prev) => (prev < totalOptions - 1 ? prev + 1 : 0));
          break;

        case 'ArrowUp':
          event.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : totalOptions - 1));
          break;

        case 'Enter':
          event.preventDefault();
          if (highlightedIndex >= 0) {
            if (highlightedIndex < filteredOptions.length) {
              handleSelect(filteredOptions[highlightedIndex]);
            } else if (isNewCustomValue) {
              handleAddCustom();
            }
          } else if (isNewCustomValue) {
            handleAddCustom();
          }
          break;

        case 'Escape':
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;

        case 'Tab':
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;
      }
    },
    [isOpen, highlightedIndex, filteredOptions, isNewCustomValue, handleSelect, handleAddCustom]
  );

  const baseInputClasses =
    'w-full border rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50 shadow-sm placeholder:text-gray-400';

  const stateClasses = error
    ? 'border-error text-error-900 focus:ring-error-100 focus:border-error'
    : 'border-gray-300 focus:ring-primary-100 focus:border-primary-500 hover:border-gray-400';

  return (
    <div className="w-full" ref={containerRef}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
        </label>
      )}

      <div className="relative">
        {/* Selected value display or input */}
        {value && !isOpen ? (
          <div
            className={`${baseInputClasses} ${stateClasses} px-4 py-2 flex items-center justify-between cursor-pointer ${
              disabled ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            onClick={() => !disabled && setIsOpen(true)}
            onKeyDown={(e) => {
              if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                setIsOpen(true);
              }
            }}
            tabIndex={disabled ? -1 : 0}
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-haspopup="listbox"
          >
            <span className="text-gray-900">{value}</span>
            <div className="flex items-center gap-1">
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClear();
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  aria-label="Clear selection"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <ChevronDown className="w-5 h-5 text-gray-400" />
            </div>
          </div>
        ) : (
          <div className="relative">
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setIsOpen(true);
                setHighlightedIndex(-1);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              className={`${baseInputClasses} ${stateClasses} px-4 py-2 pr-10`}
              role="combobox"
              aria-expanded={isOpen}
              aria-controls={listboxId}
              aria-haspopup="listbox"
              aria-autocomplete="list"
              aria-describedby={error ? errorId : undefined}
            />
            <ChevronDown
              className={`absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </div>
        )}

        {/* Dropdown */}
        {isOpen && !disabled && (
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="absolute z-50 mt-1 w-full max-h-60 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1"
          >
            {filteredOptions.length === 0 && !isNewCustomValue && (
              <li className="px-4 py-2 text-sm text-gray-500">No options found</li>
            )}

            {filteredOptions.map((option, index) => (
              <li
                key={option}
                role="option"
                aria-selected={value === option}
                className={`px-4 py-2 text-sm cursor-pointer transition-colors ${
                  highlightedIndex === index
                    ? 'bg-primary-50 text-primary-700'
                    : value === option
                      ? 'bg-gray-50 text-gray-900'
                      : 'text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => handleSelect(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                {option}
                {!DEFAULT_TASK_TYPES.includes(option) && (
                  <span className="ml-2 text-xs text-gray-400">(custom)</span>
                )}
              </li>
            ))}

            {/* Option to add custom value */}
            {isNewCustomValue && (
              <li
                role="option"
                aria-selected={false}
                className={`px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2 border-t border-gray-100 ${
                  highlightedIndex === filteredOptions.length
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-primary-600 hover:bg-gray-50'
                }`}
                onClick={handleAddCustom}
                onMouseEnter={() => setHighlightedIndex(filteredOptions.length)}
              >
                <Plus className="w-4 h-4" />
                <span>
                  Add "{inputValue.trim()}"
                </span>
              </li>
            )}
          </ul>
        )}
      </div>

      {error && (
        <p id={errorId} className="mt-1.5 text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default TaskTypeSelector;
