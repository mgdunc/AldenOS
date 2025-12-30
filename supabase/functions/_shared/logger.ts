/**
 * Centralized logging utility for Edge Functions
 * Writes logs to both console and system_logs database table
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

interface LogContext {
  [key: string]: unknown
}

/**
 * Edge Function Logger
 * Writes to both console and system_logs table for centralized logging
 */
export class EdgeLogger {
  private supabaseUrl: string
  private supabaseKey: string
  private source: string

  constructor(source: string) {
    this.source = source
    // These are automatically available in Edge Functions
    this.supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    this.supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  }

  private async writeToDatabase(
    level: LogLevel,
    message: string,
    details?: LogContext
  ): Promise<void> {
    // Don't try to write if we don't have credentials
    if (!this.supabaseUrl || !this.supabaseKey) {
      console.warn('[EdgeLogger] Cannot write to database: missing credentials')
      return
    }

    try {
      const supabase = createClient(this.supabaseUrl, this.supabaseKey)
      
      const logEntry = {
        level,
        source: `EdgeFunction:${this.source}`,
        message,
        details: details ? {
          ...details,
          timestamp: new Date().toISOString(),
          functionName: this.source
        } : {
          timestamp: new Date().toISOString(),
          functionName: this.source
        }
      }

      const { error } = await supabase.from('system_logs').insert(logEntry)
      
      if (error) {
        // Log to console but don't throw - we don't want logging to break the function
        console.error('[EdgeLogger] Failed to write to system_logs:', error.message)
      }
    } catch (err) {
      // Silently fail to avoid breaking the function
      console.error('[EdgeLogger] Exception writing to system_logs:', err)
    }
  }

  /**
   * Log a debug message (console only in Edge Functions to reduce DB writes)
   */
  debug(message: string, context?: LogContext): void {
    console.log(`[DEBUG][${this.source}] ${message}`, context || '')
  }

  /**
   * Log an info message
   */
  info(message: string, context?: LogContext): void {
    console.log(`[INFO][${this.source}] ${message}`, context || '')
    // Only write INFO to DB if it seems important (has context)
    if (context) {
      this.writeToDatabase('INFO', message, context)
    }
  }

  /**
   * Log a warning message (always writes to DB)
   */
  warn(message: string, context?: LogContext): void {
    console.warn(`[WARN][${this.source}] ${message}`, context || '')
    this.writeToDatabase('WARN', message, context)
  }

  /**
   * Log an error message (always writes to DB)
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorDetails: LogContext = { ...context }
    
    if (error) {
      if (error instanceof Error) {
        errorDetails.errorName = error.name
        errorDetails.errorMessage = error.message
        errorDetails.errorStack = error.stack
      } else if (typeof error === 'object') {
        errorDetails.errorObject = error
      } else {
        errorDetails.error = String(error)
      }
    }

    console.error(`[ERROR][${this.source}] ${message}`, error || '', context || '')
    this.writeToDatabase('ERROR', message, errorDetails)
  }

  /**
   * Log sync progress (for tracking sync operations)
   */
  syncProgress(
    syncType: string,
    integrationId: string,
    status: 'started' | 'progress' | 'completed' | 'failed',
    details?: LogContext
  ): void {
    const message = `Sync ${status}: ${syncType}`
    const context: LogContext = {
      syncType,
      integrationId,
      status,
      ...details
    }

    if (status === 'failed') {
      this.error(message, undefined, context)
    } else if (status === 'completed') {
      this.info(message, context)
    } else {
      // started/progress - just console, not DB (too many writes)
      console.log(`[INFO][${this.source}] ${message}`, context)
    }
  }
}

/**
 * Create a logger instance for an Edge Function
 */
export function createLogger(functionName: string): EdgeLogger {
  return new EdgeLogger(functionName)
}

