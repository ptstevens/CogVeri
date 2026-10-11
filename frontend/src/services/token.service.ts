/**
 * Token Service for Secure In-Memory Token Storage
 *
 * Security benefits:
 * - Access tokens are stored in memory only, not localStorage
 * - This protects against XSS attacks (JavaScript cannot access memory of other tabs)
 * - Refresh tokens are handled via HttpOnly cookies (server-side)
 *
 * Trade-offs:
 * - Token is lost on page refresh (requires re-authentication via refresh token cookie)
 * - Token is not shared across tabs (each tab gets its own token on load)
 *
 * The BroadcastChannel is used for cross-tab logout synchronization.
 */

// In-memory storage for the access token
let accessToken: string | null = null;

// BroadcastChannel for cross-tab communication (logout sync)
let logoutChannel: BroadcastChannel | null = null;

// Subscribers to token changes (for re-rendering on auth state change)
type TokenChangeCallback = (token: string | null) => void;
const tokenChangeSubscribers: Set<TokenChangeCallback> = new Set();

/**
 * Initialize the BroadcastChannel for cross-tab logout
 * Call this once when the app starts
 */
export function initializeTokenService(onLogoutCallback?: () => void): void {
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      logoutChannel = new BroadcastChannel('cogveri_auth');
      logoutChannel.onmessage = (event) => {
        if (event.data?.type === 'LOGOUT') {
          // Another tab logged out, clear our token too
          accessToken = null;
          notifySubscribers(null);
          onLogoutCallback?.();
        } else if (event.data?.type === 'LOGIN' && event.data?.token) {
          // Another tab logged in, sync the token
          accessToken = event.data.token;
          notifySubscribers(accessToken);
        }
      };
    } catch (e) {
      // BroadcastChannel not supported in this environment
      console.warn('BroadcastChannel not available for cross-tab sync');
    }
  }
}

/**
 * Clean up the BroadcastChannel
 * Call this when the app unmounts
 */
export function destroyTokenService(): void {
  if (logoutChannel) {
    logoutChannel.close();
    logoutChannel = null;
  }
  tokenChangeSubscribers.clear();
}

/**
 * Notify all subscribers of a token change
 */
function notifySubscribers(token: string | null): void {
  tokenChangeSubscribers.forEach((callback) => {
    try {
      callback(token);
    } catch (e) {
      console.error('Error in token change subscriber:', e);
    }
  });
}

/**
 * Broadcast a message to other tabs
 */
function broadcast(type: 'LOGIN' | 'LOGOUT', token?: string): void {
  if (logoutChannel) {
    try {
      logoutChannel.postMessage({ type, token });
    } catch (e) {
      // Channel might be closed
    }
  }
}

/**
 * Token service singleton with methods for token management
 */
export const tokenService = {
  /**
   * Get the current access token from memory
   */
  getAccessToken(): string | null {
    return accessToken;
  },

  /**
   * Set the access token in memory
   * This should be called after login or token refresh
   */
  setAccessToken(token: string | null): void {
    accessToken = token;
    notifySubscribers(token);
    if (token) {
      broadcast('LOGIN', token);
    }
  },

  /**
   * Clear the access token from memory
   * This should be called on logout
   */
  clearAccessToken(): void {
    accessToken = null;
    notifySubscribers(null);
    broadcast('LOGOUT');
  },

  /**
   * Check if there's an access token in memory
   */
  hasAccessToken(): boolean {
    return accessToken !== null;
  },

  /**
   * Subscribe to token changes
   * Returns an unsubscribe function
   */
  onTokenChange(callback: TokenChangeCallback): () => void {
    tokenChangeSubscribers.add(callback);
    return () => {
      tokenChangeSubscribers.delete(callback);
    };
  },
};
