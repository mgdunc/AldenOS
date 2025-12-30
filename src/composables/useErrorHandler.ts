import { useToast } from 'primevue/usetoast'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

interface ErrorHandlerOptions {
  showToast?: boolean
  log?: boolean
  logToDatabase?: boolean
  rethrow?: boolean
}

/**
 * Global error handler composable
 * Provides consistent error handling across the application
 */
export function useErrorHandler() {
  const toast = useToast()

  const handleError = (
    error: any,
    context?: string,
    options: ErrorHandlerOptions = {}
  ) => {
    const {
      showToast = true,
      log = true,
      logToDatabase = true,
      rethrow = false
    } = options

    // Extract error message
    let message = 'An unexpected error occurred'
    if (error?.message) {
      message = error.message
    } else if (typeof error === 'string') {
      message = error
    }

    // Log using logger
    if (log) {
      logger.error(`Error${context ? ` in ${context}` : ''}`, error instanceof Error ? error : new Error(String(error)))
    }

    // Log to database
    if (logToDatabase) {
      logErrorToDatabase(context || 'Frontend Error', message, error).catch(err => {
        // Use logger here is safe - it only logs to console, not database
        logger.error('Failed to log error to database', err as Error)
      })
    }

    // Show toast notification
    if (showToast) {
      toast.add({
        severity: 'error',
        summary: context || 'Error',
        detail: message,
        life: 5000
      })
    }

    // Rethrow if needed
    if (rethrow) {
      throw error
    }

    return { error, message }
  }

  /**
   * Log error to system_logs table
   */
  const logErrorToDatabase = async (
    source: string,
    message: string,
    error: any
  ) => {
    try {
      const details: any = {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      }

      // Add error stack if available
      if (error?.stack) {
        details.stack = error.stack
      }

      // Add error object if it has additional properties
      if (error && typeof error === 'object') {
        details.errorObject = {
          ...error,
          message: error.message,
          name: error.name
        }
      }

      await supabase.from('system_logs').insert({
        level: 'ERROR',
        source,
        message,
        details
      })
    } catch (err) {
      // Silently fail to avoid infinite error loops
      logger.error('Failed to write to system_logs', err as Error)
    }
  }

  const handleAsyncError = async <T>(
    promise: Promise<T>,
    context?: string,
    options?: ErrorHandlerOptions
  ): Promise<{ data: T | null; error: any }> => {
    try {
      const data = await promise
      return { data, error: null }
    } catch (error) {
      handleError(error, context, options)
      return { data: null, error }
    }
  }

  const wrapAsync = <T extends (...args: any[]) => Promise<any>>(
    fn: T,
    context?: string,
    options?: ErrorHandlerOptions
  ): T => {
    return (async (...args: any[]) => {
      const { data, error } = await handleAsyncError(
        fn(...args),
        context,
        options
      )
      if (error && options?.rethrow) {
        throw error
      }
      return data
    }) as T
  }

  return {
    handleError,
    handleAsyncError,
    wrapAsync
  }
}
