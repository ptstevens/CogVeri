/**
 * Login Page Object
 *
 * Handles all login page interactions including:
 * - Email/password login
 * - Google OAuth login
 * - Form validation
 * - Error handling
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';
import { TIMEOUTS, ROUTES } from '../fixtures/test-data';

export class LoginPage extends BasePage {
  readonly path = ROUTES.login;

  constructor(page: Page) {
    super(page);
  }

  // ============================================================================
  // LOCATORS
  // ============================================================================

  get emailInput(): Locator {
    return this.page.locator('input[type="email"], input[name="email"], [placeholder*="email" i]').first();
  }

  get passwordInput(): Locator {
    return this.page.locator('input[type="password"], input[name="password"], [placeholder*="password" i]').first();
  }

  get loginButton(): Locator {
    return this.page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first();
  }

  get googleLoginButton(): Locator {
    return this.page.locator('button:has-text("Google"), button:has-text("Continue with Google"), [data-testid="google-login"]').first();
  }

  get registerLink(): Locator {
    return this.page.locator('a[href*="register"], a:has-text("Sign up"), a:has-text("Create account")').first();
  }

  get forgotPasswordLink(): Locator {
    return this.page.locator('a[href*="forgot"], a:has-text("Forgot password")').first();
  }

  get loginError(): Locator {
    return this.page.locator('[data-testid="login-error"], [role="alert"], .error-message, [class*="error" i]').first();
  }

  get rememberMeCheckbox(): Locator {
    return this.page.locator('input[type="checkbox"][name="remember"], [data-testid="remember-me"]').first();
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  /**
   * Navigate to login page
   */
  async goto(): Promise<void> {
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    // App should redirect to login if not authenticated
  }

  /**
   * Wait for login form to be ready
   */
  async waitForLoginForm(): Promise<void> {
    await expect(this.emailInput).toBeVisible({ timeout: TIMEOUTS.medium });
    await expect(this.passwordInput).toBeVisible({ timeout: TIMEOUTS.medium });
    await expect(this.loginButton).toBeVisible({ timeout: TIMEOUTS.medium });
  }

  /**
   * Fill in login credentials
   */
  async fillCredentials(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  /**
   * Submit login form
   */
  async submitLogin(): Promise<void> {
    await this.loginButton.click();
  }

  /**
   * Complete login flow
   */
  async login(email: string, password: string): Promise<void> {
    await this.goto();
    await this.waitForLoginForm();
    await this.fillCredentials(email, password);
    await this.submitLogin();

    // Wait for login to complete
    await this.page.waitForFunction(
      () => {
        const token = localStorage.getItem('cogveri_auth_token') ||
                      localStorage.getItem('auth_token') ||
                      sessionStorage.getItem('cogveri_auth_token') ||
                      sessionStorage.getItem('auth_token');
        return !!token;
      },
      { timeout: TIMEOUTS.medium }
    ).catch(() => {});

    // Give extra time for navigation
    await this.page.waitForTimeout(500);
  }

  /**
   * Click Google login button
   */
  async clickGoogleLogin(): Promise<void> {
    await this.googleLoginButton.click();
  }

  /**
   * Click register link
   */
  async clickRegister(): Promise<void> {
    await this.registerLink.click();
  }

  /**
   * Check remember me
   */
  async checkRememberMe(): Promise<void> {
    await this.rememberMeCheckbox.check();
  }

  // ============================================================================
  // ASSERTIONS
  // ============================================================================

  /**
   * Assert login form is visible
   */
  async assertLoginFormVisible(): Promise<void> {
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.loginButton).toBeVisible();
  }

  /**
   * Assert login error is shown
   */
  async assertLoginError(expectedMessage?: string): Promise<void> {
    await expect(this.loginError).toBeVisible({ timeout: TIMEOUTS.short });
    if (expectedMessage) {
      await expect(this.loginError).toContainText(expectedMessage);
    }
  }

  /**
   * Assert user is redirected after login
   */
  async assertLoginSuccess(): Promise<void> {
    // Should not be on login page anymore
    await expect(this.page).not.toHaveURL(/\/login/);
    // Should have auth token
    const hasToken = await this.page.evaluate(() => {
      return !!(
        localStorage.getItem('cogveri_auth_token') ||
        localStorage.getItem('auth_token') ||
        sessionStorage.getItem('cogveri_auth_token') ||
        sessionStorage.getItem('auth_token')
      );
    });
    expect(hasToken).toBe(true);
  }

  /**
   * Assert still on login page (login failed)
   */
  async assertStillOnLoginPage(): Promise<void> {
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  /**
   * Check if email input has validation error
   */
  async hasEmailValidationError(): Promise<boolean> {
    const input = this.emailInput;
    const isInvalid = await input.evaluate((el) => {
      const htmlEl = el as HTMLInputElement;
      return !htmlEl.validity.valid || htmlEl.classList.contains('invalid') || htmlEl.getAttribute('aria-invalid') === 'true';
    });
    return isInvalid;
  }

  /**
   * Check if password input has validation error
   */
  async hasPasswordValidationError(): Promise<boolean> {
    const input = this.passwordInput;
    const isInvalid = await input.evaluate((el) => {
      const htmlEl = el as HTMLInputElement;
      return !htmlEl.validity.valid || htmlEl.classList.contains('invalid') || htmlEl.getAttribute('aria-invalid') === 'true';
    });
    return isInvalid;
  }
}
