import { useState, useRef, useEffect, memo } from 'react';
import { Menu, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useOrganization } from '../../contexts/OrganizationContext';
import { useNavigate } from 'react-router-dom';
import NotificationCenter from './NotificationCenter';
import SearchBar from './SearchBar';

interface HeaderProps {
  onMenuClick: () => void;
  onDesktopMenuClick?: () => void; // Optional, for future use
}

const Header = memo(({ onMenuClick }: HeaderProps) => {
  const { user, logout } = useAuth();
  const { currentOrganization } = useOrganization();
  const navigate = useNavigate();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  const handleSettings = () => {
    navigate('/profile');
    setIsUserMenuOpen(false);
  };

  return (
    <header className="bg-white border-b border-gray-200 h-16 flex-shrink-0 z-10 relative shadow-sm">
      <div className="px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex items-center justify-between h-full">
          {/* Left side */}
          <div className="flex items-center">
            {/* Mobile menu button - only shown on mobile */}
            <button
              onClick={onMenuClick}
              aria-label="Open mobile menu"
              className="lg:hidden p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>

            <div className="ml-4 lg:ml-0 flex flex-col justify-center">
              {currentOrganization && (
                <h1 className="text-xl font-bold text-gray-900">{currentOrganization.name}</h1>
              )}
            </div>
          </div>

          {/* Center - Search Bar (hidden on mobile) */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8">
            <SearchBar
              onResultClick={(result) => {
                // Navigate based on result type
                if (result.entityType === 'task') {
                  navigate(`/tasks/${result.entityId}`);
                } else if (result.entityType === 'recording') {
                  navigate(`/recordings/${result.entityId}`);
                } else if (result.entityType === 'user') {
                  navigate(`/team/${result.entityId}`);
                }
              }}
            />
          </div>

          {/* Right side */}
          <div className="flex items-center space-x-4">
            {/* Notifications */}
            <NotificationCenter />

            {/* User menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center space-x-3 p-1 rounded-full hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center text-white text-xs font-medium shadow-sm">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
              </button>

              {/* Dropdown menu */}
              {isUserMenuOpen && (
                <div
                  className="absolute right-0 z-20 mt-2 w-48 origin-top-right bg-white rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none animate-fade-in"
                  role="menu"
                >
                  <div className="py-1" role="none">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    </div>
                    <button
                      onClick={handleSettings}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-primary-600 transition-colors"
                      role="menuitem"
                    >
                      <Settings className="w-4 h-4 mr-3" />
                      Settings
                    </button>
                    <button
                      onClick={handleLogout}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-red-600 transition-colors"
                      role="menuitem"
                    >
                      <LogOut className="w-4 h-4 mr-3" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
});

Header.displayName = 'Header';

export default Header;
