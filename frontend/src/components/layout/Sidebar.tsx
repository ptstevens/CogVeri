import { NavLink, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  ClipboardDocumentListIcon,
  VideoCameraIcon,
  DocumentMagnifyingGlassIcon,
  UserCircleIcon,
  Bars3Icon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';

interface SidebarProps {
  isOpen: boolean;
  isMobileOpen: boolean;
  onToggle: () => void;
  onMobileToggle: () => void;
}

const Sidebar = ({ isOpen, isMobileOpen, onToggle, onMobileToggle }: SidebarProps) => {
  const location = useLocation();
  const { user } = useAuth();
  const { isConnected } = useSocket();

  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: HomeIcon,
      permission: 'all',
    },
    {
      name: 'Tasks',
      href: '/tasks',
      icon: ClipboardDocumentListIcon,
      permission: 'all',
    },
    {
      name: 'Record',
      href: '/record',
      icon: VideoCameraIcon,
      permission: 'all',
    },
    {
      name: 'Reviews',
      href: '/reviews',
      icon: DocumentMagnifyingGlassIcon,
      permission: ['manager', 'reviewer', 'admin'],
    },
    {
      name: 'Profile',
      href: '/profile',
      icon: UserCircleIcon,
      permission: 'all',
    },
  ];

  const filteredNavigation = navigation.filter((item) => {
    if (item.permission === 'all') return true;
    if (Array.isArray(item.permission)) {
      return item.permission.includes(user?.role || '');
    }
    return false;
  });

  const sidebarContent = (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Logo Section */}
      <div className="p-6 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          <div className={`transition-all duration-300 ${isOpen ? 'w-40' : 'w-12'}`}>
            <img
              src="/revui-logo.png"
              alt="Revui Logo"
              className="w-full h-auto object-contain"
            />
          </div>

          {/* Desktop toggle */}
          <button
            onClick={onToggle}
            className="hidden lg:flex items-center justify-center w-8 h-8 text-slate-400 hover:text-teal-400 hover:bg-slate-800 rounded-lg transition-all"
          >
            <Bars3Icon className="h-5 w-5" />
          </button>

          {/* Mobile close */}
          <button
            onClick={onMobileToggle}
            className="lg:hidden text-slate-400 hover:text-white"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto">
        {filteredNavigation.map((item) => {
          const isActive = location.pathname.startsWith(item.href);
          return (
            <NavLink
              key={item.name}
              to={item.href}
              className={`group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-teal-500 to-blue-500 text-white shadow-lg shadow-teal-500/50'
                  : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
              } ${!isOpen && 'lg:justify-center lg:px-2'}`}
            >
              <item.icon
                className={`h-6 w-6 flex-shrink-0 ${isOpen ? 'mr-3' : ''} ${
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-teal-400'
                }`}
              />
              {isOpen && <span>{item.name}</span>}
              {!isOpen && <span className="sr-only">{item.name}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-slate-700/50">
        {/* Connection Status */}
        <div className={`mb-4 flex items-center ${!isOpen && 'lg:justify-center'}`}>
          <div className="relative flex items-center">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}>
              {isConnected && (
                <div className="absolute inset-0 w-2 h-2 bg-green-400 rounded-full animate-ping opacity-75" />
              )}
            </div>
            {isOpen && (
              <span className="ml-2 text-xs text-slate-400">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            )}
          </div>
        </div>

        {/* User Info */}
        <div className={`flex items-center p-3 rounded-xl bg-slate-800/50 ${!isOpen && 'lg:justify-center lg:p-2'}`}>
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-blue-500 rounded-full flex items-center justify-center ring-2 ring-slate-700">
              <span className="text-white text-sm font-semibold">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
          </div>
          {isOpen && (
            <div className="ml-3 min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <p className="text-xs text-slate-400 capitalize truncate">{user?.role}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform lg:hidden ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </div>

      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileToggle}
        />
      )}

      {/* Desktop sidebar */}
      <div
        className={`hidden lg:flex lg:flex-col transition-all duration-300 ${
          isOpen ? 'w-72' : 'w-20'
        }`}
      >
        {sidebarContent}
      </div>
    </>
  );
};

export default Sidebar;
