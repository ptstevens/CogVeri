/**
 * Feature Flags Configuration
 *
 * These flags control feature availability across the application.
 * Set VITE_OPEN_FOR_BUSINESS=true in env vars when ready to launch publicly.
 */

// Check if site is open for business (env var, defaults to false = coming soon mode)
const isOpenForBusiness = import.meta.env.VITE_OPEN_FOR_BUSINESS === 'true';

export const featureFlags = {
  /**
   * Coming Soon Mode
   * When true:
   * - Shows "Coming Soon" banner on all pages
   * - Disables /register route (redirects to home)
   * - Changes "Get Started" buttons to "Coming Soon"
   *
   * Controlled by VITE_OPEN_FOR_BUSINESS env var:
   * - VITE_OPEN_FOR_BUSINESS=true  → Site is live (COMING_SOON_MODE=false)
   * - VITE_OPEN_FOR_BUSINESS=false → Coming soon mode (COMING_SOON_MODE=true)
   */
  COMING_SOON_MODE: !isOpenForBusiness,

  /**
   * Enable Google OAuth login
   */
  GOOGLE_AUTH_ENABLED: true,

  /**
   * Enable waitlist signup (future feature)
   */
  WAITLIST_ENABLED: false,
} as const;

export default featureFlags;
