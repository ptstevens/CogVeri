/**
 * Screenshot capture tests for marketing and documentation
 * Run with: npx playwright test tests/e2e/screenshots.spec.ts --project=chromium
 */

import { test, expect } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = path.join(__dirname, '../../frontend/public/screenshots');

// Common viewport for consistency - wider for better marketing shots
const VIEWPORT = { width: 1440, height: 900 };

// Production URL for authenticated screenshots
const PROD_URL = 'https://www.cogveri.com';

// Test credentials
const TEST_EMAIL = 'admin@cogveri.com';
const TEST_PASSWORD = 'Lh7g3b21!051097';

/**
 * Helper to login on production
 */
async function loginProd(page: any) {
  await page.goto(`${PROD_URL}/login`);
  await page.waitForLoadState('networkidle');

  await page.fill('input[name="email"]', TEST_EMAIL);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard or organization selection
  await page.waitForURL(/\/(dashboard|organizations)/, { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // Allow dashboard to fully render
}

test.describe('Marketing Screenshots (Local)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
  });

  test('capture landing page hero', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'landing-hero.png'),
      fullPage: false,
    });
  });

  test('capture landing page features', async ({ page }) => {
    await page.goto('/');
    await page.locator('#features').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'landing-features.png'),
      fullPage: false,
    });
  });

  test('capture pricing page', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'pricing.png'),
      fullPage: false,
    });
  });

  test('capture login page', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'login-page.png'),
      fullPage: false,
    });
  });

  test('capture register page', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'register-page.png'),
      fullPage: false,
    });
  });
});

test.describe('Mobile Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
  });

  test('capture mobile landing', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'landing-mobile.png'),
      fullPage: false,
    });
  });

  test('capture mobile login', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'login-mobile.png'),
      fullPage: false,
    });
  });
});

test.describe('Dashboard Screenshots (Production)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
  });

  test('capture dashboard overview', async ({ page }) => {
    try {
      await loginProd(page);

      // Navigate to dashboard explicitly
      await page.goto(`${PROD_URL}/dashboard`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'dashboard.png'),
        fullPage: false,
      });
    } catch (error) {
      console.log('Dashboard screenshot failed:', error);
      test.skip();
    }
  });

  test('capture tasks list', async ({ page }) => {
    try {
      await loginProd(page);

      await page.goto(`${PROD_URL}/tasks`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'tasks-list.png'),
        fullPage: false,
      });
    } catch (error) {
      console.log('Tasks screenshot failed:', error);
      test.skip();
    }
  });

  test('capture reviews queue', async ({ page }) => {
    try {
      await loginProd(page);

      await page.goto(`${PROD_URL}/reviews`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'reviews-queue.png'),
        fullPage: false,
      });
    } catch (error) {
      console.log('Reviews screenshot failed:', error);
      test.skip();
    }
  });

  test('capture recordings library', async ({ page }) => {
    try {
      await loginProd(page);

      await page.goto(`${PROD_URL}/record`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'recordings.png'),
        fullPage: false,
      });
    } catch (error) {
      console.log('Recordings screenshot failed:', error);
      test.skip();
    }
  });

  test('capture organization settings', async ({ page }) => {
    try {
      await loginProd(page);

      await page.goto(`${PROD_URL}/organizations/settings`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'settings.png'),
        fullPage: false,
      });
    } catch (error) {
      console.log('Settings screenshot failed:', error);
      test.skip();
    }
  });

  test('capture billing page', async ({ page }) => {
    try {
      await loginProd(page);

      await page.goto(`${PROD_URL}/organizations/billing`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'billing-current.png'),
        fullPage: true,
      });
    } catch (error) {
      console.log('Billing screenshot failed:', error);
      test.skip();
    }
  });
});
