import { ref, computed, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { formatDate } from '@/lib/formatDate'

export type SyncType = 'products' | 'orders'

export interface ShopifySync {
  id: string
  sync_type: SyncType
  status: 'running' | 'completed' | 'failed'
  total_items: number
  processed_items: number
  created_count: number
  updated_count: number
  error_count: number
  current_page: number
  progress_pct: number
  started_at: string
  completed_at: string | null
  error_message: string | null
}

/**
 * Ultra-simplified Shopify sync composable
 * Direct function invocation with real-time progress via Postgres changes
 */
export function useShopifySync(type: SyncType) {
  const toast = useToast()
  
  const syncing = ref(false)
  const currentSync = ref<ShopifySync | null>(null)
  const history = ref<ShopifySync[]>([])
  let channel: RealtimeChannel | null = null

  // Computed properties
  const progress = computed(() => currentSync.value?.progress_pct || 0)
  
  const statusSeverity = computed(() => {
    switch (currentSync.value?.status) {
      case 'running': return 'info'
      case 'completed': return 'success'
      case 'failed': return 'danger'
      default: return 'secondary'
    }
  })

  const stats = computed(() => {
    if (!currentSync.value) return null
    return {
      total: currentSync.value.total_items || 0,
      processed: currentSync.value.processed_items || 0,
      created: currentSync.value.created_count || 0,
      updated: currentSync.value.updated_count || 0,
      errors: currentSync.value.error_count || 0
    }
  })

  // Start sync - calls edge function directly
  async function startSync() {
    syncing.value = true
    
    try {
      // Note: Edge functions read credentials from the database directly
      // No need to pass credentials in the body
      const { data, error } = await supabase.functions.invoke(
        `shopify-${type}-sync`,
        {
          body: {} // Empty body - function reads from DB
        }
      )
      
      if (error) throw error
      
      toast.add({
        severity: 'success',
        summary: 'Sync Started',
        detail: `${type === 'products' ? 'Product' : 'Order'} sync is running`,
        life: 3000
      })
    } catch (error: any) {
      console.error(`[useShopifySync] Failed to start ${type} sync:`, error)
      syncing.value = false
      
      toast.add({
        severity: 'error',
        summary: 'Sync Failed',
        detail: error.message || 'Failed to start sync',
        life: 5000
      })
    }
  }

  // Subscribe to real-time updates
  function subscribe() {
    channel = supabase
      .channel(`shopify-${type}-sync`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopify_syncs',
          filter: `sync_type=eq.${type}`
        },
        (payload) => {
          console.log(`[useShopifySync] Received update:`, payload)
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            currentSync.value = payload.new as ShopifySync
            
            // Update syncing state
            if (payload.new.status === 'running') {
              syncing.value = true
            } else {
              syncing.value = false
              
              // Show completion toast
              if (payload.new.status === 'completed') {
                toast.add({
                  severity: 'success',
                  summary: 'Sync Completed',
                  detail: `${payload.new.created_count || 0} created, ${payload.new.updated_count || 0} updated`,
                  life: 5000
                })
              } else if (payload.new.status === 'failed') {
                toast.add({
                  severity: 'error',
                  summary: 'Sync Failed',
                  detail: payload.new.error_message || 'Sync encountered an error',
                  life: 5000
                })
              }
              
              // Reload history
              loadHistory()
            }
          }
        }
      )
      .subscribe()
  }

  // Load sync history
  async function loadHistory() {
    try {
      const { data, error } = await supabase
        .from('shopify_syncs')
        .select('*')
        .eq('sync_type', type)
        .order('started_at', { ascending: false })
        .limit(10)

      if (error) throw error

      history.value = (data || []) as ShopifySync[]
      
      // Check if there's a running sync
      const runningSyncInHistory = history.value.find(s => s.status === 'running')
      if (runningSyncInHistory) {
        currentSync.value = runningSyncInHistory
        syncing.value = true
      }
    } catch (error: any) {
      console.error('[useShopifySync] Failed to load history:', error)
    }
  }

  // Format date helper
  function formatSyncDate(dateStr: string | null) {
    if (!dateStr) return 'N/A'
    return formatDate(dateStr)
  }

  // Get duration
  function getDuration(sync: ShopifySync): string {
    if (!sync.completed_at) return 'In progress...'
    
    const start = new Date(sync.started_at).getTime()
    const end = new Date(sync.completed_at).getTime()
    const seconds = Math.round((end - start) / 1000)
    
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  // Lifecycle
  onMounted(() => {
    subscribe()
    loadHistory()
  })

  onUnmounted(() => {
    channel?.unsubscribe()
  })

  return {
    syncing,
    currentSync,
    history,
    progress,
    statusSeverity,
    stats,
    startSync,
    formatSyncDate,
    getDuration
  }
}
