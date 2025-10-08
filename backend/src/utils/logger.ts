import winston from 'winston';
import path from 'path';

const logLevel = process.env.LOG_LEVEL || 'info';
const logFormat = process.env.LOG_FORMAT || 'json';

// Define log format
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta, null, 2)}`;
    }
    return msg;
  })
);

// Create transports
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? jsonFormat : consoleFormat,
  }),
];

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  transports.push(
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      format: jsonFormat,
    }),
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      format: jsonFormat,
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat === 'json' ? jsonFormat : consoleFormat,
  transports,
  exitOnError: false,
});

// Create stream for Morgan HTTP logging
export const httpLogStream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

// Log unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});