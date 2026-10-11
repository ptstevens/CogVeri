import React from 'react';
import { User, Users } from 'lucide-react';

export type ScopeValue = 'mine' | 'all';

export interface ScopeToggleProps {
  scope: ScopeValue;
  onScopeChange: (scope: ScopeValue) => void;
  isAdmin: boolean;
  mineLabel?: string;
  allLabel?: string;
  className?: string;
}

const ScopeToggle: React.FC<ScopeToggleProps> = ({
  scope,
  onScopeChange,
  isAdmin,
  mineLabel = 'My Tasks',
  allLabel = 'All Tasks',
  className = '',
}) => {
  return (
    <div
      className={`flex rounded-md border border-gray-300 overflow-hidden ${className}`}
      role="group"
      aria-label="Toggle between my items and all items"
    >
      <button
        onClick={() => onScopeChange('mine')}
        aria-pressed={scope === 'mine'}
        className={`px-4 py-2 flex items-center transition-colors ${
          scope === 'mine' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        <User className="h-4 w-4 mr-1.5" aria-hidden="true" />
        {mineLabel}
      </button>
      <button
        onClick={() => isAdmin && onScopeChange('all')}
        aria-pressed={scope === 'all'}
        disabled={!isAdmin}
        title={!isAdmin ? 'Only admins can view all items' : undefined}
        className={`px-4 py-2 flex items-center transition-colors border-l border-gray-300 ${
          scope === 'all'
            ? 'bg-blue-600 text-white'
            : isAdmin
              ? 'bg-white text-gray-700 hover:bg-gray-50'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
        }`}
      >
        <Users className="h-4 w-4 mr-1.5" aria-hidden="true" />
        {allLabel}
      </button>
    </div>
  );
};

export default ScopeToggle;
