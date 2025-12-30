<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { logger } from '@/lib/logger'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import type { RealtimeChannel } from '@supabase/supabase-js'

const props = defineProps<{
    integrationId: string
}>()

const toast = useToast()
const syncing = ref(false)
const lastSyncResult = ref<any>(null)
const liveLogs = ref<string[]>([])
const history = ref<any[]>([])
const loadingHistory = ref(false)
const currentJob = ref<any>(null)
let logChannel: RealtimeChannel | null = null
let jobChannel: RealtimeChannel | null = null

const progressPercentage = computed(() => {
  if (!currentJob.value || !currentJob.value.total_items) return 0
  const processed = currentJob.value.processed_items || 0
  const total = currentJob.value.total_items
  const pct = Math.round((processed / total) * 100)
  return isNaN(pct) ? 0 : pct
})

const estimatedTimeRemaining = computed(() => {
  if (!currentJob.value || !currentJob.value.started_at || !currentJob.value.processed_items) return null
  
  const startTime = new Date(currentJob.value.started_at).getTime()
  const now = new Date().getTime()
  const elapsed = now - startTime // ms
  
  const rate = currentJob.value.processed_items / elapsed // items per ms
  const remainingItems = currentJob.value.total_items - currentJob.value.processed_items
  
  if (rate === 0) return null
  
  const remainingMs = remainingItems / rate
  const remainingSec = Math.ceil(remainingMs / 1000)
  
  if (remainingSec < 60) return `${remainingSec}s`
  return `${Math.ceil(remainingSec / 60)}m`
})

const fetchHistory = async () => {
  loadingHistory.value = true
  let query = supabase
    .from('integration_sync_jobs')
    .select('*')
    .eq('integration_type', 'shopify')
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (props.integrationId) {
      // Filter for order sync jobs specifically
      query = query.contains('metadata', { integration_id: props.integrationId, job_type: 'order_sync' })
  }

  const { data } = await query
  
  if (data) history.value = data
  loadingHistory.value = false
}

watch(() => props.integrationId, () => {
    fetchHistory()
})

const stopSync = async () => {
  if (!currentJob.value) return
  await supabase.from('integration_sync_jobs').update({ status: 'cancelled' }).eq('id', currentJob.value.id)
  toast.add({ severity: 'info', summary: 'Stopping...', detail: 'Cancellation requested. The sync will stop shortly.' })
}

const syncOrders = async () => {
  if (!props.integrationId) {
      toast.add({ severity: 'error', summary: 'Error', detail: 'No integration selected' })
      return
  }

  syncing.value = true
  lastSyncResult.value = null
  liveLogs.value = []
  currentJob.value = null
  
  // Create Job
  const { data: job, error: jobError } = await supabase
    .from('integration_sync_jobs')
    .insert({ 
        integration_type: 'shopify', 
        status: 'pending',
        metadata: { integration_id: props.integrationId, job_type: 'order_sync' }
    })
    .select()
    .single()
    
  if (jobError) {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to create sync job' })
      syncing.value = false
      return
  }
  
  currentJob.value = job
  const syncId = job.id

  // Subscribe to Job Updates
  jobChannel = supabase.channel(`job-${syncId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'integration_sync_jobs', filter: `id=eq.${syncId}` }, (payload) => {
        currentJob.value = payload.new
        if (['completed', 'failed', 'cancelled'].includes(payload.new.status)) {
            syncing.value = false
            fetchHistory()
            if (payload.new.status === 'completed') {
                 toast.add({ severity: 'success', summary: 'Sync Complete', detail: `Processed ${payload.new.processed_items} orders.` })
            } else if (payload.new.status === 'failed') {
                 toast.add({ severity: 'error', summary: 'Sync Failed', detail: payload.new.error_message })
            }
        }
    })
    .subscribe()
  
  // Subscribe to logs
  logChannel = supabase.channel(`sync-logs-${syncId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'integration_logs',
      },
      (payload) => {
        const newLog = payload.new as any
        if (newLog.details && newLog.details.sync_id === syncId) {
          liveLogs.value.push(`[${new Date(newLog.created_at).toLocaleTimeString()}] ${newLog.message}`)
          // Auto-scroll to bottom
          const logContainer = document.getElementById('log-container')
          if (logContainer) {
            setTimeout(() => logContainer.scrollTop = logContainer.scrollHeight, 50)
          }
        }
      }
    )
    .subscribe()

  try {
    const { error } = await supabase.functions.invoke('shopify-order-sync', {
      body: { sync_id: syncId, jobId: syncId, integrationId: props.integrationId }
    })
    
    if (error) throw error
    
    toast.add({ severity: 'info', summary: 'Sync Started', detail: 'The sync process has started in the background.', life: 3000 })

  } catch (err: any) {
    logger.error('Sync Error Details', err)
    let msg = err.message || 'Unknown error'
    
    if (err.context && err.context.json) {
        try {
            const body = await err.context.json()
            if (body.error) msg = body.error
        } catch (e) { /* ignore */ }
    }

    toast.add({ severity: 'error', summary: 'Sync Start Failed', detail: msg, life: 5000 })
    syncing.value = false 
  }
}

onMounted(() => {
  fetchHistory()
})

onUnmounted(() => {
    if (logChannel) supabase.removeChannel(logChannel)
    if (jobChannel) supabase.removeChannel(jobChannel)
})
</script>

<template>
  <div class="card">
    <div class="flex align-items-center justify-content-between mb-4">
      <h3 class="text-xl font-semibold m-0">Order Synchronization</h3>
      <div class="flex gap-2">
          <Button 
            v-if="syncing" 
            label="Stop Sync" 
            icon="pi pi-stop-circle" 
            severity="danger" 
            @click="stopSync" 
          />
          <Button 
            :label="syncing ? 'Syncing...' : 'Start Sync'" 
            :icon="syncing ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'" 
            @click="syncOrders" 
            :disabled="syncing" 
          />
      </div>
    </div>

    <div v-if="syncing && currentJob" class="mb-4">
        <div class="flex justify-content-between mb-2">
            <span>Progress: {{ currentJob.processed_items }} / {{ currentJob.total_items || '?' }}</span>
            <span v-if="estimatedTimeRemaining">Est. Remaining: {{ estimatedTimeRemaining }}</span>
        </div>
        <ProgressBar :value="progressPercentage" :showValue="false" style="height: 10px"></ProgressBar>
    </div>

    <p class="text-gray-600 mb-4">
      Manually trigger a sync to fetch the latest orders from Shopify. 
      This will import new orders and update existing ones.
    </p>

    <div v-if="liveLogs.length > 0" class="surface-ground p-3 border-round mb-4 font-mono text-sm" style="max-height: 200px; overflow-y: auto;" id="log-container">
      <div v-for="(log, index) in liveLogs" :key="index" class="mb-1">{{ log }}</div>
    </div>

    <h4 class="mb-2">Sync History</h4>
    <DataTable :value="history" :loading="loadingHistory" size="small" stripedRows>
      <Column field="created_at" header="Date">
        <template #body="slotProps">
          {{ new Date(slotProps.data.created_at).toLocaleString() }}
        </template>
      </Column>
      <Column field="status" header="Status">
        <template #body="slotProps">
          <Tag :value="slotProps.data.status" :severity="slotProps.data.status === 'completed' ? 'success' : slotProps.data.status === 'failed' ? 'danger' : 'info'" />
        </template>
      </Column>
      <Column field="processed_items" header="Processed"></Column>
      <Column field="total_items" header="Total"></Column>
      <Column field="error_message" header="Error"></Column>
    </DataTable>
  </div>
</template>
