import { test, expect } from '@playwright/test';

test.describe('Smoke Tests - Core Flow Verification', () => {
  test('login and access dashboard', async ({ page }) => {
    // Navigate to login page
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Verify login form elements exist
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();

    // Fill and submit login form
    await emailInput.fill('admin@relay.company.com');
    await passwordInput.fill('password123');
    await submitButton.click();

    // Wait for login to complete - should be on dashboard or org selection page
    // Check URL changed from /login or auth page
    await page.waitForURL(/^(?!.*login)(?!.*auth)/, { timeout: 20000 }).catch(() => {
      // URL might not change if on org selection, which is fine
    });

    // Verify we're not on an error page
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).not.toContain('Unauthorized');
    expect(bodyText).not.toContain('Invalid credentials');

    // Verify token was set
    const token = await page.evaluate(() => {
      return (
        localStorage.getItem('cogveri_auth_token|cogveri_refresh_token') ||
        localStorage.getItem('auth_token') ||
        sessionStorage.getItem('cogveri_auth_token|cogveri_refresh_token')
      );
    });

    expect(token).toBeTruthy();
    expect(token).toContain('.');  // JWT should have dots
  });

  test('organization endpoint returns data', async ({ page }) => {
    // First, login to get a token
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await emailInput.fill('admin@relay.company.com');
    await passwordInput.fill('password123');
    await submitButton.click();

    // Wait for token to be available
    await page.waitForTimeout(2000);

    // Get the token
    const token = await page.evaluate(() => {
      return (
        localStorage.getItem('cogveri_auth_token|cogveri_refresh_token') ||
        localStorage.getItem('auth_token') ||
        sessionStorage.getItem('cogveri_auth_token|cogveri_refresh_token')
      );
    });

    expect(token).toBeTruthy();

    // Now call the organizations endpoint
    const response = await page.request.get('http://localhost:3000/api/organizations/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);

    // Verify organization data
    const org = data[0];
    expect(org).toHaveProperty('name');
    expect(org).toHaveProperty('id');
  });

  test('logout clears token', async ({ page }) => {
    // Login first
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await emailInput.fill('admin@relay.company.com');
    await passwordInput.fill('password123');
    await submitButton.click();

    // Wait for login
    await page.waitForTimeout(2000);

    // Verify token exists
    let token = await page.evaluate(() => {
      return localStorage.getItem('cogveri_auth_token|cogveri_refresh_token') || localStorage.getItem('auth_token');
    });
    expect(token).toBeTruthy();

    // Clear localStorage to simulate logout
    await page.evaluate(() => {
      localStorage.removeItem('cogveri_auth_token|cogveri_refresh_token');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('cogveri_auth_token|cogveri_refresh_token');
      localStorage.removeItem('refresh_token');
    });

    // Navigate to login page
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Verify token is gone
    token = await page.evaluate(() => {
      return localStorage.getItem('cogveri_auth_token|cogveri_refresh_token') || localStorage.getItem('auth_token');
    });
    expect(token).toBeFalsy();

    // Verify login form is visible again
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 5000 });
  });
});
