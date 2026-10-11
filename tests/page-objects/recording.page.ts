/**
 * Recording Page Object
 *
 * Recording session handling including:
 * - Recording setup (audio, webcam, screen)
 * - Recording controls (start, pause, stop)
 * - Preview and submission
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';
import { TIMEOUTS, ROUTES } from '../fixtures/test-data';

export class RecordingPage extends BasePage {
  readonly path = ROUTES.recordings;

  constructor(page: Page) {
    super(page);
  }

  // ============================================================================
  // LOCATORS - Recordings List
  // ============================================================================

  get recordingsList(): Locator {
    return this.page
      .locator('[data-testid="recordings-list"], [class*="recording-list" i]')
      .first();
  }

  get recordingCards(): Locator {
    return this.page.locator(
      '[data-testid="recording-card"], [class*="recording-item" i], [class*="recording-card" i]'
    );
  }

  get newRecordingButton(): Locator {
    return this.page
      .locator(
        '[data-testid="new-recording"], button:has-text("New Recording"), button:has-text("Start Recording"), a[href*="record/new"]'
      )
      .first();
  }

  getRecordingCard(titleOrId: string): Locator {
    return this.page
      .locator(
        `[data-testid="recording-card"]:has-text("${titleOrId}"), [class*="recording" i]:has-text("${titleOrId}")`
      )
      .first();
  }

  // ============================================================================
  // LOCATORS - Setup Modal
  // ============================================================================

  get setupModal(): Locator {
    return this.page
      .locator(
        '[data-testid="recording-setup"], [role="dialog"]:has-text("Recording"), [class*="setup" i]'
      )
      .first();
  }

  // Audio settings
  get audioToggle(): Locator {
    return this.setupModal
      .locator(
        '[data-testid="audio-toggle"], input[name="audio"], [class*="audio" i] input[type="checkbox"]'
      )
      .first();
  }

  get audioDeviceSelect(): Locator {
    return this.setupModal
      .locator('[data-testid="audio-device"], select[name="audioDevice"]')
      .first();
  }

  // Webcam settings
  get webcamToggle(): Locator {
    return this.setupModal
      .locator(
        '[data-testid="webcam-toggle"], input[name="webcam"], [class*="webcam" i] input[type="checkbox"]'
      )
      .first();
  }

  get webcamPositionSelect(): Locator {
    return this.setupModal
      .locator('[data-testid="webcam-position"], select[name="webcamPosition"]')
      .first();
  }

  get webcamSizeSelect(): Locator {
    return this.setupModal
      .locator('[data-testid="webcam-size"], select[name="webcamSize"]')
      .first();
  }

  get webcamPreview(): Locator {
    return this.setupModal
      .locator('[data-testid="webcam-preview"], video, [class*="preview" i]')
      .first();
  }

  // Screen settings
  get screenToggle(): Locator {
    return this.setupModal
      .locator(
        '[data-testid="screen-toggle"], input[name="screen"], [class*="screen" i] input[type="checkbox"]'
      )
      .first();
  }

  get startRecordingButton(): Locator {
    return this.setupModal
      .locator(
        'button:has-text("Start Recording"), button:has-text("Begin"), [data-testid="start-recording"]'
      )
      .first();
  }

  get cancelSetupButton(): Locator {
    return this.setupModal
      .locator('button:has-text("Cancel"), [data-testid="cancel-setup"]')
      .first();
  }

  // ============================================================================
  // LOCATORS - Recording Session
  // ============================================================================

  get recordingIndicator(): Locator {
    return this.page
      .locator(
        '[data-testid="recording-indicator"], [class*="recording" i][class*="indicator" i], [class*="rec" i]'
      )
      .first();
  }

  get durationDisplay(): Locator {
    return this.page
      .locator(
        '[data-testid="duration"], [class*="duration" i], [class*="timer" i], [class*="time" i]'
      )
      .first();
  }

  get uploadProgress(): Locator {
    return this.page
      .locator(
        '[data-testid="upload-progress"], [class*="upload" i][class*="progress" i], [class*="safely" i]'
      )
      .first();
  }

  get pauseButton(): Locator {
    return this.page
      .locator(
        '[data-testid="pause-recording"], button:has-text("Pause"), button[aria-label*="pause" i]'
      )
      .first();
  }

  get resumeButton(): Locator {
    return this.page
      .locator(
        '[data-testid="resume-recording"], button:has-text("Resume"), button[aria-label*="resume" i]'
      )
      .first();
  }

  get stopButton(): Locator {
    return this.page
      .locator(
        '[data-testid="stop-recording"], button:has-text("Stop"), button[aria-label*="stop" i]'
      )
      .first();
  }

  // ============================================================================
  // LOCATORS - Preview State
  // ============================================================================

  get videoPlayer(): Locator {
    return this.page.locator('[data-testid="video-player"], video, [class*="player" i]').first();
  }

  get redoButton(): Locator {
    return this.page
      .locator(
        '[data-testid="redo-recording"], button:has-text("Redo"), button:has-text("Re-record")'
      )
      .first();
  }

  get submitButton(): Locator {
    return this.page
      .locator(
        '[data-testid="submit-recording"], button:has-text("Submit"), button:has-text("Upload")'
      )
      .first();
  }

  // ============================================================================
  // LOCATORS - Checklist
  // ============================================================================

  get checklist(): Locator {
    return this.page.locator('[data-testid="checklist"], [class*="checklist" i]').first();
  }

  get checklistItems(): Locator {
    return this.checklist.locator(
      '[data-testid="checklist-item"], input[type="checkbox"], [class*="item" i]'
    );
  }

  getChecklistItem(index: number): Locator {
    return this.checklistItems.nth(index);
  }

  // ============================================================================
  // LOCATORS - Error/Status Messages
  // ============================================================================

  get errorMessage(): Locator {
    return this.page
      .locator('[data-testid="recording-error"], [class*="error" i], [role="alert"]')
      .first();
  }

  get successMessage(): Locator {
    return this.page.locator('[data-testid="recording-success"], [class*="success" i]').first();
  }

  get processingStatus(): Locator {
    return this.page.locator('[data-testid="processing-status"], [class*="processing" i]').first();
  }

  // ============================================================================
  // LOCATORS - Floating Controls (PiP)
  // ============================================================================

  get floatingControls(): Locator {
    return this.page
      .locator('[data-testid="floating-controls"], [class*="floating" i], [class*="pip" i]')
      .first();
  }

  get floatingPauseButton(): Locator {
    return this.floatingControls
      .locator('button:has-text("Pause"), button[aria-label*="pause" i]')
      .first();
  }

  get floatingStopButton(): Locator {
    return this.floatingControls
      .locator('button:has-text("Stop"), button[aria-label*="stop" i]')
      .first();
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  /**
   * Navigate to recordings list
   */
  async gotoRecordingsList(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
    await this.waitForLoadingToComplete();
  }

  /**
   * Click new recording button
   */
  async clickNewRecording(): Promise<void> {
    await this.newRecordingButton.click();
  }

  /**
   * Configure recording settings
   */
  async configureRecording(options: {
    audio?: boolean;
    webcam?: boolean;
    webcamPosition?: string;
    webcamSize?: string;
    screen?: boolean;
  }): Promise<void> {
    await expect(this.setupModal).toBeVisible({ timeout: TIMEOUTS.medium });

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
        if (options.webcamPosition) {
          await this.webcamPositionSelect.selectOption(options.webcamPosition);
        }
        if (options.webcamSize) {
          await this.webcamSizeSelect.selectOption(options.webcamSize);
        }
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

  /**
   * Start recording
   */
  async startRecording(): Promise<void> {
    await this.startRecordingButton.click();
    // Wait for recording to start
    await expect(this.recordingIndicator.or(this.durationDisplay)).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
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
    // Wait for preview state
    await expect(this.videoPlayer.or(this.submitButton)).toBeVisible({ timeout: TIMEOUTS.medium });
  }

  /**
   * Redo recording
   */
  async redoRecording(): Promise<void> {
    await this.redoButton.click();
    await expect(this.setupModal.or(this.startRecordingButton)).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
  }

  /**
   * Submit recording
   */
  async submitRecording(): Promise<void> {
    await this.submitButton.click();
    // Wait for submission to complete
    await this.waitForLoadingToComplete();
  }

  /**
   * Complete all checklist items
   */
  async completeChecklist(): Promise<void> {
    const items = await this.checklistItems.all();
    for (const item of items) {
      if (await item.isVisible()) {
        await item.check();
      }
    }
  }

  /**
   * Get current recording duration
   */
  async getDuration(): Promise<string> {
    const text = await this.durationDisplay.textContent();
    return text?.trim() || '00:00';
  }

  /**
   * Wait for recording duration to reach a certain time (in seconds)
   */
  async waitForDuration(seconds: number): Promise<void> {
    await this.page.waitForFunction(
      (targetSeconds) => {
        const durationEl = document.querySelector(
          '[data-testid="duration"], [class*="duration" i], [class*="timer" i]'
        );
        if (!durationEl) return false;
        const text = durationEl.textContent || '00:00';
        const parts = text.split(':');
        const currentSeconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        return currentSeconds >= targetSeconds;
      },
      seconds,
      { timeout: (seconds + 10) * 1000 }
    );
  }

  // ============================================================================
  // ASSERTIONS
  // ============================================================================

  /**
   * Assert setup modal is visible
   */
  async assertSetupModalVisible(): Promise<void> {
    await expect(this.setupModal).toBeVisible();
  }

  /**
   * Assert recording is active
   */
  async assertRecordingActive(): Promise<void> {
    await expect(this.recordingIndicator.or(this.pauseButton)).toBeVisible();
  }

  /**
   * Assert recording is paused
   */
  async assertRecordingPaused(): Promise<void> {
    await expect(this.resumeButton).toBeVisible();
  }

  /**
   * Assert in preview state
   */
  async assertPreviewState(): Promise<void> {
    await expect(this.videoPlayer).toBeVisible();
    await expect(this.submitButton.or(this.redoButton)).toBeVisible();
  }

  /**
   * Assert submission success
   */
  async assertSubmissionSuccess(): Promise<void> {
    await expect(this.successMessage.or(this.successToast)).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
  }

  /**
   * Assert error state
   */
  async assertErrorState(): Promise<void> {
    await expect(this.errorMessage.or(this.errorToast)).toBeVisible();
  }

  /**
   * Assert recording exists in list
   */
  async assertRecordingInList(titleOrId: string): Promise<void> {
    await this.gotoRecordingsList();
    await expect(this.getRecordingCard(titleOrId)).toBeVisible({ timeout: TIMEOUTS.medium });
  }
}
