/**
 * Magic Link Page Object
 *
 * External contributor flow via magic link:
 * - Token validation
 * - Task claiming
 * - Recording and submission
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';
import { TIMEOUTS } from '../fixtures/test-data';

export class MagicLinkPage extends BasePage {
  readonly path = '/t/';

  constructor(page: Page) {
    super(page);
  }

  // ============================================================================
  // LOCATORS - Landing State
  // ============================================================================

  get landingContainer(): Locator {
    return this.page.locator('[data-testid="magic-link-landing"], [class*="landing" i], [class*="welcome" i]').first();
  }

  get taskTitle(): Locator {
    return this.page.locator('[data-testid="task-title"], h1, h2, [class*="title" i]').first();
  }

  get taskDescription(): Locator {
    return this.page.locator('[data-testid="task-description"], p, [class*="description" i]').first();
  }

  get organizationName(): Locator {
    return this.page.locator('[data-testid="org-name"], [class*="organization" i], [class*="company" i]').first();
  }

  get getStartedButton(): Locator {
    return this.page.locator('[data-testid="get-started"], button:has-text("Get Started"), button:has-text("Start"), button:has-text("Begin")').first();
  }

  // ============================================================================
  // LOCATORS - Claim State
  // ============================================================================

  get claimForm(): Locator {
    return this.page.locator('[data-testid="claim-form"], form:has(input[name="name"]), [class*="claim" i]').first();
  }

  get nameInput(): Locator {
    return this.page.locator('input[name="name"], [data-testid="name-input"], input[placeholder*="name" i]').first();
  }

  get emailInput(): Locator {
    return this.page.locator('input[name="email"], input[type="email"], [data-testid="email-input"]').first();
  }

  get claimButton(): Locator {
    return this.page.locator('[data-testid="claim-button"], button:has-text("Claim"), button:has-text("Continue"), button[type="submit"]').first();
  }

  // ============================================================================
  // LOCATORS - Task State (After Claiming)
  // ============================================================================

  get taskContainer(): Locator {
    return this.page.locator('[data-testid="task-container"], [class*="task" i][class*="view" i]').first();
  }

  get taskInstructions(): Locator {
    return this.page.locator('[data-testid="instructions"], [class*="instructions" i]').first();
  }

  get taskChecklist(): Locator {
    return this.page.locator('[data-testid="checklist"], [class*="checklist" i]').first();
  }

  get checklistItems(): Locator {
    return this.taskChecklist.locator('[data-testid="checklist-item"], input[type="checkbox"], li');
  }

  get startRecordingButton(): Locator {
    return this.page.locator('[data-testid="start-recording"], button:has-text("Start Recording"), button:has-text("Record")').first();
  }

  // ============================================================================
  // LOCATORS - Recording Setup
  // ============================================================================

  get recordingSetup(): Locator {
    return this.page.locator('[data-testid="recording-setup"], [class*="setup" i], [role="dialog"]').first();
  }

  get audioToggle(): Locator {
    return this.recordingSetup.locator('[data-testid="audio-toggle"], input[name="audio"]').first();
  }

  get webcamToggle(): Locator {
    return this.recordingSetup.locator('[data-testid="webcam-toggle"], input[name="webcam"]').first();
  }

  get screenToggle(): Locator {
    return this.recordingSetup.locator('[data-testid="screen-toggle"], input[name="screen"]').first();
  }

  get beginRecordingButton(): Locator {
    return this.recordingSetup.locator('button:has-text("Start"), button:has-text("Begin")').first();
  }

  // ============================================================================
  // LOCATORS - Recording State
  // ============================================================================

  get recordingIndicator(): Locator {
    return this.page.locator('[data-testid="recording-indicator"], [class*="recording" i][class*="indicator" i]').first();
  }

  get durationDisplay(): Locator {
    return this.page.locator('[data-testid="duration"], [class*="duration" i], [class*="timer" i]').first();
  }

  get pauseButton(): Locator {
    return this.page.locator('[data-testid="pause"], button:has-text("Pause"), button[aria-label*="pause" i]').first();
  }

  get resumeButton(): Locator {
    return this.page.locator('[data-testid="resume"], button:has-text("Resume"), button[aria-label*="resume" i]').first();
  }

  get stopButton(): Locator {
    return this.page.locator('[data-testid="stop"], button:has-text("Stop"), button[aria-label*="stop" i]').first();
  }

  // ============================================================================
  // LOCATORS - Preview State
  // ============================================================================

  get videoPreview(): Locator {
    return this.page.locator('[data-testid="video-preview"], video, [class*="preview" i]').first();
  }

  get redoButton(): Locator {
    return this.page.locator('[data-testid="redo"], button:has-text("Redo"), button:has-text("Re-record")').first();
  }

  get submitButton(): Locator {
    return this.page.locator('[data-testid="submit"], button:has-text("Submit"), button:has-text("Upload")').first();
  }

  // ============================================================================
  // LOCATORS - Completion State
  // ============================================================================

  get completionMessage(): Locator {
    return this.page.locator('[data-testid="completion"], [class*="success" i], [class*="complete" i]').first();
  }

  get thankYouMessage(): Locator {
    return this.page.locator('[data-testid="thank-you"], h1:has-text("Thank"), h2:has-text("Thank"), p:has-text("submitted")').first();
  }

  // ============================================================================
  // LOCATORS - Error State
  // ============================================================================

  get errorContainer(): Locator {
    return this.page.locator('[data-testid="error-container"], [class*="error" i]:not(input), [class*="expired" i]').first();
  }

  get expiredMessage(): Locator {
    return this.page.locator('[data-testid="expired"], [class*="expired" i], p:has-text("expired"), h2:has-text("expired")').first();
  }

  get invalidMessage(): Locator {
    return this.page.locator('[data-testid="invalid"], [class*="invalid" i], p:has-text("invalid"), h2:has-text("invalid")').first();
  }

  // ============================================================================
  // LOCATORS - Countdown
  // ============================================================================

  get countdownOverlay(): Locator {
    return this.page.locator('[data-testid="countdown"], [class*="countdown" i]').first();
  }

  get countdownNumber(): Locator {
    return this.countdownOverlay.locator('[data-testid="countdown-number"], [class*="number" i], span').first();
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  /**
   * Navigate to magic link page with token
   */
  async gotoWithToken(token: string): Promise<void> {
    await this.page.goto(`/t/${token}`, { waitUntil: 'domcontentloaded' });
    await this.waitForLoadingToComplete();
  }

  /**
   * Click get started button
   */
  async clickGetStarted(): Promise<void> {
    await this.getStartedButton.click();
    await expect(this.claimForm.or(this.taskContainer)).toBeVisible({ timeout: TIMEOUTS.medium });
  }

  /**
   * Claim task with name and email
   */
  async claimTask(name: string, email: string): Promise<void> {
    await this.nameInput.fill(name);
    await this.emailInput.fill(email);
    await this.claimButton.click();
    await this.waitForLoadingToComplete();
  }

  /**
   * Complete the full claim flow
   */
  async completeClaimFlow(name: string, email: string): Promise<void> {
    await this.clickGetStarted();
    await this.claimTask(name, email);
    await expect(this.taskContainer.or(this.startRecordingButton)).toBeVisible({ timeout: TIMEOUTS.medium });
  }

  /**
   * Configure and start recording
   */
  async startRecording(options?: {
    audio?: boolean;
    webcam?: boolean;
    screen?: boolean;
  }): Promise<void> {
    await this.startRecordingButton.click();
    await expect(this.recordingSetup).toBeVisible({ timeout: TIMEOUTS.short });

    if (options) {
      if (options.audio !== undefined) {
        if (options.audio) {
          await this.audioToggle.check();
        } else {
          await this.audioToggle.uncheck();
        }
      }
      if (options.webcam !== undefined) {
        if (options.webcam) {
          await this.webcamToggle.check();
        } else {
          await this.webcamToggle.uncheck();
        }
      }
      if (options.screen !== undefined) {
        if (options.screen) {
          await this.screenToggle.check();
        } else {
          await this.screenToggle.uncheck();
        }
      }
    }

    await this.beginRecordingButton.click();

    // Wait for countdown to finish and recording to start
    try {
      await expect(this.countdownOverlay).toBeVisible({ timeout: 2000 });
      await expect(this.countdownOverlay).not.toBeVisible({ timeout: 5000 });
    } catch {
      // Countdown may not always be present
    }

    await expect(this.recordingIndicator.or(this.durationDisplay)).toBeVisible({ timeout: TIMEOUTS.medium });
  }

  /**
   * Pause recording
   */
  async pauseRecording(): Promise<void> {
    await this.pauseButton.click();
    await expect(this.resumeButton).toBeVisible({ timeout: TIMEOUTS.short });
  }

  /**
   * Resume recording
   */
  async resumeRecording(): Promise<void> {
    await this.resumeButton.click();
    await expect(this.pauseButton).toBeVisible({ timeout: TIMEOUTS.short });
  }

  /**
   * Stop recording
   */
  async stopRecording(): Promise<void> {
    await this.stopButton.click();
    await expect(this.videoPreview.or(this.submitButton)).toBeVisible({ timeout: TIMEOUTS.medium });
  }

  /**
   * Submit recording
   */
  async submitRecording(): Promise<void> {
    await this.submitButton.click();
    await this.waitForLoadingToComplete();
  }

  /**
   * Complete checklist items
   */
  async completeChecklist(): Promise<void> {
    const items = await this.checklistItems.all();
    for (const item of items) {
      const isCheckbox = await item.evaluate((el) => el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'checkbox');
      if (isCheckbox) {
        await item.check();
      } else {
        await item.click();
      }
    }
  }

  /**
   * Redo recording
   */
  async redoRecording(): Promise<void> {
    await this.redoButton.click();
    await expect(this.recordingSetup.or(this.startRecordingButton)).toBeVisible({ timeout: TIMEOUTS.medium });
  }

  /**
   * Complete full recording and submission flow
   */
  async completeRecordingFlow(durationSeconds = 5): Promise<void> {
    await this.startRecording({ audio: true, screen: true });

    // Wait for minimum duration
    await this.page.waitForTimeout(durationSeconds * 1000);

    await this.stopRecording();
    await this.completeChecklist().catch(() => {}); // Checklist may not exist
    await this.submitRecording();

    await expect(this.completionMessage.or(this.thankYouMessage)).toBeVisible({ timeout: TIMEOUTS.medium });
  }

  // ============================================================================
  // ASSERTIONS
  // ============================================================================

  /**
   * Assert landing page is visible
   */
  async assertLandingVisible(): Promise<void> {
    await expect(this.landingContainer.or(this.getStartedButton)).toBeVisible();
  }

  /**
   * Assert task info is displayed
   */
  async assertTaskInfoVisible(): Promise<void> {
    await expect(this.taskTitle).toBeVisible();
  }

  /**
   * Assert claim form is visible
   */
  async assertClaimFormVisible(): Promise<void> {
    await expect(this.claimForm).toBeVisible();
    await expect(this.nameInput).toBeVisible();
    await expect(this.emailInput).toBeVisible();
  }

  /**
   * Assert task is claimed (recording UI visible)
   */
  async assertTaskClaimed(): Promise<void> {
    await expect(this.taskContainer.or(this.startRecordingButton)).toBeVisible();
  }

  /**
   * Assert recording is active
   */
  async assertRecordingActive(): Promise<void> {
    await expect(this.recordingIndicator.or(this.durationDisplay)).toBeVisible();
  }

  /**
   * Assert preview state
   */
  async assertPreviewState(): Promise<void> {
    await expect(this.videoPreview).toBeVisible();
    await expect(this.submitButton.or(this.redoButton)).toBeVisible();
  }

  /**
   * Assert completion state
   */
  async assertCompletionState(): Promise<void> {
    await expect(this.completionMessage.or(this.thankYouMessage)).toBeVisible();
  }

  /**
   * Assert token is expired
   */
  async assertTokenExpired(): Promise<void> {
    await expect(this.expiredMessage.or(this.errorContainer)).toBeVisible();
  }

  /**
   * Assert token is invalid
   */
  async assertTokenInvalid(): Promise<void> {
    await expect(this.invalidMessage.or(this.errorContainer)).toBeVisible();
  }
}
