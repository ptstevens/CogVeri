import { Router } from 'express';
import * as metricsController from '../controllers/metrics.controller';
import { enhancedAuthenticate } from '../middleware/enhanced-auth.middleware';

const router = Router();

// Apply authentication and organization middleware to all metrics routes
router.use(enhancedAuthenticate);

// Usage summary and analytics endpoints
router.get('/usage-summary', metricsController.getUsageSummary);
router.get('/usage-by-endpoint', metricsController.getUsageByEndpoint);
router.get('/usage-by-user', metricsController.getUsageByUser);
router.get('/feature-usage', metricsController.getFeatureUsage);

// API key management endpoints
router.post('/api-keys', metricsController.createApiKey);
router.get('/api-keys', metricsController.getApiKeys);
router.delete('/api-keys/:keyId', metricsController.revokeApiKey);

// Rate limit status endpoint
router.get('/rate-limit-status', metricsController.getRateLimitStatus);

export default router;
