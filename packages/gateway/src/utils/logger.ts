import winston from 'winston';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

// Custom format for structured logging
const structuredFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    const logObject = {
      timestamp,
      level,
      message,
      ...meta
    };
    return JSON.stringify(logObject);
  })
);

// Create Winston logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: structuredFormat,
  transports: [
    // Use the top-level JSON format for console output as well
    new winston.transports.Console()
  ]
});

// Enhanced logging interface with structured logging capabilities
export interface LogMetadata {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  operation?: string;
  duration?: string;
  recordId?: string;
  serviceId?: string;
  endpoint?: string;
  error?: Error | string;
  metadata?: Record<string, any>;
  [key: string]: any;
}

class StructuredLogger {
  private logger: winston.Logger;

  constructor(winstonLogger: winston.Logger) {
    this.logger = winstonLogger;
  }

  private formatMessage(message: string, meta?: LogMetadata): [string, LogMetadata] {
    const formattedMeta = meta ? { ...meta } : {};

    // Add context information if available
    if (formattedMeta.error && formattedMeta.error instanceof Error) {
      formattedMeta.error = {
        message: formattedMeta.error.message,
        stack: formattedMeta.error.stack,
        name: formattedMeta.error.name
      };
    }

    return [message, formattedMeta];
  }

  error(message: string, meta?: LogMetadata): void {
    const [msg, formattedMeta] = this.formatMessage(message, meta);
    this.logger.error(msg, formattedMeta);
  }

  warn(message: string, meta?: LogMetadata): void {
    const [msg, formattedMeta] = this.formatMessage(message, meta);
    this.logger.warn(msg, formattedMeta);
  }

  info(message: string, meta?: LogMetadata): void {
    const [msg, formattedMeta] = this.formatMessage(message, meta);
    this.logger.info(msg, formattedMeta);
  }

  debug(message: string, meta?: LogMetadata): void {
    const [msg, formattedMeta] = this.formatMessage(message, meta);
    this.logger.debug(msg, formattedMeta);
  }

  trace(message: string, meta?: LogMetadata): void {
    const [msg, formattedMeta] = this.formatMessage(message, meta);
    this.logger.log('trace', msg, formattedMeta);
  }

  // Performance logging helper
  perf(operation: string, startTime: number, meta?: LogMetadata): void {
    const duration = `${Date.now() - startTime}ms`;
    this.info(`${operation} completed`, {
      ...meta,
      operation,
      duration,
      metadata: { type: 'performance', ...meta?.metadata }
    });
  }

  // Security logging helper
  security(message: string, meta?: LogMetadata): void {
    this.warn(`SECURITY: ${message}`, {
      ...meta,
      metadata: { type: 'security', ...meta?.metadata }
    });
  }

  // Business logic logging helper
  business(message: string, meta?: LogMetadata): void {
    this.info(message, {
      ...meta,
      metadata: { type: 'business', ...meta?.metadata }
    });
  }

  // Child logger with persistent context
  child(context: LogMetadata): StructuredLogger {
    return new StructuredLogger(this.logger.child(context));
  }
}

// Export configured logger instance
export const log = new StructuredLogger(logger);

// Export for testing
export { logger as winstonLogger };
