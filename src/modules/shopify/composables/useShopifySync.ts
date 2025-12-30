import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ShopifySyncJob, ShopifyIntegrationLog } from '../types'
import { logger } from '@/lib/logger'

export function useShopifySync(integrationId: string, jobType: 'product_sync' | 'order_sync') {
  const toast = useToast()
  const syncing = ref(false)
  const currentJob = ref<ShopifySyncJob | null>(null)
  const history = ref<ShopifySyncJob[]>([])
  const liveLogs = ref<string[]>([])
  const loadingHistory = ref(false)

  // Debug: trace syncing state changes
  watch(syncing, (newVal, oldVal) => {
    logger.debug(`[useShopifySync:${jobType}] syncing changed: ${oldVal} -> ${newVal}`)
  })

  let logChannel: RealtimeChannel | null = null
  let jobChannel: RealtimeChannel | null = null

  const progressPercentage = computed(() => {
    if (!currentJob.value || !currentJob.value.total_items) return 0
    const processed = currentJob.value.processed_items || 0
    return Math.round((processed / currentJob.value.total_items) * 100)
  })

  const isRunning = computed(() => 
    currentJob.value?.status === 'running' || currentJob.value?.status === 'pending'
  )

  const canCancel = computed(() => isRunning.value)

  const subscribeToLogs = () => {
    if (logChannel) return

    logChannel = supabase
      .channel(`integration-logs-${integrationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'integration_logs',
          filter: `integration_id=eq.${integrationId}`
        },
        (payload) => {
          const log = payload.new as ShopifyIntegrationLog
          const timestamp = new Date(log.created_at).toLocaleTimeString()
          liveLogs.value.push(`[${timestamp}] ${log.message}`)
          
          // Keep only last 50 logs in memory
          if (liveLogs.value.length > 50) {
            liveLogs.value = liveLogs.value.slice(-50)
          }
        }
      )
      .subscribe()
  }

  const subscribeToJobs = () => {
    if (jobChannel) return

    jobChannel = supabase
      .channel(`sync-jobs-${integrationId}-${jobType}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'integration_sync_jobs',
          filter: `integration_id=eq.${integrationId}`
        },
        (payload) => {
          const job = payload.new as ShopifySyncJob
          
          // Only handle jobs of the correct type
          if (job.job_type !== jobType) return

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            currentJob.value = job

            // Update history if job exists there
            const historyIndex = history.value.findIndex(h => h.id === job.id)
            if (historyIndex !== -1) {
              history.value[historyIndex] = job
            } else if (payload.eventType === 'INSERT') {
              history.value.unshift(job)
            }

            // Show completion notification
            if (job.status === 'completed') {
              syncing.value = false
              toast.add({
                severity: 'success',
                summary: 'Sync Complete',
                detail: `Processed ${job.processed_items} items`
              })
            } else if (job.status === 'failed') {
              syncing.value = false
              toast.add({
                severity: 'error',
                summary: 'Sync Failed',
                detail: job.error_message || 'An error occurred during sync'
              })
            } else if (job.status === 'cancelled') {
              syncing.value = false
              toast.add({
                severity: 'warn',
                summary: 'Sync Cancelled',
                detail: 'The sync operation was cancelled'
              })
            }
          }
        }
      )
      .subscribe()
  }

  const fetchHistory = async () => {
    loadingHistory.value = true

    try {
      const { data, error } = await supabase
        .from('integration_sync_jobs')
        .select('*')
        .eq('integration_id', integrationId)
        .eq('job_type', jobType)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error

      logger.debug(`[useShopifySync:${jobType}] fetchHistory returned: ${data?.length} jobs`)
      
      history.value = (data || []) as ShopifySyncJob[]

      // Set current job if one is running
      // But check if it's stale (older than 30 minutes = likely dead)
      const STALE_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes
      const now = Date.now()
      
      const runningJob = history.value.find(j => {
        if (j.status !== 'running' && j.status !== 'pending') return false
        
        // Check if the job is stale
        const jobTime = new Date(j.created_at).getTime()
        const ageMs = now - jobTime
        
        if (ageMs > STALE_THRESHOLD_MS) {
          logger.debug(`[useShopifySync:${jobType}] Found stale job ${j.id}, age: ${Math.round(ageMs / 60000)} minutes - ignoring`)
          // Optionally mark it as failed
          supabase.from('integration_sync_jobs').update({
            status: 'failed',
            error_message: 'Job timed out - no activity for 30+ minutes'
          }).eq('id', j.id).then(() => {
            logger.debug(`[useShopifySync:${jobType}] Marked stale job ${j.id} as failed`)
          })
          return false
        }
        
        return true
      })
      
      logger.debug(`[useShopifySync:${jobType}] runningJob:`, { runningJob })
      
      if (runningJob) {
        logger.debug(`[useShopifySync:${jobType}] Found running job, setting syncing=true`)
        currentJob.value = runningJob
        syncing.value = true
      } else {
        logger.debug(`[useShopifySync:${jobType}] No running job found, syncing stays false`)
      }
    } catch (error: any) {
      logger.error('Error fetching history', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load sync history'
      })
    } finally {
      loadingHistory.value = false
    }
  }

  const startSync = async () => {
    logger.debug(`[useShopifySync] startSync called for ${jobType}, integrationId: ${integrationId}`)
    logger.debug(`[useShopifySync] syncing.value:`, { syncing: syncing.value })
    
    if (syncing.value) {
      logger.debug(`[useShopifySync] Already syncing, returning early`)
      return
    }

    syncing.value = true
    logger.debug(`[useShopifySync] Set syncing = true`)
    liveLogs.value = []
    liveLogs.value.push(`[${new Date().toLocaleTimeString()}] Starting ${jobType} for integration ${integrationId}...`)

    try {
      // Check if there's already a pending/processing sync for this integration
      logger.debug(`[useShopifySync] Checking for existing queue entry...`)
      const { data: existingQueue, error: checkError } = await supabase
        .from('sync_queue')
        .select('id, status')
        .eq('integration_id', integrationId)
        .eq('sync_type', jobType)
        .in('status', ['pending', 'processing'])
        .maybeSingle()

      logger.debug(`[useShopifySync] existingQueue:`, { existingQueue, checkError })

      if (checkError) {
        throw new Error(`Failed to check queue: ${checkError.message}`)
      }

      if (existingQueue) {
        syncing.value = false
        toast.add({
          severity: 'warn',
          summary: 'Sync Already Running',
          detail: 'A sync for this store is already in progress'
        })
        return
      }

      // Create a queue entry
      liveLogs.value.push(`[${new Date().toLocaleTimeString()}] Adding sync to queue...`)
      
      const { data: queueEntry, error: queueError } = await supabase
        .from('sync_queue')
        .insert({
          integration_id: integrationId,
          sync_type: jobType,
          status: 'pending',
          priority: 3
        })
        .select()
        .single()

      if (queueError) {
        throw new Error(`Failed to create queue entry: ${queueError.message}`)
      }

      liveLogs.value.push(`[${new Date().toLocaleTimeString()}] Queue entry created. Processing sync...`)

      // Determine the Edge Function to call
      const functionName = jobType === 'product_sync' 
        ? 'shopify-product-sync' 
        : 'shopify-order-sync'

      let nextPageInfo: string | undefined = undefined
      let currentJobId: string | undefined = undefined
      let pageCount = 1
      let hasMore = true

      while (hasMore && syncing.value) {
        liveLogs.value.push(`[${new Date().toLocaleTimeString()}] Syncing page ${pageCount}...`)

        type SyncResponse = {
          success: boolean
          nextPageInfo?: string
          jobId?: string
          message?: string
          error?: string
        }

        const response: {
          data: SyncResponse | null
          error: Error | null
        } = await supabase.functions.invoke<SyncResponse>(functionName, {
          body: { 
            integrationId: integrationId,
            page_info: nextPageInfo,
            jobId: currentJobId,
            queueId: queueEntry.id
          }
        })

        const { data, error } = response

        if (error) {
          throw error
        }

        if (!data) {
          throw new Error('No data returned from sync function')
        }

        if (data.error) {
          throw new Error(data.error)
        }

        // Update state for next iteration
        nextPageInfo = data.nextPageInfo
        currentJobId = data.jobId
        
        liveLogs.value.push(`[${new Date().toLocaleTimeString()}] Page ${pageCount} complete. ${data.message || ''}`)
        
        if (!nextPageInfo) {
          hasMore = false
          liveLogs.value.push(`[${new Date().toLocaleTimeString()}] All pages synced successfully.`)
        } else {
          pageCount++
          // Add 500ms delay between pages to respect Shopify rate limits
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      if (!syncing.value) {
         liveLogs.value.push(`[${new Date().toLocaleTimeString()}] Sync cancelled by user.`)
      } else {
        // Sync loop completed - reset syncing state
        // The realtime subscription should also set this, but we set it here as a failsafe
        syncing.value = false
        liveLogs.value.push(`[${new Date().toLocaleTimeString()}] Sync completed successfully.`)
      }

      // Update sync_queue status to completed
      if (queueEntry?.id) {
        await supabase.from('sync_queue').update({
          status: 'completed',
          completed_at: new Date().toISOString()
        }).eq('id', queueEntry.id)
      }

    } catch (error: any) {
      logger.error('Sync error', error)
      liveLogs.value.push(`[${new Date().toLocaleTimeString()}] FATAL ERROR: ${error.message || error}`)
      syncing.value = false
      toast.add({
        severity: 'error',
        summary: 'Sync Failed',
        detail: error.message || 'Failed to start sync'
      })
    }
    // Note: We set syncing = false in both success and error cases now
    // to ensure the button state is always properly reset.
  }

  const cancelSync = async () => {
    if (!currentJob.value) return

    try {
      const { error } = await supabase
        .from('integration_sync_jobs')
        .update({ status: 'cancelled' })
        .eq('id', currentJob.value.id)

      if (error) throw error

      toast.add({
        severity: 'info',
        summary: 'Cancelling...',
        detail: 'The sync will stop shortly'
      })
    } catch (error: any) {
      logger.error('Cancel error', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to cancel sync'
      })
    }
  }

  const clearLogs = () => {
    liveLogs.value = []
  }

  const cleanup = () => {
    if (logChannel) {
      supabase.removeChannel(logChannel)
      logChannel = null
    }
    if (jobChannel) {
      supabase.removeChannel(jobChannel)
      jobChannel = null
    }
    initialized = false
  }

  // Initialize subscriptions and fetch history
  // Can be called manually if composable is created outside setup context
  let initialized = false
  const init = () => {
    if (initialized) {
      logger.debug(`[useShopifySync] init() already called for ${jobType}, skipping`)
      return
    }
    initialized = true
    logger.debug(`[useShopifySync] init() for ${jobType}`)
    subscribeToLogs()
    subscribeToJobs()
    fetchHistory()
  }

  // Auto-init if we're inside a component's setup context
  // getCurrentInstance check ensures we only auto-init when onMounted will fire
  onMounted(() => {
    init()
  })

  onUnmounted(() => {
    cleanup()
  })

  return {
    syncing,
    currentJob,
    history,
    liveLogs,
    loadingHistory,
    progressPercentage,
    isRunning,
    canCancel,
    startSync,
    cancelSync,
    fetchHistory,
    clearLogs,
    cleanup,
    init
  }
}
