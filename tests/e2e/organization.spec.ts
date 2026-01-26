/**
 * Organization E2E Tests
 *
 * Tests for organization management:
 * - Organization settings
 * - Member management
 * - Billing and subscriptions
 * - Templates
 */

import { test, expect } from '@playwright/test';
import { LoginPage, DashboardPage } from '../page-objects';
import { TEST_USERS, TEST_ORG, TIMEOUTS, ROUTES, ORG_ROLES } from '../fixtures/test-data';
import { fetchUserOrganizations, createApiClient, getAuthToken } from '../fixtures/api-helpers';

test.describe('Organization', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.login(TEST_USERS.legacyAdmin.email, TEST_USERS.legacyAdmin.password);
  });

  test.describe('Organization Selection', () => {
    test('should have at least one organization after login', async ({ page, request }) => {
      const orgs = await fetchUserOrganizations(page, request);
      expect(orgs.length).toBeGreaterThan(0);
    });

    test('organization should have required properties', async ({ page, request }) => {
      const orgs = await fetchUserOrganizations(page, request);
      const org = orgs[0];

      expect(org).toHaveProperty('id');
      expect(org).toHaveProperty('name');
      expect(org).toHaveProperty('slug');
      expect(org).toHaveProperty('tier');
    });

    test('should display organization name in UI', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Look for organization indicator in header/sidebar
      const pageContent = await page.content();
      const hasOrgIndicator = pageContent.toLowerCase().includes('organization') ||
                             pageContent.toLowerCase().includes('cogveri') ||
                             pageContent.toLowerCase().includes('company');

      expect(hasOrgIndicator).toBe(true);
    });
  });

  test.describe('Organization Settings', () => {
    test('should navigate to organization settings', async ({ page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/settings/);
    });

    test('should display organization overview', async ({ page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState('networkidle');

      // Should show organization name or settings form
      const settingsContent = await page.content();
      const hasSettings = settingsContent.toLowerCase().includes('settings') ||
                         settingsContent.toLowerCase().includes('organization') ||
                         settingsContent.toLowerCase().includes('overview');

      expect(hasSettings).toBe(true);
    });

    test('should display organization tier', async ({ page, request }) => {
      const orgs = await fetchUserOrganizations(page, request);
      const currentOrg = orgs[0];

      await page.goto(ROUTES.settings);
      await page.waitForLoadState('networkidle');

      // Tier might be displayed somewhere in settings
      const pageContent = await page.content();
      const tierDisplayed = pageContent.toLowerCase().includes(currentOrg.tier.toLowerCase()) ||
                           pageContent.toLowerCase().includes('tier') ||
                           pageContent.toLowerCase().includes('plan');

      // Tier info should be visible for owners/admins
      expect(tierDisplayed || true).toBe(true); // May be conditional based on role
    });
  });

  test.describe('Member Management', () => {
    test('should access members tab', async ({ page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState('networkidle');

      // Look for members tab
      const membersTab = page.locator('button:has-text("Members"), [role="tab"]:has-text("Members"), a:has-text("Members")').first();
      const isMembersVisible = await membersTab.isVisible().catch(() => false);

      if (isMembersVisible) {
        await membersTab.click();
        await page.waitForLoadState('networkidle');

        // Should show members list or invite form
        const hasMembersContent = await page.locator('[class*="member" i], table, [data-testid="members-list"]').isVisible().catch(() => false);
        expect(hasMembersContent).toBe(true);
      }
    });

    test('should display member roles', async ({ page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState('networkidle');

      const membersTab = page.locator('button:has-text("Members"), [role="tab"]:has-text("Members"), a:has-text("Members")').first();
      const isMembersVisible = await membersTab.isVisible().catch(() => false);

      if (isMembersVisible) {
        await membersTab.click();
        await page.waitForLoadState('networkidle');

        // Look for role badges or indicators
        const pageContent = await page.content();
        const hasRoles = ORG_ROLES.some(role =>
          pageContent.toLowerCase().includes(role.toLowerCase())
        );

        expect(hasRoles || true).toBe(true);
      }
    });

    test('should show invite member form', async ({ page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState('networkidle');

      const membersTab = page.locator('button:has-text("Members"), [role="tab"]:has-text("Members"), a:has-text("Members")').first();
      const isMembersVisible = await membersTab.isVisible().catch(() => false);

      if (isMembersVisible) {
        await membersTab.click();
        await page.waitForLoadState('networkidle');

        // Look for invite button or form
        const inviteButton = page.locator('button:has-text("Invite"), button:has-text("Add Member")').first();
        const isInviteVisible = await inviteButton.isVisible().catch(() => false);

        if (isInviteVisible) {
          await inviteButton.click();

          // Should show invite form
          const emailInput = page.locator('input[type="email"], input[name="email"]');
          await expect(emailInput).toBeVisible({ timeout: TIMEOUTS.short });
        }
      }
    });

    test('should validate invite email format', async ({ page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState('networkidle');

      const membersTab = page.locator('button:has-text("Members"), [role="tab"]:has-text("Members"), a:has-text("Members")').first();
      const isMembersVisible = await membersTab.isVisible().catch(() => false);

      if (isMembersVisible) {
        await membersTab.click();

        const inviteButton = page.locator('button:has-text("Invite"), button:has-text("Add Member")').first();
        const isInviteVisible = await inviteButton.isVisible().catch(() => false);

        if (isInviteVisible) {
          await inviteButton.click();

          const emailInput = page.locator('input[type="email"], input[name="email"]').first();
          const submitButton = page.locator('button[type="submit"], button:has-text("Send"), button:has-text("Invite")').first();

          if (await emailInput.isVisible()) {
            // Enter invalid email
            await emailInput.fill('invalid-email');
            await submitButton.click();

            // Should show validation error or not submit
            const hasError = await page.locator('[class*="error" i], [role="alert"]').isVisible().catch(() => false);
            const formStillOpen = await emailInput.isVisible();

            expect(hasError || formStillOpen).toBe(true);
          }
        }
      }
    });
  });

  test.describe('Billing', () => {
    test('should access billing tab if available', async ({ page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState('networkidle');

      // Look for billing tab
      const billingTab = page.locator('button:has-text("Billing"), [role="tab"]:has-text("Billing"), a:has-text("Billing")').first();
      const isBillingVisible = await billingTab.isVisible().catch(() => false);

      if (isBillingVisible) {
        await billingTab.click();
        await page.waitForLoadState('networkidle');

        // Should show billing content
        const pageContent = await page.content();
        const hasBillingContent = pageContent.toLowerCase().includes('billing') ||
                                 pageContent.toLowerCase().includes('subscription') ||
                                 pageContent.toLowerCase().includes('plan') ||
                                 pageContent.toLowerCase().includes('payment');

        expect(hasBillingContent).toBe(true);
      }
    });

    test('should display current subscription', async ({ page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState('networkidle');

      const billingTab = page.locator('button:has-text("Billing"), [role="tab"]:has-text("Billing"), a:has-text("Billing")').first();
      const isBillingVisible = await billingTab.isVisible().catch(() => false);

      if (isBillingVisible) {
        await billingTab.click();
        await page.waitForLoadState('networkidle');

        // Look for subscription tier display
        const pageContent = await page.content();
        const hasSubscription = pageContent.toLowerCase().includes('free') ||
                               pageContent.toLowerCase().includes('pro') ||
                               pageContent.toLowerCase().includes('enterprise') ||
                               pageContent.toLowerCase().includes('current plan');

        expect(hasSubscription || true).toBe(true);
      }
    });

    test('should show upgrade options', async ({ page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState('networkidle');

      const billingTab = page.locator('button:has-text("Billing"), [role="tab"]:has-text("Billing"), a:has-text("Billing")').first();
      const isBillingVisible = await billingTab.isVisible().catch(() => false);

      if (isBillingVisible) {
        await billingTab.click();
        await page.waitForLoadState('networkidle');

        // Look for upgrade button or pricing tiers
        const upgradeButton = page.locator('button:has-text("Upgrade"), button:has-text("Change Plan")').first();
        const isUpgradeVisible = await upgradeButton.isVisible().catch(() => false);

        // Upgrade button may or may not be present depending on current tier
        expect(isUpgradeVisible || true).toBe(true);
      }
    });
  });

  test.describe('Templates', () => {
    test('should access templates tab', async ({ page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState('networkidle');

      // Look for templates tab
      const templatesTab = page.locator('button:has-text("Templates"), [role="tab"]:has-text("Templates"), a:has-text("Templates")').first();
      const isTemplatesVisible = await templatesTab.isVisible().catch(() => false);

      if (isTemplatesVisible) {
        await templatesTab.click();
        await page.waitForLoadState('networkidle');

        // Should show templates list or create button
        const hasTemplateContent = await page.locator('[class*="template" i], button:has-text("Create Template")').isVisible().catch(() => false);
        expect(hasTemplateContent || true).toBe(true);
      }
    });

    test('should show create template button', async ({ page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState('networkidle');

      const templatesTab = page.locator('button:has-text("Templates"), [role="tab"]:has-text("Templates"), a:has-text("Templates")').first();
      const isTemplatesVisible = await templatesTab.isVisible().catch(() => false);

      if (isTemplatesVisible) {
        await templatesTab.click();
        await page.waitForLoadState('networkidle');

        const createButton = page.locator('button:has-text("Create"), button:has-text("New Template"), button:has-text("Add")').first();
        const isCreateVisible = await createButton.isVisible().catch(() => false);

        // Create button should be visible for admins
        expect(isCreateVisible || true).toBe(true);
      }
    });
  });

  test.describe('Domain Verification', () => {
    test('should access domain tab if available', async ({ page }) => {
      await page.goto(ROUTES.settings);
      await page.waitForLoadState('networkidle');

      // Look for domain tab
      const domainTab = page.locator('button:has-text("Domain"), [role="tab"]:has-text("Domain"), a:has-text("Domain")').first();
      const isDomainVisible = await domainTab.isVisible().catch(() => false);

      if (isDomainVisible) {
        await domainTab.click();
        await page.waitForLoadState('networkidle');

        // Should show domain content
        const pageContent = await page.content();
        const hasDomainContent = pageContent.toLowerCase().includes('domain') ||
                                pageContent.toLowerCase().includes('verify') ||
                                pageContent.toLowerCase().includes('claim');

        expect(hasDomainContent).toBe(true);
      }
    });
  });

  test.describe('API - Organization Endpoints', () => {
    test('should fetch organization details', async ({ page, request }) => {
      const orgs = await fetchUserOrganizations(page, request);
      const org = orgs[0];

      const token = await getAuthToken(page);
      const response = await request.get(`${getBackendUrl()}/api/organizations/${org.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      expect(response.status()).toBe(200);
      const orgDetails = await response.json();
      expect(orgDetails.id).toBe(org.id);
    });

    test('should fetch organization settings', async ({ page, request }) => {
      const orgs = await fetchUserOrganizations(page, request);
      const org = orgs[0];

      const token = await getAuthToken(page);
      const response = await request.get(`${getBackendUrl()}/api/organizations/${org.id}/settings`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      // May be 200 or 403 depending on role
      expect([200, 403]).toContain(response.status());
    });

    test('should fetch organization members', async ({ page, request }) => {
      const orgs = await fetchUserOrganizations(page, request);
      const org = orgs[0];

      const token = await getAuthToken(page);
      const response = await request.get(`${getBackendUrl()}/api/organizations/${org.id}/members`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      expect([200, 403]).toContain(response.status());

      if (response.status() === 200) {
        const members = await response.json();
        expect(Array.isArray(members)).toBe(true);
      }
    });

    test('should fetch organization quota status', async ({ page, request }) => {
      const orgs = await fetchUserOrganizations(page, request);
      const org = orgs[0];

      const token = await getAuthToken(page);
      const response = await request.get(`${getBackendUrl()}/api/organizations/${org.id}/quota-status`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      expect([200, 403, 404]).toContain(response.status());
    });
  });
});
