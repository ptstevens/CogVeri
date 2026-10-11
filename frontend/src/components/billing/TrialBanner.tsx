import { useState, useEffect } from 'react';
import { X, Sparkles, Clock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSubscription, getTrialDaysRemaining } from '../../hooks/useBilling';

export interface TrialBannerProps {
  variant?: 'full' | 'compact';
  className?: string;
  /** If provided, call this instead of navigating to billing page */
  onUpgradeClick?: () => void;
}

const DISMISS_KEY = 'trial_banner_dismissed';
const DISMISS_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const TrialBanner = ({ variant = 'full', className = '', onUpgradeClick }: TrialBannerProps) => {
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

  // Don't show if loading, dismissed, or not on trial
  if (isLoading || isDismissed) return null;

  const daysRemaining = getTrialDaysRemaining(subscription);

  // Only show for trialing subscriptions
  if (daysRemaining === null || subscription?.status !== 'trialing') {
    return null;
  }

  // Determine color based on days remaining
  const getColorScheme = () => {
    if (daysRemaining <= 3) {
      return {
        bg: 'bg-gradient-to-r from-error to-rose-500',
        text: 'text-white',
        button: 'bg-white text-error hover:bg-error-50',
        icon: 'text-rose-200',
      };
    }
    if (daysRemaining <= 7) {
      return {
        bg: 'bg-gradient-to-r from-warning to-amber-500',
        text: 'text-white',
        button: 'bg-white text-warning-700 hover:bg-warning-50',
        icon: 'text-amber-200',
      };
    }
    return {
      bg: 'bg-gradient-to-r from-success to-emerald-500',
      text: 'text-white',
      button: 'bg-white text-success-700 hover:bg-success-50',
      icon: 'text-emerald-200',
    };
  };

  const colors = getColorScheme();

  if (variant === 'compact') {
    return (
      <div className={`${colors.bg} px-3 py-2 rounded-lg ${className}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className={`w-4 h-4 ${colors.icon}`} />
            <span className={`text-xs font-medium ${colors.text}`}>
              {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} left in trial
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
              <Sparkles className={`w-5 h-5 ${colors.text}`} />
            </div>
            <div className="flex items-center gap-2">
              <span className={`font-semibold ${colors.text}`}>
                {daysRemaining === 0
                  ? 'Your trial ends today!'
                  : daysRemaining === 1
                    ? 'Your trial ends tomorrow!'
                    : `${daysRemaining} days remaining in your trial`}
              </span>
              <span className={`hidden sm:inline ${colors.text} opacity-80`}>
                {daysRemaining <= 3
                  ? 'Upgrade now to keep your features'
                  : 'Upgrade to unlock all features forever'}
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

export default TrialBanner;
