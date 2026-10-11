import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { RichTextContent } from './RichTextEditor';

interface ExpandableRichTextProps {
  content: string;
  maxCollapsedHeight?: number;
  className?: string;
}

/**
 * Expandable rich text component that properly renders HTML/markdown content
 * with overflow detection and expand/collapse functionality.
 *
 * Uses RichTextContent internally for proper HTML/markdown rendering.
 */
export const ExpandableRichText = React.memo(
  ({ content, maxCollapsedHeight = 60, className = '' }: ExpandableRichTextProps) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [needsExpansion, setNeedsExpansion] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    // Check if content overflows the collapsed height
    const checkOverflow = useCallback(() => {
      if (contentRef.current) {
        const isOverflowing = contentRef.current.scrollHeight > maxCollapsedHeight;
        setNeedsExpansion(isOverflowing);
      }
    }, [maxCollapsedHeight]);

    // Detect overflow on mount, content change, and after fonts load
    useEffect(() => {
      checkOverflow();

      // Re-check after fonts load (rich text may change size)
      if (document.fonts?.ready) {
        document.fonts.ready.then(checkOverflow);
      }
    }, [content, maxCollapsedHeight, checkOverflow]);

    // Handle window resize
    useEffect(() => {
      const handleResize = () => {
        // Debounce resize checks
        const timeoutId = setTimeout(checkOverflow, 100);
        return () => clearTimeout(timeoutId);
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, [checkOverflow]);

    const handleToggle = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent card click when toggling
        setIsExpanded(!isExpanded);
      },
      [isExpanded]
    );

    if (!content) {
      return null;
    }

    return (
      <div className={className}>
        {/* Content container with overflow control */}
        <div
          ref={contentRef}
          className={`relative overflow-hidden transition-[max-height] duration-200 ease-out`}
          style={{
            maxHeight: isExpanded || !needsExpansion ? 'none' : `${maxCollapsedHeight}px`,
          }}
        >
          <RichTextContent
            content={content}
            className="prose prose-sm max-w-none text-gray-600 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          />

          {/* Gradient fade overlay when collapsed and overflowing */}
          {!isExpanded && needsExpansion && (
            <div
              className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white to-transparent pointer-events-none"
              aria-hidden="true"
            />
          )}
        </div>

        {/* Show more/less toggle button */}
        {needsExpansion && (
          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse description' : 'Expand description'}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium mt-1 inline-flex items-center gap-0.5 transition-colors"
          >
            {isExpanded ? (
              <>
                Show less <ChevronUp className="h-3 w-3" aria-hidden="true" />
              </>
            ) : (
              <>
                Show more <ChevronDown className="h-3 w-3" aria-hidden="true" />
              </>
            )}
          </button>
        )}
      </div>
    );
  }
);

ExpandableRichText.displayName = 'ExpandableRichText';
