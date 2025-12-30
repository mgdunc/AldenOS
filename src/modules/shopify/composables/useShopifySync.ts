import { ref, computed, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { logger } from '@/lib/logger'

export type SyncType = 'product_sync' | 'order_sync'

export interface QueueItem {
  id: string
  sync_type: SyncType
  status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
  started_at?: string
  completed_at?: string
  error_message?: string
  metadata?: Record<string, any>
}

/**
 * Simple Shopify Sync Composable - Single Store Edition
 * 
 * Automatically fetches the Shopify integration ID from the database
 */
export function useShopifySync() {
  const toast = useToast()
  
  const queue = ref<QueueItem[]>([])
  const loading = ref(false)
  const syncing = ref(false)
  const integrationId = ref<string | null>(null)
  
  let channel: any = null

  const isSyncing = computed(() => {
    return queue.value.some(item => 
      item.status === 'pending' || item.status === 'processing'
    )
  })

  // Fetch the Shopify integration ID
  const loadIntegrationId = async () => {
    try {
      const { data } = await supabase
        .from('integrations')
        .select('id')
        .eq('provider', 'shopify')
        .limit(1)
        .maybeSingle()
      
      if (data) {
        integrationId.value = data.id
      }
    } catch (e) {
      logger.error('Failed to load integration ID', e as Error)
    }
  }

  const loadQueue = async () => {
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('sync_queue')
        .select('*')
        .in('status', ['pending', 'processing', 'completed', 'failed'])
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error
      queue.value = data || []
    } catch (e: any) {
      logger.error('Failed to load sync queue', e)
    } finally {
      loading.value = false
    }
  }

  const startSync = async (type: SyncType) => {
    if (isSyncing.value) {
      toast.add({
        severity: 'warn',
        summary: 'Sync Running',
        detail: 'Please wait for the current sync to complete'
      })
      return
    }

    // Ensure we have an integration ID
    if (!integrationId.value) {
      await loadIntegrationId()
    }
    
    if (!integrationId.value) {
      toast.add({
        severity: 'error',
        summary: 'Not Configured',
        detail: 'Please configure Shopify integration first'
      })
      return
    }

    syncing.value = true
    try {
      // Create queue entry with integration_id
      const { data: queueItem, error: queueError } = await supabase
        .from('sync_queue')
        .insert({
          integration_id: integrationId.value,
          sync_type: type,
          status: 'pending',
          priority: type === 'order_sync' ? 1 : 2 // Orders first
        })
        .select()
        .single()

      if (queueError) throw queueError

      toast.add({
        severity: 'success',
        summary: 'Sync Queued',
        detail: `${type.replace('_', ' ')} has been queued`
      })

      // Trigger the queue processor
      const { error: invokeError } = await supabase.functions.invoke('sync-queue-processor')
      
      if (invokeError) {
        logger.warn('Queue processor invoke warning:', invokeError)
        // Don't throw - the queue item exists and will be processed
      }

      await loadQueue()
    } catch (e: any) {
      logger.error('Failed to start sync', e)
      toast.add({
        severity: 'error',
        summary: 'Sync Failed',
        detail: e.message
      })
    } finally {
      syncing.value = false
    }
  }

  const startProductSync = () => startSync('product_sync')
  const startOrderSync = () => startSync('order_sync')

  const subscribe = () => {
    channel = supabase
      .channel('sync-queue-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sync_queue'
      }, () => {
        loadQueue()
      })
      .subscribe()
  }

  onMounted(() => {
    loadIntegrationId()
    loadQueue()
    subscribe()
  })

  onUnmounted(() => {
    if (channel) {
      supabase.removeChannel(channel)
    }
  })

  return {
    queue,
    loading,
    syncing,
    isSyncing,
    loadQueue,
    startSync,
    startProductSync,
    startOrderSync
  }
}
