import { useState } from 'react';
import { Filter, ChevronDown } from 'lucide-react';
import { StepAnalysisResult } from '../../types/rubric.types';
import { StepResultCard } from './StepResultCard';

interface StepBreakdownProps {
  stepResults: StepAnalysisResult[];
  onSeek: (timestamp: number) => void;
}

type FilterOption = 'all' | 'completed' | 'partial' | 'missing';

export function StepBreakdown({ stepResults, onSeek }: StepBreakdownProps) {
  const [filter, setFilter] = useState<FilterOption>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const filteredResults = stepResults.filter((result) => {
    if (filter === 'all') return true;
    return result.status === filter;
  });

  const filterOptions: { value: FilterOption; label: string; count: number }[] = [
    { value: 'all', label: 'All Steps', count: stepResults.length },
    {
      value: 'completed',
      label: 'Completed',
      count: stepResults.filter((s) => s.status === 'completed').length,
    },
    {
      value: 'partial',
      label: 'Partial',
      count: stepResults.filter((s) => s.status === 'partial').length,
    },
    {
      value: 'missing',
      label: 'Missing',
      count: stepResults.filter((s) => s.status === 'missing').length,
    },
  ];

  const currentFilter = filterOptions.find((f) => f.value === filter);

  return (
    <div className="space-y-4">
      {/* Header with filter */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Step-by-Step Results</h3>

        {/* Filter dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Filter className="w-4 h-4 text-gray-500" />
            <span>{currentFilter?.label}</span>
            <span className="text-gray-400">({currentFilter?.count})</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
          </button>

          {isFilterOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsFilterOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg border shadow-lg z-20">
                {filterOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setFilter(option.value);
                      setIsFilterOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between ${
                      filter === option.value ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                    }`}
                  >
                    <span>{option.label}</span>
                    <span className="text-gray-400">{option.count}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Results list */}
      <div className="space-y-3">
        {filteredResults.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-gray-500">No steps match the current filter.</p>
          </div>
        ) : (
          filteredResults.map((result) => (
            <StepResultCard key={result.stepId} result={result} onSeek={onSeek} />
          ))
        )}
      </div>

      {/* Quick stats */}
      {filter === 'all' && (
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-green-50 rounded-lg p-4 border border-green-200 text-center">
            <div className="text-2xl font-bold text-green-600">
              {stepResults.filter((s) => s.status === 'completed').length}
            </div>
            <div className="text-sm text-green-700">Completed</div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200 text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {stepResults.filter((s) => s.status === 'partial').length}
            </div>
            <div className="text-sm text-yellow-700">Partial</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4 border border-red-200 text-center">
            <div className="text-2xl font-bold text-red-600">
              {stepResults.filter((s) => s.status === 'missing').length}
            </div>
            <div className="text-sm text-red-700">Missing</div>
          </div>
        </div>
      )}
    </div>
  );
}
