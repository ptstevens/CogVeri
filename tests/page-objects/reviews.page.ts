/**
 * Reviews Page Object
 *
 * Review management including:
 * - Review list
 * - Task review page with video player
 * - Feedback submission
 * - Analysis results viewing
 */

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';
import { TIMEOUTS, ROUTES } from '../fixtures/test-data';

export class ReviewsPage extends BasePage {
  readonly path = ROUTES.reviews;

  constructor(page: Page) {
    super(page);
  }

  // ============================================================================
  // LOCATORS - Reviews List
  // ============================================================================

  get pageTitle(): Locator {
    return this.page.locator('h1:has-text("Review"), [data-testid="page-title"]').first();
  }

  get reviewsList(): Locator {
    return this.page.locator('[data-testid="reviews-list"], [class*="review-list" i]').first();
  }

  get reviewCards(): Locator {
    return this.page.locator(
      '[data-testid="review-card"], [class*="review-item" i], [class*="task-card" i]'
    );
  }

  get statusFilter(): Locator {
    return this.page.locator('[data-testid="status-filter"], select[name="status"]').first();
  }

  get priorityFilter(): Locator {
    return this.page.locator('[data-testid="priority-filter"], select[name="priority"]').first();
  }

  get showArchivedToggle(): Locator {
    return this.page
      .locator(
        '[data-testid="show-archived"], input[name="showArchived"], label:has-text("archived" i)'
      )
      .first();
  }

  get refreshButton(): Locator {
    return this.page
      .locator(
        '[data-testid="refresh"], button:has-text("Refresh"), button[aria-label*="refresh" i]'
      )
      .first();
  }

  getReviewCard(titleOrId: string): Locator {
    return this.page
      .locator(
        `[data-testid="review-card"]:has-text("${titleOrId}"), [class*="review" i]:has-text("${titleOrId}")`
      )
      .first();
  }

  // ============================================================================
  // LOCATORS - Statistics
  // ============================================================================

  get statsContainer(): Locator {
    return this.page.locator('[data-testid="review-stats"], [class*="stats" i]').first();
  }

  get pendingCount(): Locator {
    return this.page
      .locator('[data-testid="pending-count"], [class*="pending" i] [class*="count" i]')
      .first();
  }

  get inProgressCount(): Locator {
    return this.page
      .locator('[data-testid="in-progress-count"], [class*="in-progress" i] [class*="count" i]')
      .first();
  }

  get completedCount(): Locator {
    return this.page
      .locator('[data-testid="completed-count"], [class*="completed" i] [class*="count" i]')
      .first();
  }

  // ============================================================================
  // LOCATORS - Review Page Tabs
  // ============================================================================

  get tabsContainer(): Locator {
    return this.page.locator('[data-testid="review-tabs"], [role="tablist"]').first();
  }

  get recordingTab(): Locator {
    return this.page
      .locator(
        '[data-testid="tab-recording"], [role="tab"]:has-text("Recording"), button:has-text("Recording")'
      )
      .first();
  }

  get analysisTab(): Locator {
    return this.page
      .locator(
        '[data-testid="tab-analysis"], [role="tab"]:has-text("Analysis"), button:has-text("Analysis")'
      )
      .first();
  }

  get feedbackTab(): Locator {
    return this.page
      .locator(
        '[data-testid="tab-feedback"], [role="tab"]:has-text("Feedback"), button:has-text("Feedback")'
      )
      .first();
  }

  get chatTab(): Locator {
    return this.page
      .locator('[data-testid="tab-chat"], [role="tab"]:has-text("Chat"), button:has-text("Chat")')
      .first();
  }

  // ============================================================================
  // LOCATORS - Recording Tab
  // ============================================================================

  get videoPlayer(): Locator {
    return this.page.locator('[data-testid="video-player"], video, [class*="player" i]').first();
  }

  get playButton(): Locator {
    return this.page.locator('[data-testid="play-button"], button[aria-label*="play" i]').first();
  }

  get progressBar(): Locator {
    return this.page
      .locator('[data-testid="progress-bar"], [class*="progress" i], input[type="range"]')
      .first();
  }

  get transcriptPanel(): Locator {
    return this.page.locator('[data-testid="transcript"], [class*="transcript" i]').first();
  }

  get transcriptSegments(): Locator {
    return this.transcriptPanel.locator('[data-testid="segment"], [class*="segment" i]');
  }

