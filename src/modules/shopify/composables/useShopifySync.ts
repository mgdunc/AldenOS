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
 * No integration ID needed - uses env vars for Shopify credentials
 */
export function useShopifySync() {
  const toast = useToast()
  
  const queue = ref<QueueItem[]>([])
  const loading = ref(false)
  const syncing = ref(false)
  
  let channel: any = null

  const isSyncing = computed(() => {
    return queue.value.some(item => 
      item.status === 'pending' || item.status === 'processing'
    )
  })

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

    syncing.value = true
    try {
      // Create queue entry
      const { data: queueItem, error: queueError } = await supabase
        .from('sync_queue')
        .insert({
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
