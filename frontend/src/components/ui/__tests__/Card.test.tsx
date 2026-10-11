import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../../test/test-utils';
import Card from '../Card';

// Helper function to get the card container element
// Card wraps children in an inner div, so we need to get the parent (outer card div)
const getCardContainer = (text: string) => {
  const contentElement = screen.getByText(text);
  // The structure is: outer card div > inner content div > children text
  const innerDiv = contentElement.closest('div');
  return innerDiv?.parentElement as HTMLElement;
};

describe('Card', () => {
  describe('Rendering', () => {
    it('renders children content', () => {
      render(<Card>Card content</Card>);
      expect(screen.getByText('Card content')).toBeInTheDocument();
    });

    it('renders with default styling', () => {
      render(<Card>Content</Card>);
      const card = getCardContainer('Content');
      expect(card).toHaveClass('bg-white');
      expect(card).toHaveClass('rounded-xl');
      expect(card).toHaveClass('border');
      expect(card).toHaveClass('border-gray-200');
      expect(card).toHaveClass('shadow-sm');
    });

    it('renders title when provided', () => {
      render(<Card title="Test Title">Content</Card>);
      expect(screen.getByText('Test Title')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Test Title');
    });

    it('renders subtitle when provided', () => {
      render(<Card subtitle="Test Subtitle">Content</Card>);
      expect(screen.getByText('Test Subtitle')).toBeInTheDocument();
    });

    it('renders both title and subtitle', () => {
      render(
        <Card title="Main Title" subtitle="Subtitle text">
          Content
        </Card>
      );
      expect(screen.getByText('Main Title')).toBeInTheDocument();
      expect(screen.getByText('Subtitle text')).toBeInTheDocument();
    });

    it('renders actions when provided', () => {
      const actions = <button>Action Button</button>;
      render(<Card actions={actions}>Content</Card>);
      expect(screen.getByRole('button', { name: 'Action Button' })).toBeInTheDocument();
    });

    it('renders title, subtitle, and actions together', () => {
      render(
        <Card title="Title" subtitle="Subtitle" actions={<button>Action</button>}>
          Content
        </Card>
      );
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Subtitle')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
    });
  });

  describe('Custom className', () => {
    it('applies custom className', () => {
      render(<Card className="custom-class">Content</Card>);
      const card = getCardContainer('Content');
      expect(card).toHaveClass('custom-class');
    });

    it('merges custom className with default classes', () => {
      render(<Card className="my-custom-class">Content</Card>);
      const card = getCardContainer('Content');
      expect(card).toHaveClass('bg-white');
      expect(card).toHaveClass('my-custom-class');
    });

    it('handles empty className', () => {
      render(<Card className="">Content</Card>);
      const card = getCardContainer('Content');
      expect(card).toHaveClass('bg-white');
    });
  });

  describe('Hoverable behavior', () => {
    it('does not apply hover classes by default', () => {
      render(<Card>Content</Card>);
      const card = getCardContainer('Content');
      expect(card).not.toHaveClass('hover:shadow-md');
      expect(card).not.toHaveClass('cursor-pointer');
    });

    it('applies hover classes when hoverable is true', () => {
      render(<Card hoverable>Content</Card>);
      const card = getCardContainer('Content');
      expect(card).toHaveClass('hover:shadow-md');
      expect(card).toHaveClass('hover:border-gray-300');
      expect(card).toHaveClass('cursor-pointer');
    });

    it('applies transition classes when hoverable', () => {
      render(<Card hoverable>Content</Card>);
      const card = getCardContainer('Content');
      expect(card).toHaveClass('transition-all');
      expect(card).toHaveClass('duration-200');
    });
  });

  describe('Click behavior', () => {
    it('calls onClick when clicked', () => {
      const handleClick = vi.fn();
      render(<Card onClick={handleClick}>Content</Card>);

      const card = getCardContainer('Content');
      fireEvent.click(card);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('has button role when onClick is provided', () => {
      const handleClick = vi.fn();
      render(<Card onClick={handleClick}>Content</Card>);

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('is focusable when onClick is provided', () => {
      const handleClick = vi.fn();
      render(<Card onClick={handleClick}>Content</Card>);

      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('tabIndex', '0');
    });

    it('does not have button role when onClick is not provided', () => {
      render(<Card>Content</Card>);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('is not focusable when onClick is not provided', () => {
      render(<Card>Content</Card>);
      const card = getCardContainer('Content');
      expect(card).not.toHaveAttribute('tabIndex');
    });
  });

  describe('Complex children', () => {
    it('renders complex nested children', () => {
      render(
        <Card>
          <div data-testid="child-1">First child</div>
          <div data-testid="child-2">Second child</div>
          <span>Nested text</span>
        </Card>
      );

      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
      expect(screen.getByText('Nested text')).toBeInTheDocument();
    });

    it('renders form elements as children', () => {
      render(
        <Card>
          <input type="text" placeholder="Test input" />
          <button type="submit">Submit</button>
        </Card>
      );

      expect(screen.getByPlaceholderText('Test input')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    });
  });

  describe('Header rendering', () => {
    it('does not render header section when no title, subtitle, or actions', () => {
      render(<Card>Content only</Card>);
      const heading = screen.queryByRole('heading');
      expect(heading).not.toBeInTheDocument();
    });

    it('renders header section when only title is provided', () => {
      render(<Card title="Just Title">Content</Card>);
      expect(screen.getByRole('heading')).toBeInTheDocument();
    });

    it('renders header section when only subtitle is provided', () => {
      render(<Card subtitle="Just Subtitle">Content</Card>);
      expect(screen.getByText('Just Subtitle')).toBeInTheDocument();
    });

    it('renders header section when only actions are provided', () => {
      render(<Card actions={<button>Only Action</button>}>Content</Card>);
      expect(screen.getByRole('button', { name: 'Only Action' })).toBeInTheDocument();
    });
  });

  describe('Title styling', () => {
    it('applies correct styling to title', () => {
      render(<Card title="Styled Title">Content</Card>);
      const title = screen.getByText('Styled Title');
      expect(title).toHaveClass('text-lg');
      expect(title).toHaveClass('font-semibold');
      expect(title).toHaveClass('text-gray-900');
    });

    it('applies correct styling to subtitle', () => {
      render(<Card subtitle="Styled Subtitle">Content</Card>);
      const subtitle = screen.getByText('Styled Subtitle');
      expect(subtitle).toHaveClass('text-sm');
      expect(subtitle).toHaveClass('text-gray-500');
    });
  });
});
