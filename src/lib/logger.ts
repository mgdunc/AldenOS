/**
 * Centralized logging utility
 * 
 * Provides consistent logging across the application with:
 * - Log levels (debug, info, warn, error)
 * - Console output in development
 * - Optional database logging for errors
 * - Production-ready structure for error tracking services
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: unknown
}

class Logger {
  private isDevelopment = import.meta.env.DEV
  private isProduction = import.meta.env.PROD

  /**
   * Log a debug message (only in development)
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      console.debug(`[DEBUG] ${message}`, context || '')
    }
  }

  /**
   * Log an info message
   */
  info(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      console.info(`[INFO] ${message}`, context || '')
    }
    // In production, you might want to send to analytics/monitoring
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: LogContext): void {
    console.warn(`[WARN] ${message}`, context || '')
    
    // In production, consider sending warnings to monitoring service
    if (this.isProduction) {
      // Future: Send to Sentry or similar
    }
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorObj = error instanceof Error ? error : error
    const errorMessage = errorObj instanceof Error ? errorObj.message : String(errorObj)
    
    console.error(`[ERROR] ${message}`, errorObj || '', context || '')
    
    // In production, send to error tracking service
    if (this.isProduction) {
      // Future: Send to Sentry or similar
      // Example: Sentry.captureException(errorObj, { extra: context })
    }
  }

  /**
   * Log with a specific level
   */
  log(level: LogLevel, message: string, data?: unknown): void {
    switch (level) {
      case 'debug':
        this.debug(message, data as LogContext)
        break
      case 'info':
        this.info(message, data as LogContext)
        break
      case 'warn':
        this.warn(message, data as LogContext)
        break
      case 'error':
        this.error(message, data as Error, data as LogContext)
        break
    }
  }

  /**
   * Create a scoped logger with a prefix
   */
  scope(prefix: string): ScopedLogger {
    return new ScopedLogger(this, prefix)
  }
}

/**
 * Scoped logger with a prefix for better organization
 */
class ScopedLogger {
  constructor(
    private logger: Logger,
    private prefix: string
  ) {}

  debug(message: string, context?: LogContext): void {
    this.logger.debug(`[${this.prefix}] ${message}`, context)
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(`[${this.prefix}] ${message}`, context)
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(`[${this.prefix}] ${message}`, context)
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    this.logger.error(`[${this.prefix}] ${message}`, error, context)
  }
}

// Export singleton instance
export const logger = new Logger()

// Export class for testing
export { Logger, type LogLevel, type LogContext }

