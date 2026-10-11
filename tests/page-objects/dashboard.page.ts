/**
 * Dashboard Page Object
 *
 * Main dashboard after login showing:
 * - Statistics cards
 * - Recent activity
 * - Quick actions
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';
import { TIMEOUTS, ROUTES } from '../fixtures/test-data';

export class DashboardPage extends BasePage {
  readonly path = ROUTES.dashboard;

  constructor(page: Page) {
    super(page);
  }

  // ============================================================================
  // LOCATORS - Statistics Cards
  // ============================================================================

  get statsContainer(): Locator {
    return this.page
      .locator('[data-testid="dashboard-stats"], [class*="stats" i], [class*="metrics" i]')
      .first();
  }

  get tasksAssignedCard(): Locator {
    return this.page
      .locator(
        '[data-testid="stat-tasks-assigned"], [class*="stat" i]:has-text("Tasks"), [class*="card" i]:has-text("assigned" i)'
      )
      .first();
  }

  get pendingReviewsCard(): Locator {
    return this.page
      .locator(
        '[data-testid="stat-pending-reviews"], [class*="stat" i]:has-text("Review"), [class*="card" i]:has-text("review" i)'
      )
      .first();
  }

  get recordingsCard(): Locator {
    return this.page
      .locator(
        '[data-testid="stat-recordings"], [class*="stat" i]:has-text("Recording"), [class*="card" i]:has-text("recording" i)'
      )
      .first();
  }

  get completedCard(): Locator {
    return this.page
      .locator(
        '[data-testid="stat-completed"], [class*="stat" i]:has-text("Completed"), [class*="card" i]:has-text("completed" i)'
      )
      .first();
  }

  // ============================================================================
  // LOCATORS - Activity Feed
  // ============================================================================

  get activityFeed(): Locator {
    return this.page
      .locator('[data-testid="activity-feed"], [class*="activity" i], [class*="feed" i]')
      .first();
  }

  get activityItems(): Locator {
    return this.activityFeed.locator(
      '[data-testid="activity-item"], [class*="activity-item" i], li, [class*="item" i]'
    );
  }

  // ============================================================================
  // LOCATORS - Quick Actions
  // ============================================================================

  get quickActionsContainer(): Locator {
    return this.page
      .locator('[data-testid="quick-actions"], [class*="quick-action" i], [class*="actions" i]')
      .first();
  }

  get createTaskButton(): Locator {
    return this.page
      .locator(
        '[data-testid="create-task"], button:has-text("Create Task"), button:has-text("New Task"), a:has-text("Create Task")'
      )
      .first();
  }

  get newRecordingButton(): Locator {
    return this.page
      .locator(
        '[data-testid="new-recording"], button:has-text("New Recording"), button:has-text("Start Recording"), a:has-text("Record")'
      )
      .first();
  }

  get viewReviewsButton(): Locator {
    return this.page
      .locator(
        '[data-testid="view-reviews"], button:has-text("View Reviews"), a:has-text("Reviews")'
      )
      .first();
  }

  // ============================================================================
  // LOCATORS - Upcoming Deadlines
  // ============================================================================

  get upcomingDeadlines(): Locator {
    return this.page
      .locator('[data-testid="upcoming-deadlines"], [class*="deadline" i], [class*="upcoming" i]')
      .first();
  }

  get deadlineItems(): Locator {
    return this.upcomingDeadlines.locator('[data-testid="deadline-item"], [class*="item" i], li');
  }

  // ============================================================================
  // LOCATORS - Welcome/Header
  // ============================================================================

  get welcomeMessage(): Locator {
    return this.page
      .locator('[data-testid="welcome"], h1, h2, [class*="welcome" i], [class*="greeting" i]')
      .first();
  }

  get userName(): Locator {
    return this.welcomeMessage.locator('[data-testid="user-name"], strong, span');
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  /**
   * Navigate to dashboard
   */
  async goto(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
    await this.waitForLoadingToComplete();
  }

  /**
   * Wait for dashboard to be fully loaded
   */
  async waitForDashboardLoad(): Promise<void> {
    await this.waitForLoadingToComplete();
    // Wait for at least one stats card to be visible
    await expect(this.statsContainer.or(this.tasksAssignedCard).or(this.activityFeed)).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
  }

  /**
   * Click create task button
   */
  async clickCreateTask(): Promise<void> {
    await this.createTaskButton.click();
  }

  /**
   * Click new recording button
   */
  async clickNewRecording(): Promise<void> {
    await this.newRecordingButton.click();
  }

  /**
   * Click view reviews button
   */
  async clickViewReviews(): Promise<void> {
    await this.viewReviewsButton.click();
  }

  /**
   * Click on a statistics card
   */
  async clickStatCard(card: 'tasks' | 'reviews' | 'recordings' | 'completed'): Promise<void> {
    const cardMap = {
      tasks: this.tasksAssignedCard,
      reviews: this.pendingReviewsCard,
      recordings: this.recordingsCard,
      completed: this.completedCard,
    };
    await cardMap[card].click();
  }

  /**
   * Get stat value from a card
   */
  async getStatValue(card: 'tasks' | 'reviews' | 'recordings' | 'completed'): Promise<string> {
    const cardMap = {
      tasks: this.tasksAssignedCard,
      reviews: this.pendingReviewsCard,
      recordings: this.recordingsCard,
      completed: this.completedCard,
    };
    const cardElement = cardMap[card];
    const value = await cardElement
      .locator('[data-testid="stat-value"], [class*="value" i], [class*="number" i], strong, span')
      .first()
      .textContent();
    return value?.trim() || '0';
  }

  // ============================================================================
  // ASSERTIONS
  // ============================================================================

  /**
   * Assert dashboard is loaded
   */
  async assertDashboardLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(this.path));
    await this.waitForDashboardLoad();
  }

  /**
   * Assert welcome message is visible
   */
  async assertWelcomeMessageVisible(): Promise<void> {
    await expect(this.welcomeMessage).toBeVisible();
  }

  /**
   * Assert statistics are displayed
   */
  async assertStatsDisplayed(): Promise<void> {
    // At least one stat card should be visible
    const hasStats =
      (await this.statsContainer.isVisible()) ||
      (await this.tasksAssignedCard.isVisible()) ||
      (await this.pendingReviewsCard.isVisible());
    expect(hasStats).toBe(true);
  }

  /**
   * Assert activity feed has items
   */
  async assertActivityFeedHasItems(): Promise<void> {
    await expect(this.activityFeed).toBeVisible();
    const itemCount = await this.activityItems.count();
    expect(itemCount).toBeGreaterThan(0);
  }

  /**
   * Assert no errors on dashboard
   */
  async assertNoErrors(): Promise<void> {
    const pageContent = await this.page.content();
    expect(pageContent).not.toContain('Error');
    expect(pageContent).not.toContain('Unauthorized');
    expect(pageContent).not.toContain('No organization');
  }
}
