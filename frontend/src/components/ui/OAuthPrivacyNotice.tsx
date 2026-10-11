/**
 * OAuthPrivacyNotice Component
 *
 * In-product privacy notification required by Google OAuth verification.
 * This component informs users about:
 * - What data is accessed from their Google account
 * - How that data is used
 * - Links to the Privacy Policy
 *
 * Per Google's requirements, this must be "prominently displayed"
 * before users initiate the OAuth flow.
 */

import { Link } from 'react-router-dom';
import { Shield, ExternalLink } from 'lucide-react';

interface OAuthPrivacyNoticeProps {
  /** Compact version for smaller spaces */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const OAuthPrivacyNotice = ({ compact = false, className = '' }: OAuthPrivacyNoticeProps) => {
  if (compact) {
    return (
      <p className={`text-xs text-gray-500 text-center ${className}`}>
        By continuing, you agree to our{' '}
        <Link to="/privacy" className="text-primary-600 hover:underline">
          Privacy Policy
        </Link>{' '}
        and{' '}
        <Link to="/terms" className="text-primary-600 hover:underline">
          Terms of Service
        </Link>
        . We only access your email and profile info for authentication.
      </p>
    );
  }

  return (
    <div className={`bg-blue-50 border border-blue-100 rounded-lg p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <Shield className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-blue-900 mb-1">Your privacy matters</h4>
          <p className="text-xs text-blue-700 leading-relaxed">
            When you sign in with Google, we only access your <strong>email address</strong>,{' '}
            <strong>name</strong>, and <strong>profile picture</strong> for authentication. We never
            access your contacts, calendar, or other Google data.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <Link
              to="/privacy"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
            >
              Privacy Policy
              <ExternalLink className="w-3 h-3" />
            </Link>
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
            >
              Google's Data Policy
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OAuthPrivacyNotice;
