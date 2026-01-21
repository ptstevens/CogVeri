import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import LoadingSpinner from '../ui/LoadingSpinner';
import { useDebounce } from '../../hooks/useDebounce';

interface SearchResult {
  entityType: 'task' | 'recording' | 'user';
  entityId: string;
  title: string;
  snippet: string;
  relevanceScore: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  took: number;
}

interface SearchBarProps {
  className?: string;
  placeholder?: string;
  onResultClick?: (result: SearchResult) => void;
}

const SearchBar = ({
  className = '',
  placeholder = 'Search tasks, recordings, people...',
  onResultClick,
}: SearchBarProps) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const debouncedQuery = useDebounce(query, 300);

  // Fetch search results
  const { data, isLoading, isFetching } = useQuery<{ data: SearchResponse }>({
    queryKey: ['search', debouncedQuery],
    queryFn: () => api.get(`/search?q=${encodeURIComponent(debouncedQuery)}&limit=8`),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30000,
  });

  const results = data?.data?.results || [];
  const totalResults = data?.data?.total || 0;

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        resultsRef.current &&
        !resultsRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!isOpen || results.length === 0) {
        if (event.key === 'ArrowDown' || event.key === 'Enter') {
          setIsOpen(true);
        }
        return;
      }

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
          break;
        case 'ArrowUp':
          event.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;
        case 'Enter':
          event.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < results.length) {
            handleResultClick(results[selectedIndex]);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setSelectedIndex(-1);
          inputRef.current?.blur();
          break;
      }
    },
    [isOpen, results, selectedIndex]
  );

  // Handle result click
  const handleResultClick = (result: SearchResult) => {
    if (onResultClick) {
      onResultClick(result);
    } else {
      // Default navigation
      switch (result.entityType) {
        case 'task':
          navigate(`/tasks/${result.entityId}`);
          break;
        case 'recording':
          const taskId = (result.metadata as any)?.task_id;
          if (taskId) {
            navigate(`/tasks/${taskId}/recordings/${result.entityId}`);
          } else {
            navigate(`/recordings/${result.entityId}`);
          }
          break;
        case 'user':
          navigate(`/team/${result.entityId}`);
          break;
      }
    }

    setQuery('');
    setIsOpen(false);
    setSelectedIndex(-1);
  };

  // Get icon for entity type
  const getEntityIcon = (type: SearchResult['entityType']) => {
    switch (type) {
      case 'task':
        return (
          <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        );
      case 'recording':
        return (
          <svg className="h-4 w-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        );
      case 'user':
        return (
          <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        );
    }
  };

  // Get label for entity type
  const getEntityLabel = (type: SearchResult['entityType']) => {
    switch (type) {
      case 'task':
        return 'Task';
      case 'recording':
        return 'Recording';
      case 'user':
        return 'Person';
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full h-10 pl-10 pr-4 text-sm bg-gray-100 border-0 rounded-lg text-gray-900 placeholder-gray-500 focus:bg-white focus:ring-2 focus:ring-primary-500 transition-colors"
        />
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          {isLoading || isFetching ? (
            <LoadingSpinner size="sm" />
          ) : (
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </div>
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && query.length >= 2 && (
        <div
          ref={resultsRef}
          className="absolute z-50 w-full mt-2 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden"
        >
          {results.length > 0 ? (
            <>
              <ul className="max-h-96 overflow-y-auto">
                {results.map((result, index) => (
                  <li key={`${result.entityType}-${result.entityId}`}>
                    <button
                      onClick={() => handleResultClick(result)}
                      className={`w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-gray-50 transition-colors ${
                        index === selectedIndex ? 'bg-primary-50' : ''
                      }`}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {getEntityIcon(result.entityType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 truncate">
                            {result.title}
                          </span>
                          <span className="flex-shrink-0 text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                            {getEntityLabel(result.entityType)}
                          </span>
                        </div>
                        {result.snippet && (
                          <p
                            className="mt-0.5 text-sm text-gray-500 line-clamp-2"
                            dangerouslySetInnerHTML={{ __html: result.snippet }}
                          />
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {totalResults > results.length && (
                <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
                  <button
                    onClick={() => {
                      navigate(`/search?q=${encodeURIComponent(query)}`);
                      setIsOpen(false);
                    }}
                    className="text-sm text-primary-600 hover:text-primary-700"
                  >
                    View all {totalResults} results
                  </button>
                </div>
              )}
            </>
          ) : !isLoading && !isFetching ? (
            <div className="px-4 py-8 text-center text-gray-500">
              <svg className="mx-auto h-8 w-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm">No results found for "{query}"</p>
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <LoadingSpinner size="md" />
            </div>
          )}
        </div>
      )}

      {/* Keyboard shortcuts hint */}
      {isOpen && results.length > 0 && (
        <div className="absolute -bottom-6 left-0 text-xs text-gray-400">
          <span className="mr-2">↑↓ to navigate</span>
          <span className="mr-2">↵ to select</span>
          <span>esc to close</span>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