  get recordingHistory(): Locator {
    return this.page.locator('[data-testid="recording-history"], [class*="history" i]').first();
  }

  // ============================================================================
  // LOCATORS - Analysis Tab
  // ============================================================================

  get analysisResults(): Locator {
    return this.page
      .locator('[data-testid="analysis-results"], [class*="analysis" i][class*="results" i]')
      .first();
  }

  get overallScore(): Locator {
    return this.page
      .locator('[data-testid="overall-score"], [class*="overall" i] [class*="score" i]')
      .first();
  }

  get verdictBadge(): Locator {
    return this.page
      .locator(
        '[data-testid="verdict"], [class*="verdict" i], [class*="pass" i], [class*="fail" i]'
      )
      .first();
  }

  get stepResults(): Locator {
    return this.page.locator('[data-testid="step-result"], [class*="step" i][class*="result" i]');
  }

  get missedItems(): Locator {
    return this.page.locator('[data-testid="missed-items"], [class*="missed" i]').first();
  }

  get analysisTimeline(): Locator {
    return this.page.locator('[data-testid="analysis-timeline"], [class*="timeline" i]').first();
  }

  // ============================================================================
  // LOCATORS - Feedback Tab
  // ============================================================================

  get feedbackForm(): Locator {
    return this.page
      .locator('[data-testid="feedback-form"], form:has([name="decision"]), [class*="feedback" i]')
      .first();
  }

  get approveRadio(): Locator {
    return this.page
      .locator(
        'input[type="radio"][value="approved"], input[name="decision"][value="approved"], [data-testid="approve"]'
      )
      .first();
  }

  get rejectRadio(): Locator {
    return this.page
      .locator(
        'input[type="radio"][value="rejected"], input[name="decision"][value="rejected"], [data-testid="reject"]'
      )
      .first();
  }

  get needsImprovementRadio(): Locator {
    return this.page
      .locator('input[type="radio"][value="needs_improvement"], [data-testid="needs-improvement"]')
      .first();
  }

  get feedbackTextarea(): Locator {
    return this.page
      .locator('[data-testid="feedback-text"], textarea[name="feedback"], [contenteditable="true"]')
      .first();
  }

  get submitFeedbackButton(): Locator {
    return this.page
      .locator(
        '[data-testid="submit-feedback"], button:has-text("Submit Review"), button:has-text("Submit Feedback")'
      )
      .first();
  }

  // ============================================================================
  // LOCATORS - Chat Tab
  // ============================================================================

  get chatContainer(): Locator {
    return this.page.locator('[data-testid="chat-container"], [class*="chat" i]').first();
  }

  get chatMessages(): Locator {
    return this.chatContainer.locator('[data-testid="message"], [class*="message" i]');
  }

  get chatInput(): Locator {
    return this.page
      .locator('[data-testid="chat-input"], input[name="message"], textarea[name="message"]')
      .first();
  }

  get sendMessageButton(): Locator {
    return this.page
      .locator(
        '[data-testid="send-message"], button:has-text("Send"), button[aria-label*="send" i]'
      )
      .first();
  }

  // ============================================================================
  // LOCATORS - Empty State
  // ============================================================================

