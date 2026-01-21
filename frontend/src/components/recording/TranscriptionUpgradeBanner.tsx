import { useState, useEffect } from 'react';
import { X, Sparkles, ArrowRight, Mic } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface TranscriptionUpgradeBannerProps {
  className?: string;
}

const DISMISS_KEY = 'transcription_upgrade_dismissed';
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

const TranscriptionUpgradeBanner = ({ className = '' }: TranscriptionUpgradeBannerProps) => {
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const dismissTime = parseInt(dismissedAt, 10);
      const now = Date.now();
      if (now - dismissTime < DISMISS_DURATION) {
        setIsDismissed(true);
      } else {
        // Clear expired dismissal
        localStorage.removeItem(DISMISS_KEY);
      }
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setIsDismissed(true);
  };

  if (isDismissed) {
    return null;
  }

  return (
    <div className={`bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-lg p-6 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
            <Mic className="w-6 h-6 text-white" />
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                Unlock AI Transcription
              </h3>
              <p className="text-sm text-gray-600 mt-1 max-w-md">
                Automatically convert your recordings to searchable, timestamped text.
                Click any segment to jump to that moment in the video.
              </p>
            </div>

            <ul className="text-sm text-gray-600 space-y-1">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                Automatic transcription on upload
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                Search within your recordings
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                Click-to-seek timestamps
              </li>
            </ul>

            <Link
              to="/organizations/settings?tab=billing"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg"
            >
              Upgrade to Pro
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Dismiss banner"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default TranscriptionUpgradeBanner;
