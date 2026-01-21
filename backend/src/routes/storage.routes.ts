import { Router } from 'express';
import storageController from '../controllers/storage.controller';
import { enhancedAuthenticate } from '../middleware/enhanced-auth.middleware';

const router = Router();

// All storage routes require authentication and organization
router.use(enhancedAuthenticate);

// Storage metrics endpoints
router.get('/metrics', storageController.getStorageMetrics);
router.get('/usage', storageController.getStorageUsage);
router.post('/recalculate', storageController.recalculateStorageMetrics);
router.post('/check-alerts', storageController.checkStorageAlerts);

// Storage quota alerts endpoints
router.post('/quota-alerts', storageController.createStorageQuotaAlert);
router.get('/quota-alerts', storageController.getStorageQuotaAlerts);
router.put('/quota-alerts/:alertId', storageController.updateStorageQuotaAlert);
router.delete('/quota-alerts/:alertId', storageController.deleteStorageQuotaAlert);

export default router;
