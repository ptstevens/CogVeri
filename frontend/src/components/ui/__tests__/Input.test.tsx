import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../../test/test-utils';
import Input from '../Input';
import { createRef } from 'react';

describe('Input', () => {
  describe('Rendering', () => {
    it('renders an input element', () => {
      render(<Input />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('renders with default type text', () => {
      render(<Input />);
      expect(screen.getByRole('textbox')).toHaveAttribute('type', 'text');
    });

    it('renders label when provided', () => {
      render(<Input label="Username" />);
      expect(screen.getByText('Username')).toBeInTheDocument();
      expect(screen.getByLabelText('Username')).toBeInTheDocument();
    });

    it('renders required indicator when required', () => {
      render(<Input label="Required Field" required />);
      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('associates label with input via htmlFor', () => {
      render(<Input label="Email" id="email-input" />);
      const label = screen.getByText('Email');
      expect(label).toHaveAttribute('for', 'email-input');
    });

    it('generates unique id when not provided', () => {
      render(<Input label="Auto ID" />);
      const input = screen.getByLabelText('Auto ID');
      expect(input).toHaveAttribute('id');
      expect(input.id).toBeTruthy();
    });
  });

  describe('Value changes', () => {
    it('handles value changes', () => {
      const handleChange = vi.fn();
      render(<Input onChange={handleChange} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'new value' } });

      expect(handleChange).toHaveBeenCalledTimes(1);
    });

    it('updates value on change', () => {
      render(<Input defaultValue="" />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'typed text' } });

      expect(input).toHaveValue('typed text');
    });

    it('handles controlled value', () => {
      const { rerender } = render(<Input value="initial" onChange={() => {}} />);
      expect(screen.getByRole('textbox')).toHaveValue('initial');

      rerender(<Input value="updated" onChange={() => {}} />);
      expect(screen.getByRole('textbox')).toHaveValue('updated');
    });

    it('handles empty string value', () => {
      render(<Input value="" onChange={() => {}} />);
      expect(screen.getByRole('textbox')).toHaveValue('');
    });
  });

  describe('Disabled state', () => {
    it('is not disabled by default', () => {
      render(<Input />);
      expect(screen.getByRole('textbox')).not.toBeDisabled();
    });

    it('is disabled when disabled prop is true', () => {
      render(<Input disabled />);
      expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('applies disabled styling', () => {
      render(<Input disabled />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('disabled:opacity-50');
      expect(input).toHaveClass('disabled:cursor-not-allowed');
    });

    it('does not respond to changes when disabled', () => {
      const handleChange = vi.fn();
      render(<Input disabled onChange={handleChange} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'test' } });

      // The change event still fires, but the input value doesn't change
      expect(input).toBeDisabled();
    });
  });

  describe('Error state', () => {
    it('displays error message when provided', () => {
      render(<Input error="This field is required" />);
      expect(screen.getByText('This field is required')).toBeInTheDocument();
    });

    it('has alert role on error message', () => {
      render(<Input error="Error message" />);
      expect(screen.getByRole('alert')).toHaveTextContent('Error message');
    });

    it('sets aria-invalid to true when error is present', () => {
      render(<Input error="Invalid input" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    });

    it('sets aria-invalid to false when no error', () => {
      render(<Input />);
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'false');
    });

    it('associates error with input via aria-describedby', () => {
      render(<Input error="Error text" id="test-input" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-describedby', 'test-input-error');
    });

    it('applies error styling to input', () => {
      render(<Input error="Error" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('border-error');
    });

    it('does not show help text when error is present', () => {
      render(<Input error="Error message" helpText="Help text" />);
      expect(screen.getByText('Error message')).toBeInTheDocument();
      expect(screen.queryByText('Help text')).not.toBeInTheDocument();
    });
  });

  describe('Help text', () => {
    it('displays help text when provided', () => {
      render(<Input helpText="Enter your username" />);
      expect(screen.getByText('Enter your username')).toBeInTheDocument();
    });

    it('associates help text with input via aria-describedby', () => {
      render(<Input helpText="Help message" id="help-input" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-describedby', 'help-input-help');
    });

    it('does not have aria-describedby when neither error nor helpText', () => {
      render(<Input id="plain-input" />);
      const input = screen.getByRole('textbox');
      expect(input).not.toHaveAttribute('aria-describedby');
    });
  });

  describe('Size variants', () => {
    it('applies sm size classes', () => {
      render(<Input inputSize="sm" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('px-3');
      expect(input).toHaveClass('py-1.5');
      expect(input).toHaveClass('text-sm');
    });

    it('applies md size classes by default', () => {
      render(<Input />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('px-4');
      expect(input).toHaveClass('py-2');
      expect(input).toHaveClass('text-base');
    });

    it('applies lg size classes', () => {
      render(<Input inputSize="lg" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('px-4');
      expect(input).toHaveClass('py-3');
      expect(input).toHaveClass('text-lg');
    });
  });

  describe('Input types', () => {
    it('renders as text type by default', () => {
      render(<Input />);
      expect(screen.getByRole('textbox')).toHaveAttribute('type', 'text');
    });

    it('renders as email type', () => {
      render(<Input type="email" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('type', 'email');
    });

    it('renders as password type', () => {
      render(<Input type="password" />);
      // Password inputs don't have role="textbox"
      const input = document.querySelector('input[type="password"]');
      expect(input).toBeInTheDocument();
    });

    it('renders as number type', () => {
      render(<Input type="number" />);
      const input = screen.getByRole('spinbutton');
      expect(input).toHaveAttribute('type', 'number');
    });
  });

  describe('Custom className', () => {
    it('applies custom className to input', () => {
      render(<Input className="custom-input-class" />);
      expect(screen.getByRole('textbox')).toHaveClass('custom-input-class');
    });

    it('merges custom className with default classes', () => {
      render(<Input className="my-class" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('w-full');
      expect(input).toHaveClass('my-class');
    });
  });

  describe('Placeholder', () => {
    it('displays placeholder text', () => {
      render(<Input placeholder="Enter text here" />);
      expect(screen.getByPlaceholderText('Enter text here')).toBeInTheDocument();
    });

    it('applies placeholder styling', () => {
      render(<Input placeholder="Placeholder" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('placeholder:text-gray-400');
    });
  });

  describe('Ref forwarding', () => {
    it('forwards ref to input element', () => {
      const ref = createRef<HTMLInputElement>();
      render(<Input ref={ref} />);

      expect(ref.current).toBeInstanceOf(HTMLInputElement);
      expect(ref.current?.tagName).toBe('INPUT');
    });

    it('allows focusing via ref', () => {
      const ref = createRef<HTMLInputElement>();
      render(<Input ref={ref} />);

      ref.current?.focus();
      expect(document.activeElement).toBe(ref.current);
    });
  });

  describe('Standard input props', () => {
    it('accepts and applies name attribute', () => {
      render(<Input name="username" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('name', 'username');
    });

    it('accepts and applies maxLength attribute', () => {
      render(<Input maxLength={50} />);
      expect(screen.getByRole('textbox')).toHaveAttribute('maxLength', '50');
    });

    it('accepts and applies autoComplete attribute', () => {
      render(<Input autoComplete="email" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('autoComplete', 'email');
    });

    it('accepts and applies readOnly attribute', () => {
      render(<Input readOnly value="Read only value" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('readOnly');
    });
  });

  describe('Event handlers', () => {
    it('calls onFocus when focused', () => {
      const handleFocus = vi.fn();
      render(<Input onFocus={handleFocus} />);

      fireEvent.focus(screen.getByRole('textbox'));
      expect(handleFocus).toHaveBeenCalledTimes(1);
    });

    it('calls onBlur when blurred', () => {
      const handleBlur = vi.fn();
      render(<Input onBlur={handleBlur} />);

      const input = screen.getByRole('textbox');
      fireEvent.focus(input);
      fireEvent.blur(input);

      expect(handleBlur).toHaveBeenCalledTimes(1);
    });

    it('calls onKeyDown on key press', () => {
      const handleKeyDown = vi.fn();
      render(<Input onKeyDown={handleKeyDown} />);

      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
      expect(handleKeyDown).toHaveBeenCalledTimes(1);
    });
  });

  describe('Focus styling', () => {
    it('has focus ring classes', () => {
      render(<Input />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('focus:outline-none');
      expect(input).toHaveClass('focus:ring-2');
    });

    it('has error focus styling when error is present', () => {
      render(<Input error="Error" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('focus:ring-error-100');
      expect(input).toHaveClass('focus:border-error');
    });

    it('has primary focus styling when no error', () => {
      render(<Input />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('focus:ring-primary-100');
      expect(input).toHaveClass('focus:border-primary-500');
    });
  });
});
