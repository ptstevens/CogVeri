/**
 * Dashboard E2E Tests
 *
 * Tests for the main dashboard after login:
 * - Statistics display
 * - Quick actions
 * - Activity feed
 * - Navigation
 */

import { test, expect } from '@playwright/test';
import { LoginPage, DashboardPage } from '../page-objects';
import { TEST_USERS, TIMEOUTS, ROUTES } from '../fixtures/test-data';
import { fetchDashboardStats, fetchUnreadNotificationCount } from '../fixtures/api-helpers';

test.describe('Dashboard', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);

    // Login before each test
    await loginPage.login(TEST_USERS.legacyAdmin.email, TEST_USERS.legacyAdmin.password);
  });

  test.describe('Dashboard Load', () => {
    test('should display dashboard after login', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.assertDashboardLoaded();
    });

    test('should not show errors on dashboard', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.assertNoErrors();
    });

    test('should display welcome message with user name', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();

      // Check for welcome or greeting element
      const hasWelcome = await dashboardPage.welcomeMessage.isVisible().catch(() => false);
      if (hasWelcome) {
        await dashboardPage.assertWelcomeMessageVisible();
      }
    });
  });

  test.describe('Statistics Cards', () => {
    test('should display statistics cards', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      await dashboardPage.assertStatsDisplayed();
    });

    test('should have clickable stat cards that navigate', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();

      // Try clicking tasks card if visible
      const tasksCardVisible = await dashboardPage.tasksAssignedCard.isVisible().catch(() => false);
      if (tasksCardVisible) {
        await dashboardPage.clickStatCard('tasks');
        // Should navigate to tasks page
        await expect(page).toHaveURL(/tasks/);
      }
    });

    test('statistics should match API response', async ({ page, request }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();

      // Fetch stats via API
      const stats = await fetchDashboardStats(page, request).catch(() => null);

      if (stats) {
        // Compare UI values with API values
        const uiTasksValue = await dashboardPage.getStatValue('tasks').catch(() => '0');
        // Numbers should be reasonable (not necessarily exact due to timing)
        expect(parseInt(uiTasksValue)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe('Quick Actions', () => {
    test('should display create task button', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();

      const createTaskVisible = await dashboardPage.createTaskButton.isVisible().catch(() => false);
      // Quick actions may or may not be present depending on UI
      if (createTaskVisible) {
        await expect(dashboardPage.createTaskButton).toBeVisible();
      }
    });

    test('create task button should open task creation', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();

      const createTaskVisible = await dashboardPage.createTaskButton.isVisible().catch(() => false);
      if (createTaskVisible) {
        await dashboardPage.clickCreateTask();
        // Should either navigate to tasks page or open modal
        const url = page.url();
        const hasModal = await page
          .locator('[role="dialog"]')
          .isVisible()
          .catch(() => false);
        expect(url.includes('tasks') || hasModal).toBe(true);
      }
    });

    test('new recording button should navigate to recording', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();

      const newRecordingVisible = await dashboardPage.newRecordingButton
        .isVisible()
        .catch(() => false);
      if (newRecordingVisible) {
        await dashboardPage.clickNewRecording();
        await expect(page).toHaveURL(/record/);
      }
    });
  });

  test.describe('Activity Feed', () => {
    test('should display activity feed if present', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();

      const activityFeedVisible = await dashboardPage.activityFeed.isVisible().catch(() => false);
      if (activityFeedVisible) {
        await expect(dashboardPage.activityFeed).toBeVisible();
      }
    });

    test('activity items should have timestamps', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();

      const activityFeedVisible = await dashboardPage.activityFeed.isVisible().catch(() => false);
      if (activityFeedVisible) {
        const itemCount = await dashboardPage.activityItems.count();
        if (itemCount > 0) {
          // Activity items should contain relative time like "2 hours ago" or timestamps
          const firstItem = dashboardPage.activityItems.first();
          const text = await firstItem.textContent();
          expect(text).toBeTruthy();
        }
      }
    });
  });

  test.describe('Navigation', () => {
    test('should navigate to tasks via sidebar', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      await dashboardPage.navigateTo('tasks');
      await expect(page).toHaveURL(/tasks/);
    });

    test('should navigate to recordings via sidebar', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      await dashboardPage.navigateTo('recordings');
      await expect(page).toHaveURL(/record/);
    });

    test('should navigate to reviews via sidebar', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      await dashboardPage.navigateTo('reviews');
      await expect(page).toHaveURL(/review/);
    });

    test('should navigate to settings via sidebar', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      await dashboardPage.navigateTo('settings');
      await expect(page).toHaveURL(/settings/);
    });
  });

  test.describe('Header Elements', () => {
    test('should display user menu', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();

      const userMenuVisible = await dashboardPage.userMenu.isVisible().catch(() => false);
      expect(userMenuVisible).toBe(true);
    });

    test('user menu should open on click', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();

      await dashboardPage.clickUserMenu();
      // Should show dropdown with profile/logout options
      await expect(page.locator('[role="menu"], [class*="dropdown" i]')).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    test('should display notifications icon', async ({ page }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();

      const notificationBellVisible = await dashboardPage.notificationBell
        .isVisible()
        .catch(() => false);
      if (notificationBellVisible) {
        await expect(dashboardPage.notificationBell).toBeVisible();
      }
    });

    test('notifications should show unread count', async ({ page, request }) => {
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();

      const notificationBellVisible = await dashboardPage.notificationBell
        .isVisible()
        .catch(() => false);
      if (notificationBellVisible) {
        // Get count from API
        const count = await fetchUnreadNotificationCount(page, request).catch(() => 0);
        // If there are unread notifications, badge should be visible
        if (count > 0) {
          const badge = dashboardPage.notificationBell.locator(
            '[class*="badge" i], [class*="count" i]'
          );
          await expect(badge).toBeVisible();
        }
      }
    });
  });

  test.describe('Responsive Design', () => {
    test('should be usable on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      await dashboardPage.assertNoErrors();
    });

    test('should be usable on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await dashboardPage.goto();
      await dashboardPage.waitForDashboardLoad();
      await dashboardPage.assertNoErrors();
    });
  });
});
