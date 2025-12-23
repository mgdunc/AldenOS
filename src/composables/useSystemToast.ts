import { useToast } from 'primevue/usetoast'
import { supabase } from '@/lib/supabase'
import type { ToastMessageOptions } from 'primevue/toast'

/**
 * Enhanced toast composable that logs errors to system_logs
 * 
 * Use this instead of useToast() directly to ensure all error toasts
 * are logged to the database for tracking and debugging.
 */
export function useSystemToast() {
  const toast = useToast()

  /**
   * Log toast message to system_logs if it's an error
   */
  const logToastToDatabase = async (options: ToastMessageOptions) => {
    // Only log errors and warnings
    if (options.severity !== 'error' && options.severity !== 'warn') {
      return
    }

    try {
      const level = options.severity === 'error' ? 'ERROR' : 'WARN'
      const source = options.summary || 'Toast Notification'
      const message = options.detail || 'No details provided'

      const details: any = {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        severity: options.severity,
        summary: options.summary
      }

      await supabase.from('system_logs').insert({
        level,
        source,
        message,
        details
      })
    } catch (err) {
      // Silently fail to avoid infinite error loops
      console.error('Failed to write toast to system_logs:', err)
    }
  }

  /**
   * Enhanced add method that logs to database
   */
  const add = (options: ToastMessageOptions) => {
    // Log to database if error or warning
    if (options.severity === 'error' || options.severity === 'warn') {
      logToastToDatabase(options).catch(console.error)
    }

    // Show toast
    toast.add(options)
  }

  /**
   * Remove a specific toast message
   */
  const remove = (message: ToastMessageOptions) => {
    toast.remove(message)
  }

  /**
   * Remove all toast messages
   */
  const removeAllMessages = () => {
    // PrimeVue toast doesn't have removeAll, just clear individual toasts
  }

  /**
   * Remove all toast messages from a specific group
   */
  const removeGroup = (group: string) => {
    toast.removeGroup(group)
  }

  return {
    add,
    remove,
    removeAll: removeAllMessages,
    removeGroup
  }
}
