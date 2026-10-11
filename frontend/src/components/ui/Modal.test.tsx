/**
 * Modal Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from './Modal';

describe('Modal Component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    children: <div>Modal content</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset body overflow style
    document.body.style.overflow = '';
  });

  describe('Rendering', () => {
    it('renders when isOpen is true', () => {
      render(<Modal {...defaultProps} />);

      expect(screen.getByText('Modal content')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      render(<Modal {...defaultProps} isOpen={false} />);

      expect(screen.queryByText('Modal content')).not.toBeInTheDocument();
    });

    it('renders with title when provided', () => {
      render(<Modal {...defaultProps} title="Test Modal" />);

      expect(screen.getByRole('heading', { name: /test modal/i })).toBeInTheDocument();
    });

    it('renders children content', () => {
      render(
        <Modal {...defaultProps}>
          <p>Custom content</p>
          <button>Action</button>
        </Modal>
      );

      expect(screen.getByText('Custom content')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /action/i })).toBeInTheDocument();
    });
  });

  describe('Sizes', () => {
    it('applies small size class', () => {
      render(<Modal {...defaultProps} size="sm" />);

      const modal = document.querySelector('.max-w-sm');
      expect(modal).toBeInTheDocument();
    });

    it('applies medium size by default', () => {
      render(<Modal {...defaultProps} />);

      const modal = document.querySelector('.max-w-lg');
      expect(modal).toBeInTheDocument();
    });

    it('applies large size class', () => {
      render(<Modal {...defaultProps} size="lg" />);

      const modal = document.querySelector('.max-w-2xl');
      expect(modal).toBeInTheDocument();
    });

    it('applies extra large size class', () => {
      render(<Modal {...defaultProps} size="xl" />);

      const modal = document.querySelector('.max-w-4xl');
      expect(modal).toBeInTheDocument();
    });
  });

  describe('Close Button', () => {
    it('shows close button by default', () => {
      render(<Modal {...defaultProps} title="Test" />);

      expect(screen.getByRole('button', { name: /close modal/i })).toBeInTheDocument();
    });

    it('hides close button when showCloseButton is false', () => {
      render(<Modal {...defaultProps} showCloseButton={false} />);

      expect(screen.queryByRole('button', { name: /close modal/i })).not.toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();

      render(<Modal {...defaultProps} title="Test" onClose={onClose} />);

      await user.click(screen.getByRole('button', { name: /close modal/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Backdrop Click', () => {
    it('closes on backdrop click by default', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();

      render(<Modal {...defaultProps} onClose={onClose} />);

      // Click on backdrop (the fixed inset-0 element)
      const backdrop = document.querySelector('.bg-black\\/50');
      if (backdrop) {
        await user.click(backdrop);
      }

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close on backdrop click when closeOnBackdrop is false', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();

      render(<Modal {...defaultProps} onClose={onClose} closeOnBackdrop={false} />);

      const backdrop = document.querySelector('.bg-black\\/50');
      if (backdrop) {
        await user.click(backdrop);
      }

      expect(onClose).not.toHaveBeenCalled();
    });

    it('does not close when clicking inside modal content', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();

      render(<Modal {...defaultProps} onClose={onClose} />);

      await user.click(screen.getByText('Modal content'));
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Escape Key', () => {
    it('closes on Escape key press by default', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();

      render(<Modal {...defaultProps} onClose={onClose} />);

      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close on Escape when closeOnEscape is false', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();

      render(<Modal {...defaultProps} onClose={onClose} closeOnEscape={false} />);

      await user.keyboard('{Escape}');
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Body Scroll Lock', () => {
    it('prevents body scroll when open', () => {
      render(<Modal {...defaultProps} />);

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('restores body scroll when closed', () => {
      const { rerender } = render(<Modal {...defaultProps} />);

      expect(document.body.style.overflow).toBe('hidden');

      rerender(<Modal {...defaultProps} isOpen={false} />);

      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('Accessibility', () => {
    it('has dialog role', () => {
      render(<Modal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has aria-modal attribute', () => {
      render(<Modal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('is labelled by title when provided', () => {
      render(<Modal {...defaultProps} title="Accessible Modal" />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
    });

    it('focuses first focusable element on open', async () => {
      render(
        <Modal {...defaultProps} title="Focus Test">
          <input type="text" placeholder="First input" />
        </Modal>
      );

      await waitFor(() => {
        // The close button is the first focusable element
        expect(screen.getByRole('button', { name: /close modal/i })).toHaveFocus();
      });
    });

    it('traps focus within modal', async () => {
      const user = userEvent.setup();

      render(
        <Modal {...defaultProps} title="Focus Trap Test">
          <input type="text" placeholder="Input 1" />
          <input type="text" placeholder="Input 2" />
        </Modal>
      );

      // Wait for initial focus
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /close modal/i })).toHaveFocus();
      });

      // Tab through all focusable elements
      await user.tab(); // Input 1
      await user.tab(); // Input 2
      await user.tab(); // Back to close button (focus trap)

      expect(screen.getByRole('button', { name: /close modal/i })).toHaveFocus();
    });
  });

  describe('Focus Management', () => {
    it('restores focus to previously focused element on close', async () => {
      const user = userEvent.setup();

      // Create a button outside the modal
      const { rerender } = render(
        <>
          <button>Outside Button</button>
          <Modal isOpen={false} onClose={vi.fn()}>
            <div>Content</div>
          </Modal>
        </>
      );

      // Focus the outside button
      await user.click(screen.getByRole('button', { name: /outside button/i }));
      expect(screen.getByRole('button', { name: /outside button/i })).toHaveFocus();

      // Open modal
      rerender(
        <>
          <button>Outside Button</button>
          <Modal isOpen={true} onClose={vi.fn()} title="Test">
            <div>Content</div>
          </Modal>
        </>
      );

      // Close modal
      rerender(
        <>
          <button>Outside Button</button>
          <Modal isOpen={false} onClose={vi.fn()}>
            <div>Content</div>
          </Modal>
        </>
      );

      // Focus should be restored to the outside button
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /outside button/i })).toHaveFocus();
      });
    });
  });
});
