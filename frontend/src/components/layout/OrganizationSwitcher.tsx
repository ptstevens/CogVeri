import { useState, useRef, useEffect } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { useOrganization } from '../../contexts/OrganizationContext';

const OrganizationSwitcher = () => {
  const { organizations, currentOrganization, switchOrganization, isLoading, isSwitching } =
    useOrganization();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSwitchOrganization = async (orgId: string) => {
    await switchOrganization(orgId);
    setIsOpen(false);
  };

  if (!currentOrganization) {
    return <div className="px-4 py-3 text-sm text-gray-500">No organization selected</div>;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading || isSwitching}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-left text-gray-900 hover:bg-gray-100 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary-600" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-gray-900">{currentOrganization.name}</p>
            <p className="text-xs text-gray-500">
              {currentOrganization.tier.charAt(0).toUpperCase() + currentOrganization.tier.slice(1)}{' '}
              Plan
            </p>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white rounded-lg shadow-lg ring-1 ring-black ring-opacity-5">
          <div className="py-2 max-h-48 overflow-y-auto">
            {organizations.map((org) => (
              <button
                key={org.id}
                onClick={() => handleSwitchOrganization(org.id)}
                className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 bg-gray-200 rounded-md flex items-center justify-center text-xs font-medium text-gray-600">
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                  <span>{org.name}</span>
                </div>
                {currentOrganization.id === org.id && (
                  <Check className="w-4 h-4 text-primary-600" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrganizationSwitcher;
