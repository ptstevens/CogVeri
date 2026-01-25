import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Settings,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { isPrimaryAdmin } from '../../config/sysadmin';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
  primaryAdminOnly?: boolean;
  hidden?: boolean; // Hide from nav without removing code
}

const adminNavItems: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
    end: true, // Only match exact path
  },
  {
    name: 'Organizations',
    href: '/admin/organizations',
    icon: Building2,
  },
  {
    name: 'Pricing & Tiers',
    href: '/admin/pricing',
    icon: CreditCard,
    hidden: true, // Hidden for now - enable when billing features are needed
  },
  {
    name: 'Settings',
    href: '/admin/settings',
    icon: Settings,
  },
  {
    name: 'Video Upload',
    href: '/admin/video-upload',
    icon: Upload,
  },
  {
    name: 'SYSADMIN',
    href: '/admin/system-admins',
    icon: ShieldCheck,
    primaryAdminOnly: true, // Only visible to admin@cogveri.com
  },
];

export default function AdminLayout() {
  const { user } = useAuth();
  const isUserPrimaryAdmin = isPrimaryAdmin(user);

  // Filter nav items based on user permissions and visibility
  const filteredNavItems = adminNavItems.filter((item) => {
    // Skip hidden items
    if (item.hidden) {
      return false;
    }
    // If primaryAdminOnly is set, only show to admin@cogveri.com
    if (item.primaryAdminOnly && !isUserPrimaryAdmin) {
      return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="bg-primary-600 p-2 rounded-lg">
                <Settings className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Super Admin</h1>
                <p className="text-xs text-gray-500">System Management</p>
              </div>
            </div>
            {isUserPrimaryAdmin && (
              <div className="flex items-center gap-2 px-3 py-1 bg-amber-100 rounded-lg">
                <ShieldCheck className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-medium text-amber-800">Primary Admin</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Admin Navigation Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 overflow-x-auto" aria-label="Admin navigation">
            {filteredNavItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    isActive
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {/* Page Content */}
      <div className="max-w-7xl mx-auto">
        <Outlet />
      </div>
    </div>
  );
}
