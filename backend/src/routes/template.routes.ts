import { Router } from 'express';
import { enhancedAuthenticate } from '../middleware/enhanced-auth.middleware';
import templateController from '../controllers/template.controller';

const router = Router();

// All routes require authentication with RLS context
router.use(enhancedAuthenticate);

// System defaults - publicly accessible but read-only
router.get('/defaults', templateController.getSystemDefaults);

// Restorable defaults - system defaults the org doesn't have yet
router.get('/restorable', templateController.getRestorableDefaults);

// Restore a system default template
router.post('/restore', templateController.restoreDefault);

// Organization templates - CRUD operations
router.get('/', templateController.getOrganizationTemplates);
router.post('/', templateController.createTemplate);
router.get('/:id', templateController.getTemplate);
router.put('/:id', templateController.updateTemplate);
router.delete('/:id', templateController.deleteTemplate);

export default router;
