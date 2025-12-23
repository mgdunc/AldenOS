import { ref, computed, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ShopifySyncJob, ShopifyIntegrationLog } from '../types'

export function useShopifySync(integrationId: string, jobType: 'product_sync' | 'order_sync') {
  const toast = useToast()
  const syncing = ref(false)
  const currentJob = ref<ShopifySyncJob | null>(null)
  const history = ref<ShopifySyncJob[]>([])
  const liveLogs = ref<string[]>([])
  const loadingHistory = ref(false)

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

      history.value = (data || []) as ShopifySyncJob[]

      // Set current job if one is running
      const runningJob = history.value.find(
        j => j.status === 'running' || j.status === 'pending'
      )
      if (runningJob) {
        currentJob.value = runningJob
        syncing.value = true
      }
    } catch (error: any) {
      console.error('Error fetching history:', error)
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
    if (syncing.value) return

    syncing.value = true
    liveLogs.value = []
    liveLogs.value.push(`[${new Date().toLocaleTimeString()}] Starting ${jobType} for integration ${integrationId}...`)

    try {
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

        const response = await supabase.functions.invoke<{
          success: boolean
          nextPageInfo?: string
          jobId?: string
          message?: string
          error?: string
        }>(functionName, {
          body: { 
            integrationId: integrationId,
            page_info: nextPageInfo,
            jobId: currentJobId
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
        }
      }

      if (!syncing.value) {
         liveLogs.value.push(`[${new Date().toLocaleTimeString()}] Sync cancelled by user.`)
      }

    } catch (error: any) {
      console.error('Sync error:', error)
      liveLogs.value.push(`[${new Date().toLocaleTimeString()}] FATAL ERROR: ${error.message || error}`)
      syncing.value = false
      toast.add({
        severity: 'error',
        summary: 'Sync Failed',
        detail: error.message || 'Failed to start sync'
      })
    }
    // Note: We don't set syncing = false here for success, 
    // we let the realtime subscription handle the 'completed' status update
    // to ensure the UI is perfectly in sync with the DB state.
    // However, if we error out, we force it false.
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
      console.error('Cancel error:', error)
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
  }

  onMounted(() => {
    subscribeToLogs()
    subscribeToJobs()
    fetchHistory()
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
    cleanup
  }
}
