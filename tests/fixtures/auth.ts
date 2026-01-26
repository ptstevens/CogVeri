import { Page, expect } from '@playwright/test';

/**
 * Login test user and return auth tokens
 * Enhanced with better error handling and debugging
 */
export async function loginAs(page: Page, email: string, password: string) {
  // Navigate to app
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Wait for login form to appear
  await expect(page.locator('input[type="email"], [placeholder*="email" i]')).toBeVisible({
    timeout: 15000,
  });

  // Fill in credentials
  const emailInputs = await page.locator('input[type="email"], [placeholder*="email" i]').all();
  if (emailInputs.length === 0) {
    throw new Error('Could not find email input on login page');
  }
  await emailInputs[0].fill(email);

  const passwordInputs = await page
    .locator('input[type="password"], [placeholder*="password" i]')
    .all();
  if (passwordInputs.length === 0) {
    throw new Error('Could not find password input on login page');
  }
  await passwordInputs[0].fill(password);

  // Submit login form
  const submitButton = page.locator('button[type="submit"]');
  if ((await submitButton.count()) === 0) {
    throw new Error('Could not find submit button on login page');
  }

  // Click submit and wait for response
  await submitButton.first().click();

  // Wait for either:
  // 1. Navigation to dashboard/org selection page
  // 2. Token to appear in localStorage
  // Use a reasonable timeout and catch errors
  try {
    // Try waiting for the page to navigate away from login or for token to be available
    await Promise.race([
      page.waitForNavigation({ url: /\/(dashboard|organizations|auth)/, timeout: 10000 }).catch(
        () => {}
      ),
      page
        .waitForFunction(
          () => {
            const token =
              localStorage.getItem('cogveri_auth_token') || localStorage.getItem('auth_token');
            return !!token;
          },
          { timeout: 10000 }
        )
        .catch(() => {}),
    ]);
  } catch (e) {
    // Ignore navigation/function timeouts, we'll check for token availability below
  }

  // Give extra time for any pending requests
  await page.waitForTimeout(500);

  // Extract tokens from localStorage
  const tokens = await page.evaluate(() => {
    const token = localStorage.getItem('cogveri_auth_token') || localStorage.getItem('auth_token');
    const refreshToken =
      localStorage.getItem('cogveri_auth_token') || localStorage.getItem('refresh_token');
    return { token, refreshToken };
  });

  return tokens;
}

/**
 * Check if user is logged in
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  const token = await page.evaluate(() => {
    return (
      localStorage.getItem('cogveri_auth_token') ||
      localStorage.getItem('auth_token') ||
      sessionStorage.getItem('cogveri_auth_token') ||
      sessionStorage.getItem('auth_token')
    );
  });

  return !!token;
}

/**
 * Logout current user
 */
export async function logout(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('cogveri_auth_token');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('cogveri_auth_token');
    localStorage.removeItem('refresh_token');
    sessionStorage.removeItem('cogveri_auth_token');
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('cogveri_auth_token');
    sessionStorage.removeItem('refresh_token');
  });

  // Navigate to login page
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 });
  } catch {
    // Ignore timeout
  }
}

/**
 * Get current authentication token from storage
 */
export async function getAuthToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    return (
      localStorage.getItem('cogveri_auth_token') ||
      localStorage.getItem('auth_token') ||
      sessionStorage.getItem('cogveri_auth_token') ||
      sessionStorage.getItem('auth_token')
    );
  });
}
