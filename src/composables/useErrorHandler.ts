import { useToast } from 'primevue/usetoast'

interface ErrorHandlerOptions {
  showToast?: boolean
  log?: boolean
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
      rethrow = false
    } = options

    // Extract error message
    let message = 'An unexpected error occurred'
    if (error?.message) {
      message = error.message
    } else if (typeof error === 'string') {
      message = error
    }

    // Log to console
    if (log) {
      console.error(`[Error${context ? ` in ${context}` : ''}]:`, error)
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
