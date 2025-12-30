/**
 * Centralized logging utility for Edge Functions
 * Writes logs to both console and sync_logs database table
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: unknown
}

interface SyncContext {
  integrationId?: string
  queueId?: string
  jobId?: string
}

/**
 * Edge Function Logger
 * Writes to both console and sync_logs table for detailed sync tracking
 */
export class EdgeLogger {
  private supabaseUrl: string
  private supabaseKey: string
  private source: string
  private syncContext: SyncContext = {}
  private logBuffer: Array<{level: LogLevel, message: string, details?: LogContext}> = []
  private flushPromise: Promise<void> | null = null

  constructor(source: string) {
    this.source = source
    // These are automatically available in Edge Functions
    this.supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    this.supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  }

  /**
   * Set sync context - enables database logging for all levels
   */
  setContext(context: SyncContext): void {
    this.syncContext = { ...this.syncContext, ...context }
  }

  /**
   * Clear the sync context
   */
  clearContext(): void {
    this.syncContext = {}
  }

  /**
   * Write a single log entry to sync_logs table
   */
  private async writeToSyncLogs(
    level: LogLevel,
    message: string,
    details?: LogContext
  ): Promise<void> {
    // Only write if we have sync context (queueId or integrationId)
    if (!this.syncContext.queueId && !this.syncContext.integrationId) {
      return
    }

    // Don't try to write if we don't have credentials
    if (!this.supabaseUrl || !this.supabaseKey) {
      return
    }

    try {
      const supabase = createClient(this.supabaseUrl, this.supabaseKey)
      
      const logEntry = {
        queue_id: this.syncContext.queueId || null,
        integration_id: this.syncContext.integrationId || null,
        function_name: this.source,
        level,
        message,
        details: details || null
      }

      await supabase.from('sync_logs').insert(logEntry)
    } catch (err) {
      // Silently fail to avoid breaking the function
      console.error('[EdgeLogger] Exception writing to sync_logs:', err)
    }
  }

  /**
   * Log a debug message - writes to DB when sync context is set
   */
  async debug(message: string, context?: LogContext): Promise<void> {
    console.log(`[DEBUG][${this.source}] ${message}`, context || '')
    // Write debug logs to DB when we have sync context
    if (this.syncContext.queueId || this.syncContext.integrationId) {
      await this.writeToSyncLogs('debug', message, context)
    }
  }

  /**
   * Log an info message
   */
  async info(message: string, context?: LogContext): Promise<void> {
    console.log(`[INFO][${this.source}] ${message}`, context || '')
    await this.writeToSyncLogs('info', message, context)
  }

  /**
   * Log a warning message
   */
  async warn(message: string, context?: LogContext): Promise<void> {
    console.warn(`[WARN][${this.source}] ${message}`, context || '')
    await this.writeToSyncLogs('warn', message, context)
  }

  /**
   * Log an error message
   */
  async error(message: string, error?: Error | unknown, context?: LogContext): Promise<void> {
    const errorContext: LogContext = { ...context }
    
    if (error) {
      if (error instanceof Error) {
        errorContext.errorName = error.name
        errorContext.errorMessage = error.message
        errorContext.errorStack = error.stack
      } else if (typeof error === 'object') {
        errorContext.errorObject = error
      } else {
        errorContext.error = String(error)
      }
    }

    console.error(`[ERROR][${this.source}] ${message}`, error || '', errorContext)
    await this.writeToSyncLogs('error', message, errorContext)
  }
}

/**
 * Create a logger instance for an Edge Function
 */
export function createLogger(functionName: string): EdgeLogger {
  return new EdgeLogger(functionName)
}

