// deno-lint-ignore-file no-explicit-any

/**
 * Unified Sync Helpers
 * Provides robust error handling, retry logic, and rate limiting for Shopify syncs
 */

export interface SyncError {
  type: 'retryable' | 'permanent' | 'rate_limit' | 'unknown'
  message: string
  originalError?: any
  retryAfter?: number // seconds
}

/**
 * Classify errors to determine if they should be retried
 */
export function classifyError(error: any): SyncError {
  const message = error?.message?.toLowerCase() || ''
  const status = error?.status || error?.response?.status || 0
  
  // Rate limiting
  if (status === 429 || message.includes('rate limit')) {
    const retryAfter = error?.response?.headers?.get('retry-after') || 
                      error?.headers?.['retry-after'] ||
                      60 // Default to 60 seconds
    return {
      type: 'rate_limit',
      message: 'Rate limit exceeded',
      originalError: error,
      retryAfter: parseInt(retryAfter.toString(), 10)
    }
  }
  
  // Permanent errors - don't retry
  if (
    status === 401 || 
    status === 403 ||
    message.includes('invalid api key') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('not found') ||
    message.includes('shop not found') ||
    message.includes('invalid shop')
  ) {
    return {
      type: 'permanent',
      message: error?.message || 'Permanent error occurred',
      originalError: error
    }
  }
  
  // Retryable errors
  if (
    status >= 500 ||
    status === 408 ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('temporary') ||
    message.includes('service unavailable')
  ) {
    return {
      type: 'retryable',
      message: error?.message || 'Temporary error occurred',
      originalError: error
    }
  }
  
  // Unknown - default to retryable but log for investigation
  return {
    type: 'unknown',
    message: error?.message || 'Unknown error occurred',
    originalError: error
  }
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoff(attempt: number, baseDelay = 1000): number {
  // Exponential backoff: baseDelay * 2^attempt, capped at 5 minutes
  const maxDelay = 5 * 60 * 1000
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.3 * delay
  return Math.floor(delay + jitter)
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: any
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      const classified = classifyError(error)
      
      // Don't retry permanent errors
      if (classified.type === 'permanent') {
        throw error
      }
      
      // Handle rate limiting
      if (classified.type === 'rate_limit' && classified.retryAfter) {
        if (attempt < maxRetries) {
          console.log(`[RETRY] Rate limited, waiting ${classified.retryAfter}s before retry ${attempt + 1}/${maxRetries}`)
          await new Promise(resolve => setTimeout(resolve, classified.retryAfter! * 1000))
          continue
        }
      }
      
      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) {
        throw error
      }
      
      // Calculate backoff delay
      const delay = calculateBackoff(attempt, baseDelay)
      console.log(`[RETRY] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError
}

/**
 * Update sync job with error information
 */
export async function updateJobError(
  supabase: any,
  jobId: string,
  error: SyncError,
  incrementErrorCount = true
) {
  const update: any = {
    error_message: error.message,
    error_type: error.type,
    updated_at: new Date().toISOString()
  }
  
  if (incrementErrorCount) {
    // Get current error count
    const { data: job } = await supabase
      .from('integration_sync_jobs')
      .select('error_count')
      .eq('id', jobId)
      .single()
    
    update.error_count = (job?.error_count || 0) + 1
  }
  
  // Mark as failed if permanent error
  if (error.type === 'permanent') {
    update.status = 'failed'
    update.completed_at = new Date().toISOString()
  }
  
  await supabase
    .from('integration_sync_jobs')
    .update(update)
    .eq('id', jobId)
}

/**
 * Update heartbeat for long-running syncs
 */
export async function updateHeartbeat(
  supabase: any,
  queueId: string | undefined
) {
  if (!queueId) return
  
  await supabase
    .from('sync_queue')
    .update({
      last_heartbeat: new Date().toISOString()
    })
    .eq('id', queueId)
}

/**
 * Log sync event
 */
export async function logSyncEvent(
  supabase: any,
  integrationId: string,
  message: string,
  level: 'info' | 'success' | 'warning' | 'error' = 'info',
  details: Record<string, any> = {}
) {
  await supabase.from('integration_logs').insert({
    integration_id: integrationId,
    level,
    event_type: 'sync',
    message,
    details
  })
}

/**
 * Check if sync should be cancelled
 */
export async function shouldCancelSync(
  supabase: any,
  jobId: string
): Promise<boolean> {
  const { data: job } = await supabase
    .from('integration_sync_jobs')
    .select('status')
    .eq('id', jobId)
    .single()
  
  return job?.status === 'cancelled'
}

