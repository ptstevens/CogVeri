import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { enhancedAuthenticate, EnhancedAuthRequest } from '../middleware/enhanced-auth.middleware';
import { requireSystemAdmin } from '../middleware/system-admin.middleware';
import { aiPromptsService } from '../services/ai-prompts.service';
import { PromptKey } from '../types/ai-prompts.types';
import { logger } from '../utils/logger';

const router = Router();

// All admin AI prompts routes require enhanced authentication + system admin check
router.use(enhancedAuthenticate);
router.use(requireSystemAdmin);

// Rate limiter for test endpoint (1 request per 10 seconds per user)
// This prevents API cost abuse when testing prompts with Gemini
const promptTestRateLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  max: 1,
  message: 'Please wait before testing another prompt (rate limited to prevent API cost abuse).',
  keyGenerator: (req) => (req as EnhancedAuthRequest).user?.id || req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
});

// Valid prompt keys
const VALID_PROMPT_KEYS: PromptKey[] = ['speech_analysis', 'visual_analysis', 'rubric_generation'];

/**
 * Validate prompt key parameter
 */
function isValidPromptKey(key: string | undefined): key is PromptKey {
  return typeof key === 'string' && VALID_PROMPT_KEYS.includes(key as PromptKey);
}

/**
 * Get all prompts
 * GET /api/admin/ai-prompts
 */
router.get('/', async (_req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const prompts = await aiPromptsService.getAllPrompts();
    res.json({
      success: true,
      prompts,
    });
  } catch (error) {
    logger.error('Error getting AI prompts:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get prompt details with history
 * GET /api/admin/ai-prompts/:key
 */
router.get('/:key', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const { key } = req.params;

    if (!isValidPromptKey(key)) {
      res.status(400).json({
        success: false,
        error: `Invalid prompt key. Valid keys: ${VALID_PROMPT_KEYS.join(', ')}`,
      });
      return;
    }

    const prompt = await aiPromptsService.getPromptWithHistory(key);

    if (!prompt) {
      res.status(404).json({
        success: false,
        error: `Prompt "${key}" not found`,
      });
      return;
    }

    res.json({
      success: true,
      prompt,
    });
  } catch (error) {
    logger.error(`Error getting AI prompt ${req.params.key}:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Update prompt
 * PUT /api/admin/ai-prompts/:key
 * Body: { systemPrompt: string, reason?: string }
 */
router.put('/:key', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const { key } = req.params;
    const { systemPrompt, reason } = req.body;

    if (!isValidPromptKey(key)) {
      res.status(400).json({
        success: false,
        error: `Invalid prompt key. Valid keys: ${VALID_PROMPT_KEYS.join(', ')}`,
      });
      return;
    }

    if (!systemPrompt || typeof systemPrompt !== 'string') {
      res.status(400).json({
        success: false,
        error: 'systemPrompt is required and must be a string',
      });
      return;
    }

    if (systemPrompt.trim().length < 50) {
      res.status(400).json({
        success: false,
        error: 'systemPrompt must be at least 50 characters',
      });
      return;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      res.status(400).json({
        success: false,
        error: 'A change reason is required (minimum 5 characters)',
      });
      return;
    }

    const userId = req.user!.id;
    const updatedPrompt = await aiPromptsService.updatePrompt(key, systemPrompt, userId, reason);

    logger.info(`AI prompt "${key}" updated by user ${userId}`, {
      promptKey: key,
      newVersion: updatedPrompt.version,
      reason,
    });

    res.json({
      success: true,
      message: `Prompt "${key}" updated successfully`,
      prompt: updatedPrompt,
    });
  } catch (error) {
    logger.error(`Error updating AI prompt ${req.params.key}:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get prompt history
 * GET /api/admin/ai-prompts/:key/history
 */
router.get('/:key/history', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const { key } = req.params;

    if (!isValidPromptKey(key)) {
      res.status(400).json({
        success: false,
        error: `Invalid prompt key. Valid keys: ${VALID_PROMPT_KEYS.join(', ')}`,
      });
      return;
    }

    const history = await aiPromptsService.getPromptHistory(key);

    res.json({
      success: true,
      history,
    });
  } catch (error) {
    logger.error(`Error getting AI prompt history ${req.params.key}:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Revert prompt to a specific version
 * POST /api/admin/ai-prompts/:key/revert
 * Body: { version: number }
 */
router.post('/:key/revert', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const { key } = req.params;
    const { version } = req.body;

    if (!isValidPromptKey(key)) {
      res.status(400).json({
        success: false,
        error: `Invalid prompt key. Valid keys: ${VALID_PROMPT_KEYS.join(', ')}`,
      });
      return;
    }

    if (typeof version !== 'number' || version < 1) {
      res.status(400).json({
        success: false,
        error: 'version is required and must be a positive number',
      });
      return;
    }

    const userId = req.user!.id;
    const updatedPrompt = await aiPromptsService.revertToVersion(key, version, userId);

    logger.info(`AI prompt "${key}" reverted to version ${version} by user ${userId}`, {
      promptKey: key,
      revertedToVersion: version,
      newVersion: updatedPrompt.version,
    });

    res.json({
      success: true,
      message: `Prompt "${key}" reverted to version ${version}`,
      prompt: updatedPrompt,
    });
  } catch (error) {
    logger.error(`Error reverting AI prompt ${req.params.key}:`, error);

    // Handle specific error for version not found
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Reset prompt to default
 * POST /api/admin/ai-prompts/:key/reset
 */
router.post('/:key/reset', async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
  try {
    const { key } = req.params;

    if (!isValidPromptKey(key)) {
      res.status(400).json({
        success: false,
        error: `Invalid prompt key. Valid keys: ${VALID_PROMPT_KEYS.join(', ')}`,
      });
      return;
    }

    const userId = req.user!.id;
    const updatedPrompt = await aiPromptsService.resetToDefault(key, userId);

    logger.info(`AI prompt "${key}" reset to default by user ${userId}`, {
      promptKey: key,
      newVersion: updatedPrompt.version,
    });

    res.json({
      success: true,
      message: `Prompt "${key}" reset to default`,
      prompt: updatedPrompt,
    });
  } catch (error) {
    logger.error(`Error resetting AI prompt ${req.params.key}:`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Test prompt with sample data
 * POST /api/admin/ai-prompts/:key/test
 * Body: { systemPrompt: string, testData: object }
 *
 * Rate limited to 1 request per 10 seconds to prevent API cost abuse
 */
router.post(
  '/:key/test',
  promptTestRateLimiter,
  async (req: EnhancedAuthRequest, res: Response): Promise<void> => {
    try {
      const { key } = req.params;
      const { systemPrompt, testData } = req.body;

      if (!isValidPromptKey(key)) {
        res.status(400).json({
          success: false,
          error: `Invalid prompt key. Valid keys: ${VALID_PROMPT_KEYS.join(', ')}`,
        });
        return;
      }

      if (!systemPrompt || typeof systemPrompt !== 'string') {
        res.status(400).json({
          success: false,
          error: 'systemPrompt is required and must be a string',
        });
        return;
      }

      logger.info(`Testing AI prompt "${key}" by user ${req.user!.id}`, {
        promptKey: key,
        promptLength: systemPrompt.length,
      });

      const result = await aiPromptsService.testPrompt(key, systemPrompt, testData || {});

      res.json({
        success: true,
        result,
      });
    } catch (error) {
      logger.error(`Error testing AI prompt ${req.params.key}:`, error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
