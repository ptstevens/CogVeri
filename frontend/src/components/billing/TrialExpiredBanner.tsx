import { useState, useEffect } from 'react';
import { X, AlertTriangle, ArrowRight, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSubscription } from '../../hooks/useBilling';

export interface TrialExpiredBannerProps {
  variant?: 'full' | 'compact';
  className?: string;
  /** If provided, call this instead of navigating to billing page */
  onUpgradeClick?: () => void;
}

const DISMISS_KEY = 'trial_expired_banner_dismissed';
const DISMISS_DURATION = 4 * 60 * 60 * 1000; // 4 hours (shorter than trial banner since this is important)

/**
 * Banner shown when a trial has expired and the org is in read-only mode
 *
 * This component detects expired trials by checking:
 * - Status is still 'trialing' but trial_end has passed
 * - Or status is 'expired'
 */
const TrialExpiredBanner = ({ variant = 'full', className = '', onUpgradeClick }: TrialExpiredBannerProps) => {
  const { data: subscription, isLoading } = useSubscription();
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const dismissTime = parseInt(dismissedAt, 10);
      const now = Date.now();
      if (now - dismissTime < DISMISS_DURATION) {
        setIsDismissed(true);
      } else {
        localStorage.removeItem(DISMISS_KEY);
      }
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setIsDismissed(true);
  };

  // Don't show if loading or dismissed
  if (isLoading || isDismissed) return null;

  // Check if trial is expired
  const isTrialExpired = (() => {
    if (!subscription) return false;

    // Free tier is never in expired trial state
    if (subscription.tier === 'free') return false;

    // Active subscription is never in expired state
    if (subscription.status === 'active') return false;

    // Trial status but past the end date
    if (subscription.status === 'trialing' && subscription.trialEnd) {
      const trialEnd = new Date(subscription.trialEnd);
      return new Date() > trialEnd;
    }

    return false;
  })();

  // Only show if trial is expired
  if (!isTrialExpired) return null;

  const colors = {
    bg: 'bg-gradient-to-r from-error to-rose-600',
    text: 'text-white',
    button: 'bg-white text-error hover:bg-error-50',
    icon: 'text-rose-200',
  };

  if (variant === 'compact') {
    return (
      <div className={`${colors.bg} px-3 py-2 rounded-lg ${className}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lock className={`w-4 h-4 ${colors.icon}`} />
            <span className={`text-xs font-medium ${colors.text}`}>
              Trial expired - Read-only mode
            </span>
          </div>
          {onUpgradeClick ? (
            <button
              onClick={onUpgradeClick}
              className={`text-xs font-semibold ${colors.text} hover:underline`}
            >
              Upgrade
            </button>
          ) : (
            <Link
              to="/organizations/settings?tab=billing"
              className={`text-xs font-semibold ${colors.text} hover:underline`}
            >
              Upgrade
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${colors.bg} ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg bg-white/20`}>
              <AlertTriangle className={`w-5 h-5 ${colors.text}`} />
            </div>
            <div className="flex items-center gap-2">
              <span className={`font-semibold ${colors.text}`}>
                Your trial has expired
              </span>
              <span className={`hidden sm:inline ${colors.text} opacity-80`}>
                You're in read-only mode. Upgrade to create new tasks, recordings, and invites.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {onUpgradeClick ? (
              <button
                onClick={onUpgradeClick}
                className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${colors.button}`}
              >
                Upgrade Now
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
            ) : (
              <Link
                to="/organizations/settings?tab=billing"
                className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${colors.button}`}
              >
                Upgrade Now
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            )}
            <button
              onClick={handleDismiss}
              className={`p-1.5 rounded-lg hover:bg-white/20 transition-colors ${colors.text}`}
              aria-label="Dismiss banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrialExpiredBanner;
