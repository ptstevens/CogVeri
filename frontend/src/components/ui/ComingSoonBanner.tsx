import { Rocket } from 'lucide-react';

/**
 * Height of the Coming Soon banner in pixels
 * Used by other components to offset their positioning
 */
export const COMING_SOON_BANNER_HEIGHT = 40;

/**
 * Coming Soon Banner - displays a fixed banner at the top of all pages
 * Remove this component when ready to launch publicly
 */
export const ComingSoonBanner = () => {
  return (
    <>
      {/* Fixed banner at the very top */}
      <div className="fixed top-0 left-0 right-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 text-white py-2.5 px-4 text-center text-sm font-medium z-[100] shadow-md">
        <div className="flex items-center justify-center gap-2">
          <Rocket className="h-4 w-4 animate-bounce" />
          <span>
            <strong>Coming Soon!</strong> We're putting the finishing touches on CogVeri. Sign up
            for early access coming shortly.
          </span>
          <Rocket className="h-4 w-4 animate-bounce" style={{ animationDelay: '0.1s' }} />
        </div>
      </div>
      {/* Spacer to push page content below the fixed banner */}
      <div style={{ height: COMING_SOON_BANNER_HEIGHT }} />
    </>
  );
};

export default ComingSoonBanner;
