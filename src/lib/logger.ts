/**
 * Centralized logging utility
 * 
 * Provides consistent logging across the application with:
 * - Log levels (debug, info, warn, error)
 * - Console output in development
 * - Automatic database logging for errors
 * - Production-ready structure for error tracking services
 */

import { supabase } from './supabase'

/**
 * Get current user ID from Supabase auth
 * This is a helper to avoid circular dependencies with auth store
 * Uses getSession() which is more reliable than getUser() in some cases
 */
async function getCurrentUserId(): Promise<string | null> {
  try {
    // Try getSession first (faster, uses cached session)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError) {
      console.debug('[Logger] getSession error:', sessionError)
    }
    
    if (session?.user?.id) {
      // Validate it's not a zero UUID
      if (session.user.id !== '00000000-0000-0000-0000-000000000000') {
        return session.user.id
      }
    }
    
    // Fallback to getUser if session is not available or invalid
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError) {
      console.debug('[Logger] getUser error:', userError)
    }
    
    if (user?.id && user.id !== '00000000-0000-0000-0000-000000000000') {
      return user.id
    }
    
    return null
  } catch (error) {
    // Log but don't throw - we don't want logging to fail if auth fails
    console.debug('[Logger] Could not get user ID:', error)
    return null
  }
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: unknown
}

class Logger {
  private isDevelopment = import.meta.env.DEV
  private isProduction = import.meta.env.PROD

  /**
   * Safely serialize an object to JSON, handling circular references and complex objects
   */
  private serializeError(error: any): any {
    if (error === null || error === undefined) {
      return null
    }

    // Handle primitive types
    if (typeof error !== 'object') {
      return error
    }

    // Handle Error objects
    if (error instanceof Error) {
      const serialized: any = {
        name: error.name,
        message: error.message,
        stack: error.stack
      }

      // Copy enumerable properties
      for (const key in error) {
        if (error.hasOwnProperty(key)) {
          try {
            serialized[key] = this.serializeValue(error[key])
          } catch (e) {
            serialized[key] = '[Unable to serialize]'
          }
        }
      }

      return serialized
    }

    // Handle plain objects
    const serialized: any = {}
    for (const key in error) {
      if (error.hasOwnProperty(key)) {
        try {
          serialized[key] = this.serializeValue(error[key])
        } catch (e) {
          serialized[key] = '[Unable to serialize]'
        }
      }
    }

    return serialized
  }

  /**
   * Serialize a value, handling various types
   */
  private serializeValue(value: any): any {
    if (value === null || value === undefined) {
      return value
    }

    // Handle primitives
    if (typeof value !== 'object') {
      return value
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(item => this.serializeValue(item))
    }

    // Handle Date objects
    if (value instanceof Date) {
      return value.toISOString()
    }

    // Handle Error objects
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack
      }
    }

    // Handle plain objects - recursively serialize
    const serialized: any = {}
    for (const key in value) {
      if (value.hasOwnProperty(key)) {
        try {
          serialized[key] = this.serializeValue(value[key])
        } catch (e) {
          serialized[key] = '[Circular reference or unable to serialize]'
        }
      }
    }

    return serialized
  }

  /**
   * Extract error message from various error types
   */
  private extractErrorMessage(error?: Error | unknown): string {
    if (!error) return ''

    if (error instanceof Error) {
      return error.message
    }

    if (typeof error === 'string') {
      return error
    }

    if (typeof error === 'object') {
      // Try common error properties
      const obj = error as any
      if (obj.message) return String(obj.message)
      if (obj.error) return String(obj.error)
      if (obj.detail) return String(obj.detail)
      if (obj.hint) return String(obj.hint)
      
      // For Supabase errors, try to extract meaningful info
      if (obj.code) {
        return `${obj.code}: ${obj.message || obj.details || 'Unknown error'}`
      }
    }

    return String(error)
  }

  /**
   * Log an error to the database (system_logs table)
   */
  private async logErrorToDatabase(
    message: string,
    error?: Error | unknown,
    context?: LogContext
  ): Promise<void> {
    try {
      const errorMessage = this.extractErrorMessage(error)
      
      const details: any = {
        timestamp: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
        ...this.serializeValue(context)
      }

      // Add error object with proper serialization
      if (error) {
        details.errorObject = this.serializeError(error)
      }

      // Build the log message
      const logMessage = errorMessage 
        ? `${message}: ${errorMessage}`
        : message

      // Get current user ID and email
      // We need to check if user is actually authenticated, not just if we got an ID
      let userId: string | null = null
      let userEmail: string | null = null
      let isAuthenticated = false
      
      try {
        // Try getSession first (faster, uses cached session)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (!sessionError && session?.user) {
          isAuthenticated = true
          userId = session.user.id
          userEmail = session.user.email || null
        } else {
          // Fallback to getUser if session is not available
          const { data: { user }, error: userError } = await supabase.auth.getUser()
          
          if (!userError && user) {
            isAuthenticated = true
            userId = user.id
            userEmail = user.email || null
          }
        }
      } catch (error) {
        // If auth check fails, user is not authenticated
        console.debug('[Logger] Could not check authentication:', error)
      }
      
      // Add user info to details
      if (isAuthenticated && userId) {
        details.userId = userId
        if (userEmail) {
          details.userEmail = userEmail
        }
      }

      // Insert log with explicit user_id
      // Note: If userId is null, we don't set user_id and let the database default (auth.uid()) handle it
      // This ensures we capture the user even if our check fails
      const insertData: any = {
        level: 'ERROR',
        source: 'Logger',
        message: logMessage,
        details
      }
      
      // Set user_id if we have a valid authenticated user
      // Note: Even if it's a zero UUID (from seed file), we should use it if the user is authenticated
      // The database default auth.uid() will also return this, so being explicit is fine
      if (isAuthenticated && userId) {
        insertData.user_id = userId
      }
      // If not authenticated, don't set user_id - let database default handle it
      // This way if auth.uid() works in the DB context, we'll get the user ID
      
      const { error: insertError } = await supabase.from('system_logs').insert(insertData)
      
      // If insert fails due to user_id constraint, try without user_id
      if (insertError && insertError.message?.includes('user_id')) {
        console.warn('[Logger] Insert with user_id failed, retrying without:', insertError)
        delete insertData.user_id
        await supabase.from('system_logs').insert(insertData)
      }
    } catch (err) {
      // Silently fail to avoid infinite error loops
      console.error('[Logger] Failed to write to system_logs', err)
    }
  }

  /**
   * Log a debug message (only in development to reduce production overhead)
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      console.debug(`[DEBUG] ${message}`, context || '')
    }
  }

  /**
   * Log an info message (only in development to reduce production overhead)
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
   * Automatically logs to database (system_logs table)
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorObj = error instanceof Error ? error : error
    const errorMessage = errorObj instanceof Error ? errorObj.message : String(errorObj)
    
    console.error(`[ERROR] ${message}`, errorObj || '', context || '')
    
    // Always log errors to database
    this.logErrorToDatabase(message, error, context).catch(() => {
      // Silently fail - already logged to console
    })
    
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