  get emptyState(): Locator {
    return this.page
      .locator(
        '[data-testid="no-reviews"], [class*="empty" i]:has-text("review"), p:has-text("No reviews")'
      )
      .first();
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  /**
   * Wait for reviews page to load
   */
  async waitForReviewsLoad(): Promise<void> {
    await this.waitForLoadingToComplete();
    await expect(this.pageTitle.or(this.reviewsList).or(this.emptyState)).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
  }

  /**
   * Filter reviews by status
   */
  async filterByStatus(status: string): Promise<void> {
    await this.statusFilter.selectOption(status);
    await this.waitForLoadingToComplete();
  }

  /**
   * Filter reviews by priority
   */
  async filterByPriority(priority: string): Promise<void> {
    await this.priorityFilter.selectOption(priority);
    await this.waitForLoadingToComplete();
  }

  /**
   * Toggle show archived
   */
  async toggleShowArchived(): Promise<void> {
    await this.showArchivedToggle.click();
    await this.waitForLoadingToComplete();
  }

  /**
   * Click on a review to open it
   */
  async openReview(titleOrId: string): Promise<void> {
    const card = this.getReviewCard(titleOrId);
    await card.click();
    await this.waitForLoadingToComplete();
  }

  /**
   * Switch to a specific tab
   */
  async switchTab(tab: 'recording' | 'analysis' | 'feedback' | 'chat'): Promise<void> {
    const tabMap = {
      recording: this.recordingTab,
      analysis: this.analysisTab,
      feedback: this.feedbackTab,
      chat: this.chatTab,
    };
    await tabMap[tab].click();
    await this.waitForLoadingToComplete();
  }

  /**
   * Play video
   */
  async playVideo(): Promise<void> {
    await this.playButton.click();
  }

  /**
   * Seek to timestamp in video
   */
  async seekToTimestamp(seconds: number): Promise<void> {
    await this.page.evaluate((time) => {
      const video = document.querySelector('video');
      if (video) video.currentTime = time;
    }, seconds);
  }

  /**
   * Submit review feedback
   */
  async submitFeedback(
    decision: 'approved' | 'rejected' | 'needs_improvement',
    feedbackText: string
  ): Promise<void> {
    await this.switchTab('feedback');

    const decisionMap = {
      approved: this.approveRadio,
      rejected: this.rejectRadio,
      needs_improvement: this.needsImprovementRadio,
    };

    await decisionMap[decision].click();
    await this.feedbackTextarea.fill(feedbackText);
    await this.submitFeedbackButton.click();

    await this.waitForSuccessToast();
  }

  /**
   * Send a chat message
   */
  async sendChatMessage(message: string): Promise<void> {
    await this.switchTab('chat');
    await this.chatInput.fill(message);
    await this.sendMessageButton.click();
    await this.waitForLoadingToComplete();
  }

  /**
   * Get analysis verdict
   */
  async getVerdict(): Promise<string> {
    await this.switchTab('analysis');
    const text = await this.verdictBadge.textContent();
    return text?.trim().toUpperCase() || '';
  }

  /**
   * Get overall score
   */
  async getOverallScore(): Promise<number> {
    await this.switchTab('analysis');
    const text = await this.overallScore.textContent();
    const match = text?.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * Get count of reviews
   */
  async getReviewCount(): Promise<number> {
    await this.waitForLoadingToComplete();
    return this.reviewCards.count();
  }

  // ============================================================================
  // ASSERTIONS
  // ============================================================================

  /**
   * Assert review exists in list
   */
  async assertReviewExists(title: string): Promise<void> {
    await expect(this.getReviewCard(title)).toBeVisible({ timeout: TIMEOUTS.medium });
  }

  /**
   * Assert review does not exist
   */
  async assertReviewNotExists(title: string): Promise<void> {
    await expect(this.getReviewCard(title)).not.toBeVisible({ timeout: TIMEOUTS.short });
  }

  /**
   * Assert empty state is shown
   */
  async assertEmptyState(): Promise<void> {
    await expect(this.emptyState).toBeVisible();
  }

  /**
   * Assert video player is visible
   */
  async assertVideoPlayerVisible(): Promise<void> {
    await expect(this.videoPlayer).toBeVisible();
  }

  /**
   * Assert analysis results are visible
   */
  async assertAnalysisVisible(): Promise<void> {
    await this.switchTab('analysis');
    await expect(this.analysisResults.or(this.overallScore)).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
  }

  /**
   * Assert analysis verdict
   */
  async assertVerdict(expected: 'PASS' | 'PARTIAL_PASS' | 'NEEDS_REVIEW' | 'FAIL'): Promise<void> {
    const verdict = await this.getVerdict();
    expect(verdict).toContain(expected);
  }

  /**
   * Assert feedback form is visible
   */
  async assertFeedbackFormVisible(): Promise<void> {
    await this.switchTab('feedback');
    await expect(this.feedbackForm.or(this.feedbackTextarea)).toBeVisible();
  }

  /**
   * Assert feedback submitted successfully
   */
  async assertFeedbackSubmitted(): Promise<void> {
    await expect(this.successToast).toBeVisible({ timeout: TIMEOUTS.short });
  }

  /**
   * Assert transcript is visible
   */
  async assertTranscriptVisible(): Promise<void> {
    await expect(this.transcriptPanel).toBeVisible();
    const segmentCount = await this.transcriptSegments.count();
    expect(segmentCount).toBeGreaterThan(0);
  }
}
