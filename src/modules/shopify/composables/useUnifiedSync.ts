import { ref, computed, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

export type SyncType = 'product_sync' | 'order_sync' | 'inventory_sync' | 'customer_sync'

export interface SyncJob {
  id: string
  integration_id: string
  job_type: SyncType
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  total_items?: number
  processed_items?: number
  matched_items?: number
  updated_items?: number
  error_count?: number
  error_message?: string
  started_at?: string
  completed_at?: string
  created_at: string
  metadata?: Record<string, any>
}

export interface SyncLog {
  id: string
  message: string
  level: 'info' | 'success' | 'warning' | 'error'
  timestamp: string
}

export interface SyncStats {
  total: number
  processed: number
  matched: number
  updated: number
  errors: number
  progress: number
  estimatedTimeRemaining?: string
}

/**
 * Unified Shopify Sync Composable
 * 
 * Features:
 * - Simple API: startSync(type), cancelSync()
 * - Robust error handling with automatic retries
 * - Real-time progress updates
 * - Expandable: Easy to add new sync types
 * - Better UI state management
 */
export function useUnifiedSync(integrationId: string) {
  const toast = useToast()
  
  // State
  const activeSyncs = ref<Map<SyncType, SyncJob>>(new Map())
  const syncHistory = ref<Map<SyncType, SyncJob[]>>(new Map())
  const syncLogs = ref<Map<SyncType, SyncLog[]>>(new Map())
  const loading = ref<Map<SyncType, boolean>>(new Map())
  
  // Channels - store as any to avoid type issues with Supabase channel
  const channels = ref<Map<SyncType, any>>(new Map())
  
  // Computed
  const isSyncing = computed(() => {
    return Array.from(activeSyncs.value.values()).some(
      job => job.status === 'running' || job.status === 'pending'
    )
  })
  
  const getSyncStats = (type: SyncType): SyncStats => {
    const job = activeSyncs.value.get(type)
    if (!job) {
      return {
        total: 0,
        processed: 0,
        matched: 0,
        updated: 0,
        errors: 0,
        progress: 0
      }
    }
    
    const total = job.total_items || 0
    const processed = job.processed_items || 0
    const progress = total > 0 ? Math.round((processed / total) * 100) : 0
    
    // Calculate estimated time remaining
    let estimatedTimeRemaining: string | undefined
    if (job.started_at && processed > 0 && total > processed) {
      const startTime = new Date(job.started_at).getTime()
      const now = Date.now()
      const elapsed = now - startTime
      const rate = processed / elapsed // items per ms
      const remaining = (total - processed) / rate
      const remainingSec = Math.ceil(remaining / 1000)
      
      if (remainingSec < 60) {
        estimatedTimeRemaining = `${remainingSec}s`
      } else {
        estimatedTimeRemaining = `${Math.ceil(remainingSec / 60)}m`
      }
    }
    
    return {
      total,
      processed,
      matched: job.matched_items || 0,
      updated: job.updated_items || 0,
      errors: job.error_count || 0,
      progress,
      estimatedTimeRemaining
    }
  }
  
  const canCancel = (type: SyncType): boolean => {
    const job = activeSyncs.value.get(type)
    return job?.status === 'running' || job?.status === 'pending' || false
  }
  
  // Helper to get function name for sync type
  const getFunctionName = (type: SyncType): string => {
    const functionMap: Record<SyncType, string> = {
      product_sync: 'shopify-product-sync',
      order_sync: 'shopify-order-sync',
      inventory_sync: 'shopify-inventory-sync', // Not yet implemented
      customer_sync: 'shopify-customer-sync' // Not yet implemented
    }
    const functionName = functionMap[type] || 'shopify-product-sync'
    
    // Warn if trying to use a function that doesn't exist yet
    if ((type === 'inventory_sync' || type === 'customer_sync') && import.meta.env.DEV) {
      logger.warn(`Sync type '${type}' is not yet implemented. Function '${functionName}' may not exist.`)
    }
    
    return functionName
  }
  
  // Setup realtime subscriptions
  const setupRealtime = (type: SyncType) => {
    if (channels.value.has(type)) return
    
    const channel = supabase
      .channel(`sync-${integrationId}-${type}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'integration_sync_jobs',
          filter: `integration_id=eq.${integrationId}`
        },
        (payload) => {
          const job = payload.new as SyncJob
          
          // Only handle jobs of the correct type
          if (job.job_type !== type) return
          
          // Update active sync
          if (job.status === 'running' || job.status === 'pending') {
            activeSyncs.value.set(type, job)
          } else {
            activeSyncs.value.delete(type)
          }
          
          // Update history
          const history = syncHistory.value.get(type) || []
          const index = history.findIndex(h => h.id === job.id)
          if (index !== -1) {
            history[index] = job
          } else {
            history.unshift(job)
            // Keep only last 20
            if (history.length > 20) {
              history.pop()
            }
          }
          syncHistory.value.set(type, history)
          
          // Handle completion
          if (job.status === 'completed') {
            toast.add({
              severity: 'success',
              summary: 'Sync Complete',
              detail: `${type.replace('_', ' ')} completed: ${job.processed_items} items processed`
            })
          } else if (job.status === 'failed') {
            toast.add({
              severity: 'error',
              summary: 'Sync Failed',
              detail: job.error_message || 'An error occurred during sync'
            })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'integration_logs',
          filter: `integration_id=eq.${integrationId}`
        },
        (payload) => {
          const log = payload.new as any
          if (log.details?.job_type === type || log.event_type === type) {
            const logs = syncLogs.value.get(type) || []
            logs.push({
              id: log.id,
              message: log.message,
              level: log.level || 'info',
              timestamp: log.created_at
            })
            // Keep only last 100 logs
            if (logs.length > 100) {
              logs.shift()
            }
            syncLogs.value.set(type, logs)
          }
        }
      )
      .subscribe()
    
    channels.value.set(type, channel)
  }
  
  // Fetch sync history
  const fetchHistory = async (type: SyncType) => {
    loading.value.set(type, true)
    
    try {
      const { data, error } = await supabase
        .from('integration_sync_jobs')
        .select('*')
        .eq('integration_id', integrationId)
        .eq('job_type', type)
        .order('created_at', { ascending: false })
        .limit(20)
      
      if (error) throw error
      
      syncHistory.value.set(type, (data || []) as SyncJob[])
      
      // Check for active syncs
      const activeJob = data?.find(
        job => job.status === 'running' || job.status === 'pending'
      )
      
      if (activeJob) {
        activeSyncs.value.set(type, activeJob as SyncJob)
      }
    } catch (error: any) {
      logger.error(`Error fetching ${type} history`, error)
    } finally {
      loading.value.set(type, false)
    }
  }
  
  // Start sync
  const startSync = async (type: SyncType, options?: { force?: boolean }) => {
    // Check if already syncing
    if (!options?.force && canCancel(type)) {
      toast.add({
        severity: 'warn',
        summary: 'Sync Already Running',
        detail: `A ${type.replace('_', ' ')} is already in progress`
      })
      return
    }
    
    // Check for existing queue entry
    const { data: existingQueue } = await supabase
      .from('sync_queue')
      .select('id, status')
      .eq('integration_id', integrationId)
      .eq('sync_type', type)
      .in('status', ['pending', 'processing'])
      .maybeSingle()
    
    if (existingQueue && !options?.force) {
      toast.add({
        severity: 'warn',
        summary: 'Sync Queued',
        detail: 'A sync is already queued for processing'
      })
      return
    }
    
    // Create queue entry
    const { data: queueEntry, error: queueError } = await supabase
      .from('sync_queue')
      .insert({
        integration_id: integrationId,
        sync_type: type,
        status: 'pending',
        priority: 3
      })
      .select()
      .single()
    
    if (queueError) {
      logger.error('Failed to create queue entry', queueError)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to queue sync operation'
      })
      return
    }
    
    // Clear logs for this sync type
    syncLogs.value.set(type, [])
    
    // Invoke Edge Function
    const functionName = getFunctionName(type)
    
    try {
      // Invoke Edge Function with retry logic for network errors
      let response
      let lastError: any = null
      const maxRetries = 2
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          response = await supabase.functions.invoke(functionName, {
            body: {
              integrationId,
              queueId: queueEntry.id
            }
          })
          lastError = null
          break // Success, exit retry loop
        } catch (retryError: any) {
          lastError = retryError
          const isNetworkError = 
            retryError?.name === 'FunctionsFetchError' ||
            retryError?.message?.toLowerCase().includes('failed to send') ||
            retryError?.message?.toLowerCase().includes('network') ||
            retryError?.message?.toLowerCase().includes('fetch failed')
          
          // Only retry on network errors, not on application errors
          if (isNetworkError && attempt < maxRetries) {
            logger.warn(`Network error on attempt ${attempt + 1}/${maxRetries + 1}, retrying...`, {
              functionName,
              attempt: attempt + 1,
              error: retryError.message
            })
            // Wait before retry (exponential backoff: 1s, 2s)
            await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000))
            continue
          } else {
            // Not a network error or max retries reached, throw
            throw retryError
          }
        }
      }
      
      // If we still have an error after retries, throw it
      if (lastError) {
        throw lastError
      }
      
      const { data, error } = response
      
      // IMPORTANT: Check data FIRST, even if error exists
      // Supabase may parse the response body into data even on non-2xx status codes
      // This allows us to read error messages from the Edge Function response body
      
      // Check if data contains an error (Edge Function returned error in response body)
      if (data?.error) {
        throw new Error(data.error)
      }
      
      // Check if data.success is false (Edge Functions return { success: false, error: "..." })
      if (data?.success === false) {
        const errorMsg = data.error || data.message || 'Sync failed'
        throw new Error(errorMsg)
      }
      
      // If we have data and it's successful, we're done
      if (data?.success === true) {
        toast.add({
          severity: 'info',
          summary: 'Sync Started',
          detail: `${type.replace('_', ' ')} has been queued and will start shortly`
        })
        
        await fetchHistory(type)
        return
      }
      
      if (error) {
        // Check for network/connectivity errors (FunctionsFetchError)
        const errorName = error.name || ''
        const errorMsg = error.message?.toLowerCase() || ''
        const errorStatus = error.status
        
        if (
          errorName === 'FunctionsFetchError' ||
          errorMsg.includes('failed to send a request') ||
          errorMsg.includes('fetch failed') ||
          errorMsg.includes('network error') ||
          errorMsg.includes('connection') ||
          errorMsg.includes('timeout')
        ) {
          const detailedError = new Error(
            `Network error: Unable to reach Edge Function '${functionName}'. ` +
            `This may be due to network connectivity issues, CORS problems, or the function endpoint being unreachable. ` +
            `Please check your internet connection and try again.`
          )
          ;(detailedError as any).originalError = error
          ;(detailedError as any).functionName = functionName
          ;(detailedError as any).status = errorStatus
          ;(detailedError as any).errorType = 'network'
          
          logger.error(`Network error calling Edge Function '${functionName}'`, detailedError, {
            integrationId,
            syncType: type,
            functionName,
            queueId: queueEntry.id,
            errorName: error.name,
            errorMessage: error.message,
            suggestion: 'Check network connectivity, CORS settings, and Supabase project configuration. The function may be temporarily unavailable.',
            troubleshooting: [
              'Verify internet connection',
              'Check if Supabase project is accessible',
              'Verify Edge Function is deployed',
              'Check browser console for CORS errors',
              'Try refreshing the page and retrying'
            ]
          })
          
          toast.add({
            severity: 'error',
            summary: 'Network Error',
            detail: `Unable to reach sync function. Please check your connection and try again.`,
            life: 5000
          })
          
          throw detailedError
        }
        
        // Check if function doesn't exist (404 or specific error messages)
        if (
          errorStatus === 404 || 
          errorMsg.includes('not found') || 
          errorMsg.includes('function not found') ||
          errorMsg.includes('does not exist')
        ) {
          const detailedError = new Error(
            `Edge Function '${functionName}' does not exist or is not deployed. ` +
            `Please deploy it using: supabase functions deploy ${functionName}`
          )
          ;(detailedError as any).originalError = error
          ;(detailedError as any).functionName = functionName
          ;(detailedError as any).status = errorStatus
          
          logger.error(`Edge Function '${functionName}' not found`, detailedError, {
            integrationId,
            syncType: type,
            functionName,
            queueId: queueEntry.id,
            suggestion: `Run: supabase functions deploy ${functionName}`
          })
          
          toast.add({
            severity: 'error',
            summary: 'Function Not Found',
            detail: `The sync function '${functionName}' is not deployed. Please contact support.`,
            life: 5000
          })
          
          throw detailedError
        }
        
        // Try to extract the actual error message from the Edge Function response
        let errorMessage = error.message || 'Unknown error'
        let errorBody: any = null
        
        // Log the full error structure for debugging
        logger.debug('Edge Function error structure', {
          errorName: error.name,
          errorMessage: error.message,
          errorStatus: error.status,
          errorKeys: Object.keys(error),
          hasData: !!(error as any).data,
          hasContext: !!error.context,
          contextKeys: error.context ? Object.keys(error.context) : []
        })
        
        // Supabase FunctionsHttpError structure varies by version
        // Try multiple approaches to get the response body
        
        // Approach 1: Check error.data (some Supabase versions expose it here)
        if ((error as any).data) {
          errorBody = (error as any).data
          if (errorBody?.error) {
            errorMessage = errorBody.error
          } else if (errorBody?.message) {
            errorMessage = errorBody.message
          } else if (typeof errorBody === 'string') {
            try {
              const parsed = JSON.parse(errorBody)
              if (parsed?.error) errorMessage = parsed.error
              else if (parsed?.message) errorMessage = parsed.message
            } catch {
              errorMessage = errorBody
            }
          }
        }
        
        // Approach 2: Check error.context.response (raw Response object)
        if (!errorBody && error.context) {
          try {
            const context = error.context as any
            
            // Check if response body is available in context
            if (context.response) {
              // Try to clone and read the response
              try {
                const clonedResponse = context.response.clone()
                const text = await clonedResponse.text().catch(() => null)
                if (text) {
                  try {
                    errorBody = JSON.parse(text)
                    if (errorBody?.error) {
                      errorMessage = errorBody.error
                    } else if (errorBody?.message) {
                      errorMessage = errorBody.message
                    } else if (errorBody?.success === false && errorBody?.error) {
                      errorMessage = errorBody.error
                    }
                  } catch {
                    // If not JSON, use text as error message
                    if (text.length < 200) {
                      errorMessage = text
                    }
                  }
                }
              } catch (e) {
                // Response may already be consumed
                logger.debug('Could not read error response body from context.response', { error: e })
              }
            }
            
            // Approach 3: Check context.data (parsed response)
            if (!errorBody && context.data) {
              errorBody = context.data
              if (errorBody?.error) {
                errorMessage = errorBody.error
              } else if (errorBody?.message) {
                errorMessage = errorBody.message
              } else if (errorBody?.success === false && errorBody?.error) {
                errorMessage = errorBody.error
              }
            }
            
            // Approach 4: Check context.body (some versions)
            if (!errorBody && context.body) {
              try {
                errorBody = typeof context.body === 'string' ? JSON.parse(context.body) : context.body
                if (errorBody?.error) {
                  errorMessage = errorBody.error
                } else if (errorBody?.message) {
                  errorMessage = errorBody.message
                }
              } catch (e) {
                logger.debug('Could not parse context.body', { error: e })
              }
            }
          } catch (e) {
            logger.debug('Could not parse error context', { error: e })
          }
        }
        
        // Build a more informative error message
        if (errorStatus) {
          errorMessage = `HTTP ${errorStatus}: ${errorMessage}`
        }
        
        // Create a more detailed error with all available info
        const detailedError = new Error(errorMessage)
        ;(detailedError as any).originalError = error
        ;(detailedError as any).status = errorStatus
        ;(detailedError as any).responseBody = errorBody
        ;(detailedError as any).errorStructure = {
          name: error.name,
          message: error.message,
          status: error.status,
          hasData: !!(error as any).data,
          hasContext: !!error.context,
          contextType: error.context ? typeof error.context : null
        }
        throw detailedError
      }
      
      toast.add({
        severity: 'info',
        summary: 'Sync Started',
        detail: `${type.replace('_', ' ')} has been queued and will start shortly`
      })
      
      // Fetch history to get the job
      await fetchHistory(type)
    } catch (error: any) {
      // Extract the most useful error message
      let errorMessage = error.message || 'Failed to start sync'
      
      // Include response body if available
      const errorContext = {
        integrationId,
        syncType: type,
        functionName,
        queueId: queueEntry.id,
        errorMessage,
        status: error.status || error.originalError?.status,
        responseBody: error.responseBody || error.originalError?.responseBody
      } as Record<string, unknown>
      
      logger.error(`Error starting ${type}`, error as Error, errorContext)
      
      toast.add({
        severity: 'error',
        summary: 'Sync Failed',
        detail: errorMessage
      })
    }
  }
  
  // Cancel sync
  const cancelSync = async (type: SyncType) => {
    const job = activeSyncs.value.get(type)
    if (!job) return
    
    try {
      const { error } = await supabase
        .from('integration_sync_jobs')
        .update({ status: 'cancelled' })
        .eq('id', job.id)
      
      if (error) throw error
      
      toast.add({
        severity: 'info',
        summary: 'Cancelling...',
        detail: 'The sync will stop shortly'
      })
    } catch (error: any) {
      logger.error(`Error cancelling ${type}`, error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to cancel sync'
      })
    }
  }
  
  // Clear logs
  const clearLogs = (type: SyncType) => {
    syncLogs.value.set(type, [])
  }
  
  // Initialize all sync types
  const initialize = async () => {
    const syncTypes: SyncType[] = ['product_sync', 'order_sync']
    
    for (const type of syncTypes) {
      setupRealtime(type)
      await fetchHistory(type)
    }
  }
  
  // Cleanup
  const cleanup = () => {
    channels.value.forEach(channel => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    })
    channels.value.clear()
  }
  
  // Auto-initialize
  onMounted(() => {
    initialize()
  })
  
  onUnmounted(() => {
    cleanup()
  })
  
  return {
    // State
    activeSyncs: computed(() => activeSyncs.value),
    syncHistory: computed(() => syncHistory.value),
    syncLogs: computed(() => syncLogs.value),
    loading: computed(() => loading.value),
    isSyncing,
    
    // Methods
    startSync,
    cancelSync,
    clearLogs,
    fetchHistory,
    getSyncStats,
    canCancel,
    initialize,
    cleanup
  }
}

