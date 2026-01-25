import { Router } from 'express';
import authRoutes from './auth.routes';
import taskRoutes from './task.routes';
import templateRoutes from './template.routes';
import recordingRoutes from './recording.routes';
import reviewRoutes from './review.routes';
import userRoutes from './user.routes';
import dashboardRoutes from './dashboard.routes';
import testRoutes from './test.routes';
import magicLinkRoutes from './magicLink.routes';
import debugRoutes from './debug.routes';

// Phase 4-8: Multi-tenant SaaS routes
import authV2Routes from './auth-v2.routes';
import organizationV2Routes from './organization-v2.routes';
import organizationMemberRoutes from './organization-member.routes';
import invitationsV2Routes from './invitations-v2.routes';
import auditLoggingRoutes from './audit-logging.routes';

// Phase 10: Onboarding
import onboardingRoutes from './onboarding.routes';

// Phase 11: Pricing Tiers & Feature Limits
import pricingRoutes from './pricing.routes';

// Phase 14: Storage Metrics & Recording Retention
import storageRoutes from './storage.routes';
import retentionRoutes from './retention.routes';

// Phase 15: API Metrics & Usage Tracking
import metricsRoutes from './metrics.routes';

// Phase 16: Admin Dashboard & System Admin
import adminDashboardRoutes from './admin-dashboard.routes';
import adminPricingRoutes from './admin-pricing.routes';
import adminSettingsRoutes from './admin-settings.routes';
import adminFeatureGrantsRoutes from './admin-feature-grants.routes';
import adminTrialsRoutes from './admin-trials.routes';
import adminVideoUploadRoutes from './admin-video-upload.routes';
import domainVerificationRoutes from './domain-verification.routes';
import subscriberEmailRoutes from './subscriber-email.routes';
import enterpriseRoutes from './enterprise.routes';

// Notification System
import notificationsRoutes from './notifications.routes';

// Phase 2: Billing & Monetization
import billingRoutes from './billing.routes';
// Note: Webhook routes are mounted directly at app level (before middleware) - see index.ts

// Phase 3: AI & Transcription
import transcriptionRoutes from './transcription.routes';
import searchRoutes from './search.routes';

// AI Rubric Generation (Premium Feature)
import rubricGenerationRoutes from './rubric-generation.routes';

const router = Router();

// API version and status
router.get('/', (_req, res) => {
  res.json({
    message: 'CogVeri API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/tasks', taskRoutes);
router.use('/templates', templateRoutes);
router.use('/recordings', recordingRoutes);
router.use('/reviews', reviewRoutes);
router.use('/users', userRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/test', testRoutes);
router.use('/magic-links', magicLinkRoutes);

// Phase 4-8: Multi-tenant SaaS routes
router.use('/auth/v2', authV2Routes);
router.use('/organizations', organizationV2Routes);
router.use('/organizations', organizationMemberRoutes);  // Member management (invite, role changes, etc.)
router.use('/invitations/v2', invitationsV2Routes);
router.use('/audit', auditLoggingRoutes);  // Changed from '/' to '/audit' - mounting at '/' applies middleware to ALL routes!

// Phase 10: Onboarding routes
router.use('/onboarding', onboardingRoutes);

// Phase 11: Pricing Tiers & Feature Limits routes
router.use('/pricing', pricingRoutes);

// Phase 14: Storage Metrics & Recording Retention routes
router.use('/storage', storageRoutes);
router.use('/retention', retentionRoutes);

// Phase 15: API Metrics & Usage Tracking routes
router.use('/metrics', metricsRoutes);

// Phase 16: Admin Dashboard & System Admin routes
router.use('/admin', adminDashboardRoutes);
router.use('/admin/pricing', adminPricingRoutes);  // Pricing tier management (system admin only)
router.use('/admin/settings', adminSettingsRoutes);  // System settings (trial duration, etc.)
router.use('/admin', adminFeatureGrantsRoutes);  // Feature grants for organizations
router.use('/admin', adminTrialsRoutes);  // Trial management for organizations
router.use('/admin/video-upload', adminVideoUploadRoutes);  // Sysadmin video upload to tasks
router.use('/admin/enterprise', enterpriseRoutes);  // Enterprise plan management (system admin only)
router.use('/domain-verification', domainVerificationRoutes);
router.use('/subscriber-email', subscriberEmailRoutes);

// Notification System routes
router.use('/notifications', notificationsRoutes);

// Phase 2: Billing & Monetization routes
router.use('/billing', billingRoutes);
// Note: Webhook routes (/api/webhooks/stripe) are mounted at app level - see backend/src/index.ts

// Phase 3: AI & Transcription routes
router.use('/transcription', transcriptionRoutes);
router.use('/search', searchRoutes);

// AI Rubric Generation (Premium Feature - Pro+ tiers)
router.use('/rubric-generation', rubricGenerationRoutes);

// Debug routes - ONLY available in development, NEVER in production
// This is a security control - debug endpoints expose sensitive information
// and must never be accessible in production environments regardless of configuration
if (process.env.NODE_ENV === 'development') {
  router.use('/debug', debugRoutes);
}

export default router;
