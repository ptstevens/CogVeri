/**
 * Centralized Storage Service
 *
 * Provides a unified interface for localStorage operations.
 * All localStorage keys and access should go through this service
 * to ensure consistency and make future changes easier.
 */

// Storage keys - centralized to avoid typos and enable easy changes
// Note: REFRESH_TOKEN removed - refresh tokens are now stored in HttpOnly cookies
const STORAGE_KEYS = {
  AUTH_TOKEN: import.meta.env.VITE_AUTH_TOKEN_KEY || 'cogveri_auth_token',
  CURRENT_ORG_ID: 'cogveri_current_org_id',
  USER_PREFERENCES: 'cogveri_user_preferences',
  THEME: 'cogveri_theme',
} as const;

type StorageKey = keyof typeof STORAGE_KEYS;

class StorageService {
  constructor() {
    // Migration: Clear any old refresh tokens from localStorage
    // Refresh tokens are now stored in HttpOnly cookies for XSS protection
    this.migrateFromLocalStorageTokens();
  }

  /**
   * Migration: Clear legacy localStorage tokens
   * Called once on initialization to clean up old token storage
   */
  private migrateFromLocalStorageTokens(): void {
    try {
      // Clear legacy refresh token if it exists
      const legacyRefreshKey =
        import.meta.env.VITE_AUTH_REFRESH_TOKEN_KEY || 'cogveri_refresh_token';
      if (localStorage.getItem(legacyRefreshKey)) {
        localStorage.removeItem(legacyRefreshKey);
        console.info('StorageService: Migrated - cleared legacy refresh token from localStorage');
      }
      // Note: We keep AUTH_TOKEN key for now as it may be used during migration
      // The tokenService will be the new source of truth for access tokens
    } catch (error) {
      console.warn('StorageService: Migration cleanup failed:', error);
    }
  }

  /**
   * Get a value from localStorage
   */
  get<T = string>(key: StorageKey): T | null {
    try {
      const value = localStorage.getItem(STORAGE_KEYS[key]);
      if (!value) return null;

      // Try to parse as JSON, fallback to raw string
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch (error) {
      console.error(`StorageService: Error reading ${key}:`, error);
      return null;
    }
  }

  /**
   * Set a value in localStorage
   */
  set<T>(key: StorageKey, value: T): void {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(STORAGE_KEYS[key], serialized);
    } catch (error) {
      console.error(`StorageService: Error writing ${key}:`, error);
    }
  }

  /**
   * Remove a value from localStorage
   */
  remove(key: StorageKey): void {
    try {
      localStorage.removeItem(STORAGE_KEYS[key]);
    } catch (error) {
      console.error(`StorageService: Error removing ${key}:`, error);
    }
  }

  // Auth-specific methods for convenience
  /**
   * @deprecated Access tokens should be retrieved from tokenService (memory storage)
   * This method is kept temporarily for backward compatibility during migration
   */
  getAuthToken(): string | null {
    return this.get<string>('AUTH_TOKEN');
  }

  /**
   * @deprecated Access tokens should be stored via tokenService (memory storage)
   * This method is kept temporarily for backward compatibility during migration
   */
  setAuthToken(token: string): void {
    this.set('AUTH_TOKEN', token);
  }

  /**
   * @deprecated Refresh tokens are now stored in HttpOnly cookies
   * This method always returns null - refresh is handled by the server
   */
  getRefreshToken(): string | null {
    // Refresh tokens are now in HttpOnly cookies, not localStorage
    return null;
  }

  /**
   * @deprecated Refresh tokens are now stored in HttpOnly cookies
   * This method is a no-op - refresh is handled by the server
   */
  setRefreshToken(_token: string): void {
    // No-op: Refresh tokens are now in HttpOnly cookies
    console.warn(
      'StorageService: setRefreshToken is deprecated. Refresh tokens are now in HttpOnly cookies.'
    );
  }

  getCurrentOrgId(): string | null {
    return this.get<string>('CURRENT_ORG_ID');
  }

  setCurrentOrgId(orgId: string): void {
    this.set('CURRENT_ORG_ID', orgId);
  }

  /**
   * Clear all auth-related storage
   * Note: This clears localStorage items only.
   * The HttpOnly refresh token cookie is cleared by the server on logout.
   * Memory-based access token should be cleared via tokenService.
   */
  clearAuth(): void {
    this.remove('AUTH_TOKEN');
    this.remove('CURRENT_ORG_ID');
  }

  /**
   * Clear all storage managed by this service
   */
  clearAll(): void {
    Object.keys(STORAGE_KEYS).forEach((key) => {
      this.remove(key as StorageKey);
    });
  }

  /**
   * Check if user is potentially authenticated (has token)
   * @deprecated Use tokenService.hasAccessToken() instead for the authoritative check
   */
  hasAuthToken(): boolean {
    return this.getAuthToken() !== null;
  }
}

// Export singleton instance
export const storageService = new StorageService();

// Export keys for testing or special cases
export { STORAGE_KEYS };
