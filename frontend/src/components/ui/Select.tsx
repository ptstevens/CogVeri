import { forwardRef, SelectHTMLAttributes, useId } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  options: SelectOption[];
  error?: string;
  placeholder?: string;
  selectSize?: 'sm' | 'md' | 'lg';
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      options,
      error,
      placeholder,
      selectSize = 'md',
      disabled = false,
      required = false,
      className = '',
      id,
      value,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const errorId = `${selectId}-error`;

    const sizeClasses = {
      sm: 'px-3 py-1.5 text-sm pr-8',
      md: 'px-4 py-2 text-base pr-10',
      lg: 'px-4 py-3 text-lg pr-12',
    };

    const iconSizeClasses = {
      sm: 'right-2 h-4 w-4',
      md: 'right-3 h-5 w-5',
      lg: 'right-4 h-6 w-6',
    };

    const baseClasses =
      'w-full border rounded-lg appearance-none transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50 bg-white cursor-pointer';

    const stateClasses = error
      ? 'border-error focus:ring-error focus:border-error'
      : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500';

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-gray-700 mb-1.5">
            {label}
            {required && <span className="text-error ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            required={required}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? errorId : undefined}
            value={value}
            className={`${baseClasses} ${stateClasses} ${sizeClasses[selectSize]} ${className}`}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>

          <ChevronDown
            className={`absolute top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 ${iconSizeClasses[selectSize]}`}
          />
        </div>

        {error && (
          <p id={errorId} className="mt-1.5 text-sm text-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Select;
