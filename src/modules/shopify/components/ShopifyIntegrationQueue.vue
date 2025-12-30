<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Button from 'primevue/button'

const props = defineProps<{
  integrationId: string
}>()

const router = useRouter()
const toast = useToast()
const queue = ref<any[]>([])
const loading = ref(true)
let channel: RealtimeChannel | null = null

const loadQueue = async () => {
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('sync_queue')
      .select('*')
      .eq('integration_id', props.integrationId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error
    queue.value = data || []
  } catch (error: any) {
      logger.error('Error loading queue:', error)
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to load sync queue'
    })
  } finally {
    loading.value = false
  }
}

const subscribeToQueue = () => {
  channel = supabase
    .channel(`sync-queue-${props.integrationId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'sync_queue',
        filter: `integration_id=eq.${props.integrationId}`
      },
      () => {
        loadQueue()
      }
    )
    .subscribe()
}

const getStatusSeverity = (status: string) => {
  switch (status) {
    case 'completed': return 'success'
    case 'failed': return 'danger'
    case 'cancelled': return 'warn'
    case 'processing': return 'info'
    case 'pending': return 'secondary'
    default: return 'secondary'
  }
}

const getSyncTypeLabel = (type: string) => {
  switch (type) {
    case 'product_sync': return 'Products'
    case 'order_sync': return 'Orders'
    case 'inventory_sync': return 'Inventory'
    default: return type
  }
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return date.toLocaleDateString()
}

const calculateDuration = (start: string, end: string) => {
  if (!start || !end) return '-'
  const duration = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  if (duration < 60) return `${duration}s`
  return `${Math.floor(duration / 60)}m ${duration % 60}s`
}

const viewDetails = (id: string) => {
  router.push(`/settings/shopify/queue/${id}`)
}

const cancelSync = async (id: string) => {
  try {
    const { error } = await supabase
      .from('sync_queue')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error

    toast.add({
      severity: 'info',
      summary: 'Cancelled',
      detail: 'Sync has been cancelled'
    })
  } catch (error: any) {
      logger.error('Error cancelling sync:', error)
  }
}

const retrySync = async (id: string) => {
  try {
    const { error } = await supabase
      .from('sync_queue')
      .update({ 
        status: 'pending', 
        retry_count: 0,
        error_message: null,
        error_type: null,
        started_at: null,
        completed_at: null,
        last_heartbeat: null
      })
      .eq('id', id)

    if (error) throw error

    toast.add({
      severity: 'success',
      summary: 'Queued',
      detail: 'Sync has been queued for retry'
    })
  } catch (error: any) {
      logger.error('Error retrying sync:', error)
  }
}

const runQueueItem = async (item: any) => {
  try {
    // First, mark as processing
    // Try with last_heartbeat first (column exists in DB but PostgREST cache might not be updated)
    const { error: updateError } = await supabase
      .from('sync_queue')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString()
      })
      .eq('id', item.id)

    if (updateError) {
      // If it's a column not found error (PostgREST schema cache issue), try without last_heartbeat
      if (updateError.code === 'PGRST204' && updateError.message?.includes('last_heartbeat')) {
        logger.warn('last_heartbeat column not found in PostgREST schema cache, updating without it. Cache will refresh automatically.', updateError)
        const { error: retryError } = await supabase
          .from('sync_queue')
          .update({
            status: 'processing',
            started_at: new Date().toISOString()
          })
          .eq('id', item.id)
        
        if (retryError) throw retryError
      } else {
        throw updateError
      }
    }

    // Determine which function to call
    let functionName = ''
    switch (item.sync_type) {
      case 'product_sync':
        functionName = 'shopify-product-sync'
        break
      case 'order_sync':
        functionName = 'shopify-order-sync'
        break
      default:
        throw new Error(`Unknown sync type: ${item.sync_type}`)
    }

    toast.add({
      severity: 'info',
      summary: 'Processing',
      detail: `Starting ${getSyncTypeLabel(item.sync_type)} sync...`
    })

    // Invoke the sync function directly
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: {
        integrationId: item.integration_id,
        queueId: item.id,
        metadata: item.metadata
      }
    })

    if (error) throw error

    toast.add({
      severity: 'success',
      summary: 'Started',
      detail: `${getSyncTypeLabel(item.sync_type)} sync has been started`
    })

    // Reload queue to show updated status
    await loadQueue()
  } catch (error: any) {
    logger.error('Error running queue item:', error)
    
    // Mark as failed if error occurred
    await supabase
      .from('sync_queue')
      .update({
        status: 'failed',
        error_message: error.message || 'Failed to start sync',
        completed_at: new Date().toISOString()
      })
      .eq('id', item.id)

    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: error.message || 'Failed to start sync'
    })
  }
}

// Stats
const stats = computed(() => {
  const total = queue.value.length
  const completed = queue.value.filter(q => q.status === 'completed').length
  const failed = queue.value.filter(q => q.status === 'failed').length
  const pending = queue.value.filter(q => q.status === 'pending' || q.status === 'processing').length
  return { total, completed, failed, pending }
})

onMounted(() => {
  loadQueue()
  subscribeToQueue()
})

onUnmounted(() => {
  if (channel) {
    supabase.removeChannel(channel)
  }
})
</script>

<template>
  <div>
    <!-- Quick Stats -->
    <div class="flex gap-3 mb-3">
      <div class="flex align-items-center gap-2 surface-100 border-round px-3 py-2">
        <i class="pi pi-check-circle text-green-500"></i>
        <span class="text-sm"><strong>{{ stats.completed }}</strong> completed</span>
      </div>
      <div class="flex align-items-center gap-2 surface-100 border-round px-3 py-2">
        <i class="pi pi-times-circle text-red-500"></i>
        <span class="text-sm"><strong>{{ stats.failed }}</strong> failed</span>
      </div>
      <div class="flex align-items-center gap-2 surface-100 border-round px-3 py-2">
        <i class="pi pi-clock text-blue-500"></i>
        <span class="text-sm"><strong>{{ stats.pending }}</strong> pending</span>
      </div>
      <div class="flex-1"></div>
      <Button 
        icon="pi pi-refresh" 
        text 
        rounded 
        size="small"
        @click="loadQueue" 
        :loading="loading"
        v-tooltip="'Refresh'"
      />
      <Button 
        label="View All" 
        icon="pi pi-external-link" 
        text 
        size="small"
        @click="router.push('/settings/shopify/queue')"
      />
    </div>

    <!-- Queue Table -->
    <DataTable 
      :value="queue" 
      :loading="loading"
      stripedRows 
      size="small"
      :rows="10"
      paginator
      :rowsPerPageOptions="[5, 10, 20]"
    >
      <template #empty>
        <div class="text-center text-500 py-4">
          <i class="pi pi-inbox text-3xl mb-2 block text-300"></i>
          <div class="text-sm">No sync jobs for this integration</div>
        </div>
      </template>

      <Column field="created_at" header="When" style="width: 100px">
        <template #body="{ data }">
          <span class="text-sm">{{ formatDate(data.created_at) }}</span>
        </template>
      </Column>

      <Column field="sync_type" header="Type" style="width: 100px">
        <template #body="{ data }">
          <span class="text-sm">{{ getSyncTypeLabel(data.sync_type) }}</span>
        </template>
      </Column>

      <Column field="status" header="Status" style="width: 110px">
        <template #body="{ data }">
          <Tag :value="data.status" :severity="getStatusSeverity(data.status)" class="text-xs" />
        </template>
      </Column>

      <Column header="Duration" style="width: 80px">
        <template #body="{ data }">
          <span class="text-sm text-500">
            {{ data.started_at && data.completed_at ? calculateDuration(data.started_at, data.completed_at) : data.started_at ? '...' : '-' }}
          </span>
        </template>
      </Column>

      <Column field="error_message" header="Error">
        <template #body="{ data }">
          <span v-if="data.error_message" class="text-sm text-red-500 white-space-nowrap overflow-hidden text-overflow-ellipsis" style="max-width: 200px; display: block;" v-tooltip="data.error_message">
            {{ data.error_message }}
          </span>
          <span v-else class="text-500">-</span>
        </template>
      </Column>

      <Column header="Actions" style="width: 180px">
        <template #body="{ data }">
          <div class="flex gap-1">
            <Button 
              icon="pi pi-eye" 
              text
              rounded
              size="small"
              @click="viewDetails(data.id)"
              v-tooltip="'View Details'"
            />
            <Button 
              v-if="data.status === 'pending'"
              icon="pi pi-play" 
              severity="success"
              text
              rounded
              size="small"
              @click="runQueueItem(data)"
              v-tooltip="'Run Now'"
            />
            <Button 
              v-if="data.status === 'pending' || data.status === 'processing'"
              icon="pi pi-times" 
              severity="danger"
              text
              rounded
              size="small"
              @click="cancelSync(data.id)"
              v-tooltip="'Cancel'"
            />
            <Button 
              v-if="data.status === 'failed' || data.status === 'cancelled'"
              icon="pi pi-refresh" 
              severity="secondary"
              text
              rounded
              size="small"
              @click="retrySync(data.id)"
              v-tooltip="'Retry'"
            />
          </div>
        </template>
      </Column>
    </DataTable>
  </div>
</template>
