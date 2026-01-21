import { memo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Home,
  ClipboardList,
  FileSearch,
  UserCircle,
  X,
  Settings,
  ShieldCheck,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import OrganizationSwitcher from './OrganizationSwitcher';

interface SidebarProps {
  isOpen: boolean;
  isMobileOpen: boolean;
  onToggle: () => void;
  onMobileToggle: () => void;
}

const Sidebar = memo(({ isOpen, isMobileOpen, onToggle: _onToggle, onMobileToggle }: SidebarProps) => {
  const location = useLocation();
  const { user } = useAuth();
  const { isConnected } = useSocket();

  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: Home,
      permission: 'all',
    },
    {
      name: 'Tasks',
      href: '/tasks',
      icon: ClipboardList,
      permission: 'all',
    },
    {
      name: 'Reviews',
      href: '/reviews',
      icon: FileSearch,
      permission: ['OWNER', 'ADMIN', 'CREATOR', 'REVIEWER', 'manager', 'reviewer', 'admin'],
    },
    {
      name: 'Profile',
      href: '/profile',
      icon: UserCircle,
      permission: 'all',
    },
    {
      name: 'Settings',
      href: '/organizations/settings',
      icon: Settings,
      permission: 'all',
    },
    {
      name: 'Knowledge Base',
      href: '/knowledge-base',
      icon: BookOpen,
      permission: 'all',
    },
    {
      name: 'Admin',
      href: '/admin',
      icon: ShieldCheck,
      permission: 'system_admin',
    },
  ];

  const filteredNavigation = navigation.filter((item) => {
    if (item.permission === 'all') return true;
    if (item.permission === 'system_admin') {
      // Check if user is system admin - check both is_system_admin flag and system_role
      return (
        (user as any)?.is_system_admin === true || (user as any)?.system_role === 'SUPER_ADMIN'
      );
    }
    if (Array.isArray(item.permission)) {
      // Check both role and org_role (organization role), case-insensitive
      const userRole = user?.role?.toUpperCase() || '';
      const userOrgRole = ((user as any)?.org_role || '').toUpperCase();
      return item.permission.some(p =>
        p.toUpperCase() === userRole || p.toUpperCase() === userOrgRole
      );
    }
    return false;
  });

  const sidebarContent = (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Logo Section */}
      <div className={`border-b border-gray-200 transition-all duration-300 ${isOpen ? 'p-6' : 'p-4'}`}>
        <div className="flex items-center justify-center relative">
          {/* Logo container - centered in both states */}
          <div
            className="relative flex items-center justify-center transition-all duration-300"
            style={{
              width: isOpen ? '100%' : '56px',
              height: isOpen ? '56px' : '56px'
            }}
          >
            {/* Horizontal logo with styled text (shown when expanded) */}
            <img
              src="/cogveri-logo-horizontal.png"
              alt="CogVeri Logo"
              className={`transition-all duration-300 ${
                isOpen
                  ? 'opacity-100 scale-100'
                  : 'opacity-0 scale-75 absolute pointer-events-none'
              }`}
              style={{ height: '48px', width: 'auto', maxWidth: '100%' }}
            />
            {/* Icon only (shown when collapsed) - seamless play button */}
            <img
              src="/cogveri-icon.png"
              alt="CogVeri"
              className={`transition-all duration-300 ${
                isOpen
                  ? 'opacity-0 scale-75 absolute pointer-events-none'
                  : 'opacity-100 scale-100'
              }`}
              style={{ height: '48px', width: '48px', objectFit: 'contain' }}
            />
          </div>

          {/* Mobile close - only show on mobile, positioned absolutely */}
          <button
            onClick={onMobileToggle}
            aria-label="Close menu"
            className="lg:hidden absolute right-0 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Organization Switcher */}
      {isOpen && (
        <div className="border-b border-gray-200">
          <OrganizationSwitcher />
        </div>
      )}

      {/* Navigation */}
      <nav
        className="flex-1 px-3 py-6 space-y-1 overflow-y-auto"
        role="navigation"
        aria-label="Main navigation"
      >
        {filteredNavigation.map((item) => {
          // Special handling for task reviews - they should highlight Reviews, not Tasks
          let isActive = location.pathname.startsWith(item.href);
          if (item.name === 'Tasks' && location.pathname.includes('/review')) {
            isActive = false;
          }
          if (item.name === 'Reviews' && location.pathname.includes('/review')) {
            isActive = true;
          }
          return (
            <NavLink
              key={item.name}
              to={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/30'
                  : 'text-gray-700 hover:bg-gray-100 hover:text-brand-navy'
              } ${!isOpen && 'lg:justify-center lg:px-2'}`}
            >
              <item.icon
                className={`h-5 w-5 flex-shrink-0 ${isOpen ? 'mr-3' : ''} ${
                  isActive ? 'text-white' : 'text-gray-500 group-hover:text-primary-600'
                }`}
                aria-hidden="true"
              />
              {isOpen && <span>{item.name}</span>}
              {!isOpen && <span className="sr-only">{item.name}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-gray-200">
        {/* Connection Status */}
        <div className={`mb-4 flex items-center ${!isOpen && 'lg:justify-center'}`}>
          <div className="relative flex items-center">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}>
              {isConnected && (
                <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping opacity-75" />
              )}
            </div>
            {isOpen && (
              <span className="ml-2 text-xs text-gray-500">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            )}
          </div>
        </div>

        {/* User Info */}
        <div
          className={`flex items-center p-3 rounded-xl bg-gray-100 border border-gray-200 ${!isOpen && 'lg:justify-center lg:p-2'}`}
        >
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center ring-2 ring-primary-500/30">
              <span className="text-white text-sm font-semibold">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
          </div>
          {isOpen && (
            <div className="ml-3 min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 capitalize truncate">{user?.role}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform lg:hidden ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Mobile navigation"
        aria-hidden={!isMobileOpen}
      >
        {sidebarContent}
      </aside>

      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileToggle}
          aria-hidden="true"
        />
      )}

      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex lg:flex-col transition-all duration-300 ${
          isOpen ? 'w-72' : 'w-24'
        }`}
        aria-label="Desktop navigation"
      >
        {sidebarContent}
      </aside>
    </>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;
