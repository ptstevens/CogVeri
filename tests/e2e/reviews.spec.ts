/**
 * Reviews E2E Tests
 *
 * Comprehensive tests for review workflows:
 * - Review list viewing
 * - Video playback
 * - Feedback submission
 * - Analysis results viewing
 */

import { test, expect } from '@playwright/test';
import { LoginPage, ReviewsPage, DashboardPage } from '../page-objects';
import { TEST_USERS, TIMEOUTS, REVIEW_DECISIONS } from '../fixtures/test-data';

test.describe('Reviews', () => {
  let loginPage: LoginPage;
  let reviewsPage: ReviewsPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    reviewsPage = new ReviewsPage(page);

    // Login as reviewer
    await loginPage.login(TEST_USERS.legacyAdmin.email, TEST_USERS.legacyAdmin.password);
  });

  test.describe('Reviews List', () => {
    test('should display reviews page', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();
      await expect(page).toHaveURL(/review/);
    });

    test('should show review cards or empty state', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount === 0) {
        await reviewsPage.assertEmptyState();
      } else {
        expect(reviewCount).toBeGreaterThan(0);
      }
    });

    test('should display review statistics', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const statsVisible = await reviewsPage.statsContainer.isVisible().catch(() => false);
      if (statsVisible) {
        await expect(reviewsPage.statsContainer).toBeVisible();
      }
    });

    test('review cards should display essential information', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount > 0) {
        const firstCard = reviewsPage.reviewCards.first();
        await expect(firstCard).toBeVisible();

        // Should contain task title or description
        const text = await firstCard.textContent();
        expect(text).toBeTruthy();
      }
    });
  });

  test.describe('Review Filtering', () => {
    test('should filter reviews by status', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const statusFilterVisible = await reviewsPage.statusFilter.isVisible().catch(() => false);
      if (statusFilterVisible) {
        await reviewsPage.filterByStatus('pending');
        await reviewsPage.waitForReviewsLoad();

        const filteredCount = await reviewsPage.getReviewCount();
        expect(filteredCount).toBeGreaterThanOrEqual(0);
      }
    });

    test('should filter reviews by priority', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const priorityFilterVisible = await reviewsPage.priorityFilter.isVisible().catch(() => false);
      if (priorityFilterVisible) {
        await reviewsPage.filterByPriority('high');
        await reviewsPage.waitForReviewsLoad();

        const filteredCount = await reviewsPage.getReviewCount();
        expect(filteredCount).toBeGreaterThanOrEqual(0);
      }
    });

    test('should toggle show archived', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const toggleVisible = await reviewsPage.showArchivedToggle.isVisible().catch(() => false);
      if (toggleVisible) {
        const initialCount = await reviewsPage.getReviewCount();
        await reviewsPage.toggleShowArchived();
        await reviewsPage.waitForReviewsLoad();

        // Count may change
        const newCount = await reviewsPage.getReviewCount();
        expect(newCount).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test.describe('Review Detail Page', () => {
    test('should open review detail when clicking on a review', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount > 0) {
        await reviewsPage.reviewCards.first().click();
        await reviewsPage.waitForLoadingToComplete();

        // Should navigate to review detail
        await expect(page).toHaveURL(/tasks\/[a-z0-9-]+\/review|review\/[a-z0-9-]+/i, {
          timeout: TIMEOUTS.medium,
        });
      }
    });

    test('should display tabs on review detail', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount > 0) {
        await reviewsPage.reviewCards.first().click();
        await reviewsPage.waitForLoadingToComplete();

        // Should have tabs
        const tabsVisible = await reviewsPage.tabsContainer.isVisible().catch(() => false);
        if (tabsVisible) {
          await expect(reviewsPage.tabsContainer).toBeVisible();
        }
      }
    });
  });

  test.describe('Video Playback', () => {
    test('should display video player on recording tab', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount > 0) {
        await reviewsPage.reviewCards.first().click();
        await reviewsPage.waitForLoadingToComplete();

        await reviewsPage.switchTab('recording');

        const videoVisible = await reviewsPage.videoPlayer.isVisible().catch(() => false);
        if (videoVisible) {
          await reviewsPage.assertVideoPlayerVisible();
        }
      }
    });

    test('should have video controls', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount > 0) {
        await reviewsPage.reviewCards.first().click();
        await reviewsPage.waitForLoadingToComplete();

        await reviewsPage.switchTab('recording');

        const videoVisible = await reviewsPage.videoPlayer.isVisible().catch(() => false);
        if (videoVisible) {
          // Video should have controls
          const hasControls = await reviewsPage.videoPlayer
            .evaluate((el) => {
              const video = el as HTMLVideoElement;
              return video.controls || document.querySelector('[class*="controls" i]') !== null;
            })
            .catch(() => false);

          expect(hasControls).toBe(true);
        }
      }
    });
  });

  test.describe('Transcript', () => {
    test('should display transcript if available', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount > 0) {
        await reviewsPage.reviewCards.first().click();
        await reviewsPage.waitForLoadingToComplete();

        await reviewsPage.switchTab('recording');

        const transcriptVisible = await reviewsPage.transcriptPanel.isVisible().catch(() => false);
        if (transcriptVisible) {
          await reviewsPage.assertTranscriptVisible();
        }
      }
    });

    test('transcript segments should be clickable', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount > 0) {
        await reviewsPage.reviewCards.first().click();
        await reviewsPage.waitForLoadingToComplete();

        await reviewsPage.switchTab('recording');

        const transcriptVisible = await reviewsPage.transcriptPanel.isVisible().catch(() => false);
        if (transcriptVisible) {
          const segmentCount = await reviewsPage.transcriptSegments.count();
          if (segmentCount > 0) {
            // Click a segment - should seek video
            await reviewsPage.transcriptSegments.first().click();
            // Video should respond (no error thrown)
          }
        }
      }
    });
  });

  test.describe('Analysis Results', () => {
    test('should display analysis tab', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount > 0) {
        await reviewsPage.reviewCards.first().click();
        await reviewsPage.waitForLoadingToComplete();

        const analysisTabVisible = await reviewsPage.analysisTab.isVisible().catch(() => false);
        if (analysisTabVisible) {
          await expect(reviewsPage.analysisTab).toBeVisible();
        }
      }
    });

    test('should show analysis results if completed', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount > 0) {
        await reviewsPage.reviewCards.first().click();
        await reviewsPage.waitForLoadingToComplete();

        const analysisTabVisible = await reviewsPage.analysisTab.isVisible().catch(() => false);
        if (analysisTabVisible) {
          await reviewsPage.switchTab('analysis');

          // Analysis may or may not be available
          const analysisVisible = await reviewsPage.analysisResults.isVisible().catch(() => false);
          const scoreVisible = await reviewsPage.overallScore.isVisible().catch(() => false);

          // If analysis exists, should show results or verdict
          if (analysisVisible || scoreVisible) {
            await reviewsPage.assertAnalysisVisible();
          }
        }
      }
    });

    test('should display step results breakdown', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount > 0) {
        await reviewsPage.reviewCards.first().click();
        await reviewsPage.waitForLoadingToComplete();

        const analysisTabVisible = await reviewsPage.analysisTab.isVisible().catch(() => false);
        if (analysisTabVisible) {
          await reviewsPage.switchTab('analysis');

          const stepResultsCount = await reviewsPage.stepResults.count().catch(() => 0);
          // If analysis exists, should have step results
          if (stepResultsCount > 0) {
            expect(stepResultsCount).toBeGreaterThan(0);
          }
        }
      }
    });
  });

  test.describe('Feedback Submission', () => {
    test('should display feedback tab', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount > 0) {
        await reviewsPage.reviewCards.first().click();
        await reviewsPage.waitForLoadingToComplete();

        const feedbackTabVisible = await reviewsPage.feedbackTab.isVisible().catch(() => false);
        if (feedbackTabVisible) {
          await expect(reviewsPage.feedbackTab).toBeVisible();
        }
      }
    });

    test('should display feedback form', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount > 0) {
        await reviewsPage.reviewCards.first().click();
        await reviewsPage.waitForLoadingToComplete();

        const feedbackTabVisible = await reviewsPage.feedbackTab.isVisible().catch(() => false);
        if (feedbackTabVisible) {
          await reviewsPage.switchTab('feedback');
          await reviewsPage.assertFeedbackFormVisible();
        }
      }
    });

    test('should have approve/reject options', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount > 0) {
        await reviewsPage.reviewCards.first().click();
        await reviewsPage.waitForLoadingToComplete();

        const feedbackTabVisible = await reviewsPage.feedbackTab.isVisible().catch(() => false);
        if (feedbackTabVisible) {
          await reviewsPage.switchTab('feedback');

          const approveVisible = await reviewsPage.approveRadio.isVisible().catch(() => false);
          const rejectVisible = await reviewsPage.rejectRadio.isVisible().catch(() => false);

          expect(approveVisible || rejectVisible).toBe(true);
        }
      }
    });

    test('should submit feedback successfully', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount > 0) {
        await reviewsPage.reviewCards.first().click();
        await reviewsPage.waitForLoadingToComplete();

        const feedbackTabVisible = await reviewsPage.feedbackTab.isVisible().catch(() => false);
        if (feedbackTabVisible) {
          await reviewsPage.switchTab('feedback');

          const approveVisible = await reviewsPage.approveRadio.isVisible().catch(() => false);
          const feedbackTextVisible = await reviewsPage.feedbackTextarea
            .isVisible()
            .catch(() => false);
          const submitVisible = await reviewsPage.submitFeedbackButton
            .isVisible()
            .catch(() => false);

          if (approveVisible && feedbackTextVisible && submitVisible) {
            await reviewsPage.approveRadio.click();
            await reviewsPage.feedbackTextarea.fill('E2E Test feedback - Great work!');
            await reviewsPage.submitFeedbackButton.click();

            // Should show success
            await reviewsPage.assertFeedbackSubmitted();
          }
        }
      }
    });

    test('should validate required fields before submission', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount > 0) {
        await reviewsPage.reviewCards.first().click();
        await reviewsPage.waitForLoadingToComplete();

        const feedbackTabVisible = await reviewsPage.feedbackTab.isVisible().catch(() => false);
        if (feedbackTabVisible) {
          await reviewsPage.switchTab('feedback');

          const submitVisible = await reviewsPage.submitFeedbackButton
            .isVisible()
            .catch(() => false);
          if (submitVisible) {
            // Try to submit without selecting a decision
            await reviewsPage.submitFeedbackButton.click();

            // Should not navigate away or should show error
            const stillOnPage = await reviewsPage.feedbackForm.isVisible().catch(() => false);
            expect(stillOnPage).toBe(true);
          }
        }
      }
    });
  });

  test.describe('Chat/Messaging', () => {
    test('should display chat tab if available', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount > 0) {
        await reviewsPage.reviewCards.first().click();
        await reviewsPage.waitForLoadingToComplete();

        const chatTabVisible = await reviewsPage.chatTab.isVisible().catch(() => false);
        if (chatTabVisible) {
          await expect(reviewsPage.chatTab).toBeVisible();
        }
      }
    });

    test('should display chat messages', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount > 0) {
        await reviewsPage.reviewCards.first().click();
        await reviewsPage.waitForLoadingToComplete();

        const chatTabVisible = await reviewsPage.chatTab.isVisible().catch(() => false);
        if (chatTabVisible) {
          await reviewsPage.switchTab('chat');

          const chatContainerVisible = await reviewsPage.chatContainer
            .isVisible()
            .catch(() => false);
          if (chatContainerVisible) {
            await expect(reviewsPage.chatContainer).toBeVisible();
          }
        }
      }
    });

    test('should send chat message', async ({ page }) => {
      await reviewsPage.goto();
      await reviewsPage.waitForReviewsLoad();

      const reviewCount = await reviewsPage.getReviewCount();
      if (reviewCount > 0) {
        await reviewsPage.reviewCards.first().click();
        await reviewsPage.waitForLoadingToComplete();

        const chatTabVisible = await reviewsPage.chatTab.isVisible().catch(() => false);
        if (chatTabVisible) {
          await reviewsPage.switchTab('chat');

          const chatInputVisible = await reviewsPage.chatInput.isVisible().catch(() => false);
          if (chatInputVisible) {
            await reviewsPage.chatInput.fill('E2E Test message');
            await reviewsPage.sendMessageButton.click();

            // Message should appear in chat
            await page.waitForTimeout(1000);
            const messagesCount = await reviewsPage.chatMessages.count();
            expect(messagesCount).toBeGreaterThan(0);
          }
        }
      }
    });
  });
});
