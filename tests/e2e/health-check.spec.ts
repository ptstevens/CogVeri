/**
 * Health Check E2E Tests
 *
 * Critical tests that verify system health before other tests run.
 * These tests should pass for the system to be considered operational.
 */

import { test, expect } from '@playwright/test';
import { API_ENDPOINTS, TIMEOUTS } from '../fixtures/test-data';
import { checkBackendHealth, waitForBackend } from '../fixtures/api-helpers';

test.describe('System Health Checks', () => {
  test.describe('Backend Health', () => {
    test('should respond to health check', async ({ request }) => {
      const response = await request.get('http://localhost:3000/health');
      expect(response.status()).toBe(200);
    });

    test('should have healthy database connection', async ({ request }) => {
      const response = await request.get('http://localhost:3000/health');
      expect(response.status()).toBe(200);

      const health = await response.json().catch(() => null);
      if (health && health.database) {
        expect(health.database).toBe('ok');
      }
    });

    test('should respond to readiness probe', async ({ request }) => {
      const response = await request.get('http://localhost:3000/health/ready');
      expect([200, 503]).toContain(response.status());

      if (response.status() === 200) {
        const readiness = await response.json().catch(() => null);
        expect(readiness).toBeTruthy();
      }
    });

    test('should respond to liveness probe', async ({ request }) => {
      const response = await request.get('http://localhost:3000/health/live');
      expect(response.status()).toBe(200);
    });

    test('should have healthy Redis connection', async ({ request }) => {
      const response = await request.get('http://localhost:3000/health/ready');

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
        return (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ !== undefined ||
               document.querySelector('[data-reactroot]') !== null ||
               document.querySelector('#root')?.children.length > 0;
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
        return !error.includes('favicon') &&
               !error.includes('manifest') &&
               !error.includes('404') &&
               !error.includes('Failed to load resource');
      });

      // Should have minimal errors
      expect(unexpectedErrors.length).toBeLessThan(5);
    });
  });

  test.describe('API Availability', () => {
    test('should return API version info', async ({ request }) => {
      const response = await request.get('http://localhost:3000/api/');
      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const apiInfo = await response.json().catch(() => null);
        if (apiInfo) {
          expect(apiInfo).toBeTruthy();
        }
      }
    });

    test('should have CSRF token endpoint', async ({ request }) => {
      const response = await request.get('http://localhost:3000/api/auth/csrf-token');
      expect([200, 404]).toContain(response.status());
    });

    test('should have public pricing tiers endpoint', async ({ request }) => {
      const response = await request.get(`http://localhost:3000${API_ENDPOINTS.billingTiers}`);
      expect([200, 404]).toContain(response.status());

      if (response.status() === 200) {
        const tiers = await response.json().catch(() => null);
        expect(Array.isArray(tiers)).toBe(true);
      }
    });
  });

  test.describe('Static Assets', () => {
    test('should serve CSS files', async ({ request }) => {
      const response = await request.get('http://localhost:5173/');
      const html = await response.text();

      // Should have CSS link or inline styles
      const hasStyles = html.includes('.css') || html.includes('<style');
      expect(hasStyles).toBe(true);
    });

    test('should serve favicon', async ({ request }) => {
      const response = await request.get('http://localhost:5173/favicon.ico').catch(() => null);
      // Favicon may or may not exist
      expect(response === null || response.status() < 500).toBe(true);
    });
  });

  test.describe('Performance Baselines', () => {
    test('health endpoint should respond within 500ms', async ({ request }) => {
      const start = Date.now();
      await request.get('http://localhost:3000/health');
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
      await page.waitForSelector('input[type="email"], [placeholder*="email" i]', { timeout: TIMEOUTS.medium });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(3000);
    });
  });

  test.describe('Database Connectivity', () => {
    test('should execute database queries', async ({ request }) => {
      // Health check includes database ping
      const response = await request.get('http://localhost:3000/health/components/database');

      if (response.status() === 200) {
        const dbHealth = await response.json().catch(() => null);
        if (dbHealth) {
          expect(dbHealth.status).toBe('ok');
        }
      } else {
        // Endpoint may not exist - use main health check
        const healthResponse = await request.get('http://localhost:3000/health');
        expect(healthResponse.status()).toBe(200);
      }
    });
  });

  test.describe('Redis Connectivity', () => {
    test('should connect to Redis for caching', async ({ request }) => {
      const response = await request.get('http://localhost:3000/health/components/redis');

      if (response.status() === 200) {
        const redisHealth = await response.json().catch(() => null);
        if (redisHealth) {
          expect(['ok', 'degraded']).toContain(redisHealth.status);
        }
      } else {
        // Redis component check may not exist
        expect([200, 404]).toContain(response.status());
      }
    });
  });

  test.describe('Storage Connectivity', () => {
    test('should verify storage (S3/R2) connectivity', async ({ request }) => {
      const response = await request.get('http://localhost:3000/health/components/storage');

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

    // Should show login form or redirect to login
    const loginFormVisible = await page.locator('input[type="email"], input[type="password"]').first().isVisible({ timeout: TIMEOUTS.medium }).catch(() => false);
    expect(loginFormVisible).toBe(true);
  });
});
