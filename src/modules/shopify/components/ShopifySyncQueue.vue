<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import type { RealtimeChannel } from '@supabase/supabase-js'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Button from 'primevue/button'

const toast = useToast()
const queue = ref<any[]>([])
const loading = ref(true)
let channel: RealtimeChannel | null = null

const loadQueue = async () => {
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('sync_queue')
      .select(`
        *,
        integrations(id, name, provider)
      `)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    queue.value = data || []
  } catch (error: any) {
    console.error('Error loading queue:', error)
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
    .channel('sync-queue-all')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'sync_queue'
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
  return new Date(dateStr).toLocaleString()
}

const calculateDuration = (start: string, end: string) => {
  if (!start || !end) return '-'
  const duration = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  if (duration < 60) return `${duration}s`
  return `${Math.floor(duration / 60)}m ${duration % 60}s`
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
    console.error('Error cancelling sync:', error)
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to cancel sync'
    })
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
    console.error('Error retrying sync:', error)
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to retry sync'
    })
  }
}

const resetStaleJobs = async () => {
  try {
    const { data, error } = await supabase.rpc('reset_stale_sync_jobs')
    
    if (error) throw error
    
    const count = data || 0
    if (count > 0) {
      toast.add({
        severity: 'success',
        summary: 'Reset Complete',
        detail: `Reset ${count} stale job(s)`
      })
      loadQueue()
    } else {
      toast.add({
        severity: 'info',
        summary: 'No Stale Jobs',
        detail: 'No stale jobs found to reset'
      })
    }
  } catch (error: any) {
    console.error('Error resetting stale jobs:', error)
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to reset stale jobs'
    })
  }
}

// Count stale jobs for badge
const staleJobCount = computed(() => {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  return queue.value.filter(q => 
    q.status === 'processing' && 
    (!q.last_heartbeat || q.last_heartbeat < tenMinutesAgo) &&
    (!q.started_at || q.started_at < tenMinutesAgo)
  ).length
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
  <div class="surface-card shadow-2 border-round overflow-hidden">
    <div class="flex align-items-center justify-content-between p-4 border-bottom-1 surface-border">
      <div class="flex align-items-center gap-2">
        <i class="pi pi-list text-primary text-xl"></i>
        <span class="text-xl font-bold">Sync Queue</span>
      </div>
      <div class="flex align-items-center gap-2">
        <Button 
          v-if="staleJobCount > 0"
          label="Reset Stale" 
          icon="pi pi-exclamation-triangle" 
          severity="warn"
          size="small"
          @click="resetStaleJobs"
          v-tooltip="'Reset jobs stuck in processing'"
          :badge="staleJobCount.toString()"
          badgeSeverity="danger"
        />
        <Button 
          icon="pi pi-refresh" 
          text 
          rounded 
          @click="loadQueue" 
          :loading="loading"
          v-tooltip="'Refresh'"
        />
      </div>
    </div>

    <DataTable 
      :value="queue" 
      :loading="loading"
      stripedRows 
      paginator 
      :rows="10"
      size="small"
      class="border-noround"
    >
      <template #empty>
        <div class="text-center text-500 py-4">
          <i class="pi pi-inbox text-4xl mb-3 block text-300"></i>
          <div>No sync jobs in queue</div>
        </div>
      </template>

      <Column field="created_at" header="Created" style="width: 160px">
        <template #body="{ data }">
          <span class="text-sm">{{ formatDate(data.created_at) }}</span>
        </template>
      </Column>

      <Column field="integrations.name" header="Store" style="cursor: pointer">
        <template #body="{ data }">
          <div class="flex align-items-center gap-2" @click="$router.push(`/settings/shopify/queue/${data.id}`)">
            <i class="pi pi-shopping-bag text-green-600"></i>
            <span class="font-semibold">{{ data.integrations?.name || 'Unknown' }}</span>
          </div>
        </template>
      </Column>

      <Column field="sync_type" header="Type" style="width: 120px">
        <template #body="{ data }">
          <span class="text-sm">{{ getSyncTypeLabel(data.sync_type) }}</span>
        </template>
      </Column>

      <Column field="status" header="Status" style="width: 120px">
        <template #body="{ data }">
          <Tag :value="data.status" :severity="getStatusSeverity(data.status)" class="text-xs" />
        </template>
      </Column>

      <Column field="priority" header="Priority" style="width: 100px">
        <template #body="{ data }">
          <div class="flex align-items-center gap-1">
            <i v-for="n in data.priority" :key="n" class="pi pi-circle-fill text-xs" :class="data.priority <= 2 ? 'text-red-500' : data.priority === 3 ? 'text-orange-500' : 'text-gray-400'"></i>
          </div>
        </template>
      </Column>

      <Column header="Duration" style="width: 100px">
        <template #body="{ data }">
          <span class="text-sm text-500">
            {{ data.started_at && data.completed_at ? calculateDuration(data.started_at, data.completed_at) : data.started_at ? 'Running...' : '-' }}
          </span>
        </template>
      </Column>

      <Column field="retry_count" header="Retries" style="width: 80px" class="text-center">
        <template #body="{ data }">
          <span class="text-sm" :class="data.retry_count > 0 ? 'text-orange-500 font-bold' : ''">
            {{ data.retry_count }} / {{ data.max_retries }}
          </span>
        </template>
      </Column>

      <Column header="Actions" style="width: 120px">
        <template #body="{ data }">
          <div class="flex gap-1">
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
