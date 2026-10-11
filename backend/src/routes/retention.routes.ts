import { Router } from 'express';
import retentionController from '../controllers/retention.controller';
import { enhancedAuthenticate } from '../middleware/enhanced-auth.middleware';

const router = Router();

// All retention routes require authentication and organization
router.use(enhancedAuthenticate);

// Retention policy CRUD endpoints
router.post('/policies', retentionController.createRetentionPolicy);
router.get('/policies', retentionController.getRetentionPolicies);
router.get('/policies/:policyId', retentionController.getRetentionPolicy);
router.put('/policies/:policyId', retentionController.updateRetentionPolicy);
router.delete('/policies/:policyId', retentionController.deleteRetentionPolicy);

// Retention policy management endpoints
router.post('/policies/:policyId/set-default', retentionController.setDefaultRetentionPolicy);
router.post('/policies/:policyId/enforce', retentionController.enforceRetentionPolicy);
router.get('/policies/:policyId/history', retentionController.getPolicyExecutionHistory);

// Bulk enforcement endpoint
router.post('/enforce-all', retentionController.enforceAllRetentionPolicies);

export default router;
