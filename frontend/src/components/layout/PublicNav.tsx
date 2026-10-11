import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { featureFlags } from '../../config/featureFlags';
import { COMING_SOON_BANNER_HEIGHT } from '../ui/ComingSoonBanner';

interface PublicNavProps {
  /** Current page for highlighting active nav link */
  currentPage?: 'home' | 'features' | 'how-it-works' | 'pricing' | 'enterprise';
  /** Use transparent/dark variant for pages with dark backgrounds (like landing page) */
  variant?: 'light' | 'dark';
  /** Logo size - 'default' (h-10) or 'large' (h-16) */
  logoSize?: 'default' | 'large';
}

/**
 * Shared navigation component for all public pages
 * Automatically handles Coming Soon banner offset
 */
export const PublicNav = ({
  currentPage,
  variant = 'light',
  logoSize = 'default',
}: PublicNavProps) => {
  const isLight = variant === 'light';

  // Style variants
  const navBg = isLight
    ? 'bg-white/95 backdrop-blur-xl border-b border-gray-100 shadow-sm'
    : 'bg-white/95 backdrop-blur-xl border-b border-gray-100 shadow-sm';

  const linkStyle = (isActive: boolean) => {
    if (isActive) {
      return 'text-primary-600 font-medium';
    }
    return 'text-gray-600 hover:text-gray-900 transition';
  };

  const logoHeight = logoSize === 'large' ? 'h-16' : 'h-10';
  const navHeight = logoSize === 'large' ? 'h-20' : 'h-16';

  return (
    <nav
      className={`fixed left-0 right-0 z-50 ${navBg}`}
      style={{ top: featureFlags.COMING_SOON_MODE ? COMING_SOON_BANNER_HEIGHT : 0 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`flex justify-between items-center ${navHeight}`}>
          {/* Logo */}
          <Link to="/" className="flex items-center group">
            <img
              src="/cogveri-logo-horizontal.png"
              alt="CogVeri"
              className={`${logoHeight} w-auto transition-transform group-hover:scale-105`}
            />
          </Link>

          {/* Nav Links */}
          <div className="hidden md:flex items-center space-x-1">
            <a
              href="/#features"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition hover:bg-gray-50 ${linkStyle(currentPage === 'features')}`}
            >
              Features
            </a>
            <a
              href="/#how-it-works"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition hover:bg-gray-50 ${linkStyle(currentPage === 'how-it-works')}`}
            >
              How It Works
            </a>
            <Link
              to="/pricing"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition hover:bg-gray-50 ${linkStyle(currentPage === 'pricing')}`}
            >
              Pricing
            </Link>
          </div>

          {/* Auth Buttons */}
          <div className="flex items-center space-x-3">
            {!featureFlags.COMING_SOON_MODE && (
              <Link
                to="/login"
                className="text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                Sign In
              </Link>
            )}
            {featureFlags.COMING_SOON_MODE ? (
              <span className="bg-gray-400 text-white px-5 py-2.5 rounded-xl text-sm font-semibold cursor-not-allowed flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Coming Soon
              </span>
            ) : (
              <Link
                to="/register"
                className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40"
              >
                Get Started Free
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default PublicNav;
