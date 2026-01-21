import { logger } from './logger';

/**
 * Environment variable configuration schema
 * Defines which variables are required and their validation rules
 */
interface EnvVarConfig {
  name: string;
  required: boolean;
  description: string;
  defaultValue?: string;
  validate?: (value: string) => boolean;
  redact?: boolean; // Whether to hide value in logs
}

const ENV_VAR_CONFIG: EnvVarConfig[] = [
  // Critical - app won't work without these
  {
    name: 'JWT_SECRET',
    required: true,
    description: 'Secret key for signing JWT tokens',
    redact: true,
    validate: (v) => v.length >= 32,
  },
  {
    name: 'DATABASE_URL',
    required: true,
    description: 'PostgreSQL connection string',
    redact: true,
  },

  // Important - features may not work
  {
    name: 'NODE_ENV',
    required: false,
    description: 'Environment mode',
    defaultValue: 'development',
    validate: (v) => ['development', 'test', 'production', 'staging'].includes(v),
  },
  {
    name: 'PORT',
    required: false,
    description: 'Server port',
    defaultValue: '3000',
    validate: (v) => !isNaN(parseInt(v, 10)) && parseInt(v, 10) > 0,
  },
  {
    name: 'CORS_ORIGIN',
    required: false,
    description: 'Allowed CORS origins (comma-separated)',
    defaultValue: 'http://localhost:5173',
  },
  {
    name: 'FRONTEND_URL',
    required: false,
    description: 'Frontend URL for magic links and redirects',
  },

  // Email configuration
  {
    name: 'EMAIL_FROM',
    required: false,
    description: 'Default sender email address',
    validate: (v) => v.includes('@'),
  },
  {
    name: 'EMAIL_HOST',
    required: false,
    description: 'SMTP server hostname (e.g., smtp.gmail.com)',
  },

  // AWS/S3 configuration
  {
    name: 'AWS_REGION',
    required: false,
    description: 'AWS region for S3 storage',
  },
  {
    name: 'AWS_S3_BUCKET',
    required: false,
    description: 'S3 bucket name for file storage',
  },
  {
    name: 'AWS_ACCESS_KEY_ID',
    required: false,
    description: 'AWS access key',
    redact: true,
  },
  {
    name: 'AWS_SECRET_ACCESS_KEY',
    required: false,
    description: 'AWS secret key',
    redact: true,
  },

  // Redis configuration
  {
    name: 'REDIS_URL',
    required: false,
    description: 'Redis connection URL for caching and queues',
    redact: true,
  },

  // Stripe configuration
  {
    name: 'STRIPE_SECRET_KEY',
    required: false,
    description: 'Stripe API secret key',
    redact: true,
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    required: false,
    description: 'Stripe webhook signing secret',
    redact: true,
  },

  // AI/Transcription services
  {
    name: 'OPENAI_API_KEY',
    required: false,
    description: 'OpenAI API key for AI features',
    redact: true,
  },
  {
    name: 'DEEPGRAM_API_KEY',
    required: false,
    description: 'Deepgram API key for transcription',
    redact: true,
  },

  // Security
  {
    name: 'BACKEND_API_KEY',
    required: false,
    description: 'API key for backend-to-backend authentication',
    redact: true,
    validate: (v) => v.length >= 32,
  },
];

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate all environment variables at startup
 * Returns validation result with errors for required vars and warnings for optional ones
 */
export function validateEnvironmentVariables(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const config of ENV_VAR_CONFIG) {
    const value = process.env[config.name];

    if (!value && config.required) {
      errors.push(`❌ ${config.name}: Required but not set - ${config.description}`);
      continue;
    }

    if (!value && !config.required && !config.defaultValue) {
      // Optional and no default - just note it
      warnings.push(`⚠️  ${config.name}: Not set - ${config.description}`);
      continue;
    }

    if (!value && config.defaultValue) {
      // Will use default
      logger.debug(`${config.name}: Using default value`);
      continue;
    }

    // Validate value if validator exists
    if (value && config.validate && !config.validate(value)) {
      const msg = `❌ ${config.name}: Invalid value - ${config.description}`;
      if (config.required) {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate environment variables and fail fast if critical ones are missing
 * Should be called at the very start of the application
 */
export function validateEnvironmentOrFail(): void {
  const result = validateEnvironmentVariables();

  // Log all warnings
  if (result.warnings.length > 0) {
    logger.warn('Environment variable warnings:');
    result.warnings.forEach(w => logger.warn(w));
  }

  // Fail on errors
  if (!result.valid) {
    logger.error('Environment validation failed! Missing or invalid required variables:');
    result.errors.forEach(e => logger.error(e));
    logger.error('Please set the required environment variables and restart the server.');
    throw new Error('Environment validation failed - missing required variables');
  }

  logger.info('✅ Environment variables validated successfully');
}

/**
 * Get the frontend URL for generating public links (magic links, etc.)
 * Attempts to use configured FRONTEND_URL, with intelligent fallbacks
 */
export function getFrontendUrl(): string {
  // 1. First priority: Environment variable (explicitly configured)
  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL;
  }

  // 2. Second priority: Environment-based defaults
  const nodeEnv = process.env.NODE_ENV || 'development';
  const portStr = process.env.FRONTEND_PORT || (nodeEnv === 'production' ? '80' : '5174');
  const port = parseInt(portStr, 10);

  // 3. Determine protocol based on environment
  const protocol = nodeEnv === 'production' ? 'https' : 'http';

  // 4. Determine hostname (default to localhost for development)
  const hostname = process.env.FRONTEND_HOST || 'localhost';

  // 5. Build the URL, excluding default ports
  let url = `${protocol}://${hostname}`;

  // Only append port if it's not a default port for the protocol
  const isDefaultPort = (protocol === 'https' && port === 443) || (protocol === 'http' && port === 80);
  if (!isDefaultPort) {
    url += `:${port}`;
  }

  // Log when using fallback configuration
  logger.warn(`FRONTEND_URL not configured, using fallback: ${url}`);

  return url;
}

/**
 * Get the frontend URL for a specific magic link token
 */
export function getMagicLinkUrl(token: string, organizationId?: string): string {
  const baseUrl = getFrontendUrl();
  let url = `${baseUrl}/t/${token}`;
  if (organizationId) {
    url += `?org=${organizationId}`;
  }
  return url;
}

/**
 * Validate that FRONTEND_URL is properly configured
 * This should be called during application startup
 */
export function validateFrontendConfiguration(): void {
  if (!process.env.FRONTEND_URL) {
    logger.warn('FRONTEND_URL environment variable is not set. Using fallback configuration. ' +
      'Please set FRONTEND_URL for production deployments.');
  }

  try {
    const url = getFrontendUrl();
    logger.info(`Frontend URL configured as: ${url}`);
  } catch (error) {
    logger.error('Failed to determine frontend URL:', error);
    throw new Error('Failed to initialize frontend URL configuration');
  }
}
