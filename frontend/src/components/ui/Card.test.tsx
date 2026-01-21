/**
 * Card Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Card from './Card';

describe('Card Component', () => {
  describe('Rendering', () => {
    it('renders children content', () => {
      render(<Card>Card content</Card>);

      expect(screen.getByText('Card content')).toBeInTheDocument();
    });

    it('renders with title', () => {
      render(<Card title="Card Title">Content</Card>);

      expect(screen.getByText('Card Title')).toBeInTheDocument();
    });

    it('renders with subtitle', () => {
      render(<Card title="Title" subtitle="Card subtitle">Content</Card>);

      expect(screen.getByText('Card subtitle')).toBeInTheDocument();
    });

    it('renders with title and subtitle together', () => {
      render(
        <Card title="Main Title" subtitle="Supporting text">
          Content
        </Card>
      );

      expect(screen.getByText('Main Title')).toBeInTheDocument();
      expect(screen.getByText('Supporting text')).toBeInTheDocument();
    });

    it('renders actions slot', () => {
      render(
        <Card title="Title" actions={<button>Action</button>}>
          Content
        </Card>
      );

      expect(screen.getByRole('button', { name: /action/i })).toBeInTheDocument();
    });

    it('renders complex children', () => {
      render(
        <Card>
          <div data-testid="child-1">First child</div>
          <div data-testid="child-2">Second child</div>
        </Card>
      );

      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('applies default styling classes', () => {
      render(<Card>Content</Card>);

      const card = screen.getByText('Content').parentElement;
      expect(card).toHaveClass('bg-white', 'rounded-xl', 'border', 'shadow-sm');
    });

    it('applies custom className', () => {
      render(<Card className="custom-class">Content</Card>);

      const card = screen.getByText('Content').closest('.bg-white');
      expect(card).toHaveClass('custom-class');
    });

    it('applies hoverable styles when hoverable is true', () => {
      render(<Card hoverable>Content</Card>);

      const card = screen.getByText('Content').closest('.bg-white');
      expect(card).toHaveClass('hover:shadow-md', 'cursor-pointer');
    });

    it('does not apply hoverable styles by default', () => {
      render(<Card>Content</Card>);

      const card = screen.getByText('Content').closest('.bg-white');
      expect(card).not.toHaveClass('cursor-pointer');
    });
  });

  describe('Click Behavior', () => {
    it('calls onClick when clicked and onClick is provided', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<Card onClick={handleClick}>Clickable card</Card>);

      await user.click(screen.getByText('Clickable card'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not crash when clicked without onClick handler', async () => {
      const user = userEvent.setup();

      render(<Card>Non-clickable card</Card>);

      await user.click(screen.getByText('Non-clickable card'));
      // Should not throw
    });
  });

  describe('Accessibility', () => {
    it('has button role when onClick is provided', () => {
      render(<Card onClick={vi.fn()}>Clickable</Card>);

      const card = screen.getByRole('button');
      expect(card).toBeInTheDocument();
    });

    it('does not have button role without onClick', () => {
      render(<Card>Not clickable</Card>);

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('is focusable when onClick is provided', () => {
      render(<Card onClick={vi.fn()}>Focusable card</Card>);

      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('tabindex', '0');
    });

    it('is not focusable without onClick', () => {
      render(<Card>Non-focusable card</Card>);

      const card = screen.getByText('Non-focusable card').closest('.bg-white');
      expect(card).not.toHaveAttribute('tabindex');
    });

    it('can be activated with click when clickable', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<Card onClick={handleClick}>Keyboard accessible</Card>);

      const card = screen.getByRole('button');
      await user.click(card);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('title is rendered as h3 heading', () => {
      render(<Card title="Heading Title">Content</Card>);

      const heading = screen.getByRole('heading', { level: 3 });
      expect(heading).toHaveTextContent('Heading Title');
    });
  });

  describe('Header Section', () => {
    it('renders header section when title is provided', () => {
      render(<Card title="Title">Content</Card>);

      // Header section should exist with title
      expect(screen.getByText('Title')).toBeInTheDocument();
    });

    it('renders header section when subtitle is provided', () => {
      render(<Card subtitle="Subtitle">Content</Card>);

      expect(screen.getByText('Subtitle')).toBeInTheDocument();
    });

    it('renders header section when actions are provided', () => {
      render(
        <Card actions={<span>Actions</span>}>Content</Card>
      );

      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('does not render header section when no header props', () => {
      const { container } = render(<Card>Just content</Card>);

      // Should only have the content div
      const headerSection = container.querySelector('.mb-4');
      expect(headerSection).not.toBeInTheDocument();
    });
  });

  describe('Content Variations', () => {
    it('handles empty children gracefully', () => {
      const { container } = render(<Card>{null}</Card>);

      expect(container.querySelector('.bg-white')).toBeInTheDocument();
    });

    it('renders with only actions', () => {
      render(
        <Card actions={<button>Edit</button>}>
          Content
        </Card>
      );

      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    });

    it('renders title with proper styling', () => {
      render(<Card title="Styled Title">Content</Card>);

      const title = screen.getByText('Styled Title');
      expect(title).toHaveClass('text-lg', 'font-semibold');
    });

    it('renders subtitle with proper styling', () => {
      render(<Card title="Title" subtitle="Styled Subtitle">Content</Card>);

      const subtitle = screen.getByText('Styled Subtitle');
      expect(subtitle).toHaveClass('text-sm', 'text-gray-500');
    });
  });

  describe('Complex Compositions', () => {
    it('renders card with all features', () => {
      const handleClick = vi.fn();

      render(
        <Card
          title="Complete Card"
          subtitle="With all features"
          actions={<button>Action</button>}
          className="extra-class"
          hoverable
          onClick={handleClick}
        >
          <p>Main content</p>
          <button>Inner button</button>
        </Card>
      );

      expect(screen.getByText('Complete Card')).toBeInTheDocument();
      expect(screen.getByText('With all features')).toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(3); // Action, Inner, Card itself
      expect(screen.getByText('Main content')).toBeInTheDocument();
    });

    it('actions are positioned correctly relative to title', () => {
      const { container } = render(
        <Card title="Title" actions={<span data-testid="actions">Actions</span>}>
          Content
        </Card>
      );

      const header = container.querySelector('.flex.items-start.justify-between');
      expect(header).toBeInTheDocument();
    });
  });
});
