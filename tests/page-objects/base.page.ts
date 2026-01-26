/**
 * Base Page Object
 *
 * Common functionality shared across all page objects.
 * Provides navigation, waiting, and common UI interaction patterns.
 */

import { Page, Locator, expect } from '@playwright/test';
import { TIMEOUTS } from '../fixtures/test-data';

export abstract class BasePage {
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  abstract readonly path: string;

  async goto(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
  }

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout: TIMEOUTS.medium });
  }

  async waitForNavigation(urlPattern?: string | RegExp): Promise<void> {
    if (urlPattern) {
      await this.page.waitForURL(urlPattern, { timeout: TIMEOUTS.medium });
    } else {
      await this.page.waitForNavigation({ timeout: TIMEOUTS.medium });
    }
  }

  getCurrentUrl(): string {
    return this.page.url();
  }

  async getPageTitle(): Promise<string> {
    return this.page.title();
  }

  // ============================================================================
  // COMMON UI ELEMENTS
  // ============================================================================

  // Header elements
  get header(): Locator {
    return this.page.locator('header, [role="banner"]').first();
  }

  get userMenu(): Locator {
    return this.page.locator('[data-testid="user-menu"], [aria-label*="user" i], button:has(img[alt*="avatar" i])').first();
  }

  get notificationBell(): Locator {
    return this.page.locator('[data-testid="notifications"], [aria-label*="notification" i], button:has(svg[class*="bell" i])').first();
  }

  get orgSwitcher(): Locator {
    return this.page.locator('[data-testid="org-switcher"], [aria-label*="organization" i]').first();
  }

  // Sidebar/Navigation
  get sidebar(): Locator {
    return this.page.locator('nav, aside, [role="navigation"]').first();
  }

  get dashboardLink(): Locator {
    return this.page.locator('a[href*="dashboard"], [data-testid="nav-dashboard"]').first();
  }

  get tasksLink(): Locator {
    return this.page.locator('a[href*="tasks"]:not([href*="task/"]), [data-testid="nav-tasks"]').first();
  }

  get recordingsLink(): Locator {
    return this.page.locator('a[href*="record"], [data-testid="nav-recordings"]').first();
  }

  get reviewsLink(): Locator {
    return this.page.locator('a[href*="review"], [data-testid="nav-reviews"]').first();
  }

  get settingsLink(): Locator {
    return this.page.locator('a[href*="settings"], [data-testid="nav-settings"]').first();
  }

  // ============================================================================
  // COMMON INTERACTIONS
  // ============================================================================

  async clickUserMenu(): Promise<void> {
    await this.userMenu.click();
  }

  async clickNotifications(): Promise<void> {
    await this.notificationBell.click();
  }

  async navigateTo(link: 'dashboard' | 'tasks' | 'recordings' | 'reviews' | 'settings'): Promise<void> {
    const linkMap = {
      dashboard: this.dashboardLink,
      tasks: this.tasksLink,
      recordings: this.recordingsLink,
      reviews: this.reviewsLink,
      settings: this.settingsLink,
    };
    await linkMap[link].click();
    await this.waitForPageLoad();
  }

  // ============================================================================
  // TOAST / NOTIFICATIONS
  // ============================================================================

  get toastContainer(): Locator {
    return this.page.locator('[data-testid="toast"], [role="alert"], .Toastify, [class*="toast" i]');
  }

  get successToast(): Locator {
    return this.page.locator('[data-testid="toast-success"], [class*="success" i][role="alert"], .Toastify__toast--success');
  }

  get errorToast(): Locator {
    return this.page.locator('[data-testid="toast-error"], [class*="error" i][role="alert"], .Toastify__toast--error');
  }

  async waitForSuccessToast(timeout = TIMEOUTS.short): Promise<void> {
    await expect(this.successToast).toBeVisible({ timeout });
  }

  async waitForErrorToast(timeout = TIMEOUTS.short): Promise<void> {
    await expect(this.errorToast).toBeVisible({ timeout });
  }

  async getToastMessage(): Promise<string> {
    const toast = this.toastContainer.first();
    await expect(toast).toBeVisible({ timeout: TIMEOUTS.short });
    return toast.textContent() || '';
  }

  // ============================================================================
  // MODALS / DIALOGS
  // ============================================================================

  get modal(): Locator {
    return this.page.locator('[role="dialog"], [data-testid="modal"], .modal, [class*="modal" i]:visible');
  }

  get modalTitle(): Locator {
    return this.modal.locator('[data-testid="modal-title"], h2, h3, [class*="title" i]').first();
  }

  get modalCloseButton(): Locator {
    return this.modal.locator('[data-testid="modal-close"], button[aria-label*="close" i], button:has(svg[class*="x" i])').first();
  }

  get modalConfirmButton(): Locator {
    return this.modal.locator('[data-testid="modal-confirm"], button:has-text("Confirm"), button:has-text("Save"), button:has-text("Submit")').first();
  }

  get modalCancelButton(): Locator {
    return this.modal.locator('[data-testid="modal-cancel"], button:has-text("Cancel"), button:has-text("Close")').first();
  }

  async isModalOpen(): Promise<boolean> {
    return this.modal.isVisible();
  }

  async closeModal(): Promise<void> {
    if (await this.isModalOpen()) {
      await this.modalCloseButton.click();
      await expect(this.modal).not.toBeVisible({ timeout: TIMEOUTS.short });
    }
  }

  async confirmModal(): Promise<void> {
    await this.modalConfirmButton.click();
  }

  async cancelModal(): Promise<void> {
    await this.modalCancelButton.click();
  }

  // ============================================================================
  // LOADING STATES
  // ============================================================================

  get loadingSpinner(): Locator {
    return this.page.locator('[data-testid="loading"], [class*="spinner" i], [class*="loading" i], [role="progressbar"]');
  }

  get skeletonLoader(): Locator {
    return this.page.locator('[data-testid="skeleton"], [class*="skeleton" i], [class*="shimmer" i]');
  }

  async waitForLoadingToComplete(timeout = TIMEOUTS.medium): Promise<void> {
    // Wait for spinners to disappear
    await expect(this.loadingSpinner).not.toBeVisible({ timeout }).catch(() => {});
    // Wait for skeletons to disappear
    await expect(this.skeletonLoader).not.toBeVisible({ timeout }).catch(() => {});
  }

  // ============================================================================
  // FORMS
  // ============================================================================

  getInput(name: string): Locator {
    return this.page.locator(`input[name="${name}"], input[id="${name}"], [data-testid="input-${name}"]`).first();
  }

  getTextarea(name: string): Locator {
    return this.page.locator(`textarea[name="${name}"], textarea[id="${name}"], [data-testid="textarea-${name}"]`).first();
  }

  getSelect(name: string): Locator {
    return this.page.locator(`select[name="${name}"], select[id="${name}"], [data-testid="select-${name}"]`).first();
  }

  getCheckbox(name: string): Locator {
    return this.page.locator(`input[type="checkbox"][name="${name}"], input[type="checkbox"][id="${name}"]`).first();
  }

  getRadio(name: string, value?: string): Locator {
    if (value) {
      return this.page.locator(`input[type="radio"][name="${name}"][value="${value}"]`).first();
    }
    return this.page.locator(`input[type="radio"][name="${name}"]`);
  }

  getSubmitButton(): Locator {
    return this.page.locator('button[type="submit"]').first();
  }

  async fillInput(name: string, value: string): Promise<void> {
    await this.getInput(name).fill(value);
  }

  async fillTextarea(name: string, value: string): Promise<void> {
    await this.getTextarea(name).fill(value);
  }

  async selectOption(name: string, value: string): Promise<void> {
    await this.getSelect(name).selectOption(value);
  }

  async checkCheckbox(name: string): Promise<void> {
    await this.getCheckbox(name).check();
  }

  async uncheckCheckbox(name: string): Promise<void> {
    await this.getCheckbox(name).uncheck();
  }

  // ============================================================================
  // ERROR STATES
  // ============================================================================

  get errorMessage(): Locator {
    return this.page.locator('[data-testid="error"], [role="alert"][class*="error" i], .error-message, [class*="error" i]').first();
  }

  get formError(): Locator {
    return this.page.locator('[data-testid="form-error"], [class*="error" i], .field-error, [class*="invalid" i]');
  }

  async hasError(): Promise<boolean> {
    return this.errorMessage.isVisible();
  }

  async getErrorText(): Promise<string> {
    return this.errorMessage.textContent() || '';
  }

  // ============================================================================
  // EMPTY STATES
  // ============================================================================

  get emptyState(): Locator {
    return this.page.locator('[data-testid="empty-state"], [class*="empty" i], [class*="no-data" i]');
  }

  async hasEmptyState(): Promise<boolean> {
    return this.emptyState.isVisible();
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  async takeScreenshot(name: string): Promise<Buffer> {
    return this.page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  }

  async waitForTimeout(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  async pressKey(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  async clickOutside(): Promise<void> {
    await this.page.mouse.click(0, 0);
  }
}
