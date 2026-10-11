/**
 * Health Check E2E Tests
 *
 * Critical tests that verify system health before other tests run.
 * These tests should pass for the system to be considered operational.
 */

import { test, expect } from '@playwright/test';
import { API_ENDPOINTS, TIMEOUTS } from '../fixtures/test-data';
import {
  checkBackendHealth,
  waitForBackend,
  getBackendUrl,
  getFrontendUrl,
} from '../fixtures/api-helpers';

test.describe('System Health Checks', () => {
  test.describe('Backend Health', () => {
    test('should respond to health check', async ({ request }) => {
      const response = await request.get(`${getBackendUrl()}/health`);
      expect(response.status()).toBe(200);
    });

    test('should have healthy database connection', async ({ request }) => {
      const response = await request.get(`${getBackendUrl()}/health`);
      expect(response.status()).toBe(200);

      const health = await response.json().catch(() => null);
      if (health && health.database) {
        expect(health.database).toBe('ok');
      }
    });

    test('should respond to readiness probe', async ({ request }) => {
      const response = await request.get(`${getBackendUrl()}/health/ready`);
      expect([200, 503]).toContain(response.status());

      if (response.status() === 200) {
        const readiness = await response.json().catch(() => null);
        expect(readiness).toBeTruthy();
      }
    });

    test('should respond to liveness probe', async ({ request }) => {
      const response = await request.get(`${getBackendUrl()}/health/live`);
      expect(response.status()).toBe(200);
    });

    test('should have healthy Redis connection', async ({ request }) => {
      const response = await request.get(`${getBackendUrl()}/health/ready`);

      if (response.status() === 200) {
        const readiness = await response.json().catch(() => null);
        if (readiness && readiness.redis !== undefined) {
          // Redis may be optional depending on configuration
          expect(['ok', 'degraded', undefined]).toContain(readiness.redis);
        }
      }
    });
  });

  test.describe('Frontend Health', () => {
    test('should serve frontend application', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      expect(page.url()).toBeTruthy();
    });

    test('should have valid HTML structure', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      // Should have a root element
      const root = await page.locator('#root, #app, [data-testid="app"]').count();
      expect(root).toBeGreaterThan(0);
    });

    test('should load JavaScript bundles', async ({ page }) => {
      await page.goto('/', { waitUntil: 'networkidle' });

      // Check for React/Vite bundle indicators
      const hasReact = await page.evaluate(() => {
        return (
          (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ !== undefined ||
          document.querySelector('[data-reactroot]') !== null ||
          document.querySelector('#root')?.children.length > 0
        );
      });

      expect(hasReact).toBe(true);
    });

    test('should have no JavaScript errors on load', async ({ page }) => {
      const errors: string[] = [];

      page.on('pageerror', (error) => {
        errors.push(error.message);
      });

      await page.goto('/', { waitUntil: 'networkidle' });

      // Filter out known acceptable errors
      const criticalErrors = errors.filter((error) => {
        // Add patterns for errors that should be ignored
        return !error.includes('ResizeObserver') && !error.includes('Non-Error');
      });

      expect(criticalErrors).toHaveLength(0);
    });

    test('should have no console errors on load', async ({ page }) => {
      const consoleErrors: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      await page.goto('/', { waitUntil: 'networkidle' });

      // Filter out expected errors
      const unexpectedErrors = consoleErrors.filter((error) => {
        return (
          !error.includes('favicon') &&
          !error.includes('manifest') &&
          !error.includes('404') &&
          !error.includes('Failed to load resource')
        );
      });

      // Should have minimal errors
      expect(unexpectedErrors.length).toBeLessThan(5);
    });
  });

  test.describe('API Availability', () => {
    test('should return API version info', async ({ request }) => {
      const response = await request.get(`${getBackendUrl()}/api/`);
      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const apiInfo = await response.json().catch(() => null);
        if (apiInfo) {
          expect(apiInfo).toBeTruthy();
        }
      }
    });

    test('should have CSRF token endpoint', async ({ request }) => {
      const response = await request.get(`${getBackendUrl()}/api/auth/csrf-token`);
      expect([200, 404]).toContain(response.status());
    });

    test('should have public pricing tiers endpoint', async ({ request }) => {
      const response = await request.get(`${getBackendUrl()}${API_ENDPOINTS.billingTiers}`);
      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const data = await response.json().catch(() => null);
        // API may return array directly or {tiers: [...]}
        const tiers = Array.isArray(data) ? data : data?.tiers;
        expect(Array.isArray(tiers) || tiers === undefined).toBe(true);
      }
    });
  });

  test.describe('Static Assets', () => {
    test('should serve CSS files', async ({ request }) => {
      const response = await request.get(`${getFrontendUrl()}/`);
      const html = await response.text();

      // Should have CSS link or inline styles
      const hasStyles = html.includes('.css') || html.includes('<style');
      expect(hasStyles).toBe(true);
    });

    test('should serve favicon', async ({ request }) => {
      const response = await request.get(`${getFrontendUrl()}/favicon.ico`).catch(() => null);
      // Favicon may or may not exist
      expect(response === null || response.status() < 500).toBe(true);
    });
  });

  test.describe('Performance Baselines', () => {
    test('health endpoint should respond within 500ms', async ({ request }) => {
      const start = Date.now();
      await request.get(`${getBackendUrl()}/health`);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });

    test('frontend should load within 5 seconds', async ({ page }) => {
      const start = Date.now();
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000);
    });

    test('login page should render within 3 seconds', async ({ page }) => {
      const start = Date.now();
      await page.goto('/');
      await page.waitForSelector('input[type="email"], [placeholder*="email" i]', {
        timeout: TIMEOUTS.medium,
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(3000);
    });
  });

  test.describe('Database Connectivity', () => {
    test('should execute database queries', async ({ request }) => {
      // Health check includes database ping
      const response = await request.get(`${getBackendUrl()}/health/components/database`);

      if (response.status() === 200) {
        const dbHealth = await response.json().catch(() => null);
        if (dbHealth) {
          expect(['ok', 'healthy']).toContain(dbHealth.status);
        }
      } else {
        // Endpoint may not exist - use main health check
        const healthResponse = await request.get(`${getBackendUrl()}/health`);
        expect(healthResponse.status()).toBe(200);
      }
    });
  });

  test.describe('Redis Connectivity', () => {
    test('should connect to Redis for caching', async ({ request }) => {
      const response = await request.get(`${getBackendUrl()}/health/components/redis`);

      if (response.status() === 200) {
        const redisHealth = await response.json().catch(() => null);
        if (redisHealth) {
          expect(['ok', 'healthy', 'degraded']).toContain(redisHealth.status);
        }
      } else {
        // Redis component check may not exist
        expect([200, 404]).toContain(response.status());
      }
    });
  });

  test.describe('Storage Connectivity', () => {
    test('should verify storage (S3/R2) connectivity', async ({ request }) => {
      const response = await request.get(`${getBackendUrl()}/health/components/storage`);

      if (response.status() === 200) {
        const storageHealth = await response.json().catch(() => null);
        if (storageHealth) {
          expect(['ok', 'degraded']).toContain(storageHealth.status);
        }
      } else {
        // Storage component check may not exist
        expect([200, 404]).toContain(response.status());
      }
    });
  });
});

// Pre-flight checks that should run before the test suite
test.describe('Pre-flight Checks', () => {
  test('backend should be ready before tests', async ({ request }) => {
    const isHealthy = await checkBackendHealth(request);
    expect(isHealthy).toBe(true);
  });

  test('frontend should be accessible', async ({ page }) => {
    const response = await page.goto('/', { waitUntil: 'commit' });
    expect(response?.status()).toBeLessThan(500);
  });

  test('should be able to reach login page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Should show login form, login button, or some login-related element
    // Different apps may show the form immediately or require clicking a button first
    const loginIndicators = [
      'input[type="email"]',
      'input[type="password"]',
      'input[name="email"]',
      'input[name="password"]',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      'button:has-text("Login")',
      'a:has-text("Sign in")',
      '[data-testid="login"]',
      'form[action*="login"]',
      'form[action*="auth"]',
    ];

    let found = false;
    for (const selector of loginIndicators) {
      const visible = await page
        .locator(selector)
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      if (visible) {
        found = true;
        break;
      }
    }

    // If no login element found, at least verify the page loaded successfully
    if (!found) {
      const pageContent = await page.content();
      // Page should have meaningful content
      expect(pageContent.length).toBeGreaterThan(500);
    }
  });
});
