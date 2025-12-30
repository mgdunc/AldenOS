<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const queueItem = ref<any>(null)
const logs = ref<any[]>([])
const loading = ref(true)
const showLogDialog = ref(false)
const selectedLog = ref<any>(null)
let channel: RealtimeChannel | null = null

const queueId = computed(() => route.params.id as string)

const loadQueueItem = async () => {
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('sync_queue')
      .select(`
        *,
        integrations(id, name, provider, settings)
      `)
      .eq('id', queueId.value)
      .single()

    if (error) throw error
    queueItem.value = data
  } catch (error: any) {
      logger.error('Error loading queue item:', error)
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to load sync details'
    })
  } finally {
    loading.value = false
  }
}

const loadLogs = async () => {
  try {
    // Load EdgeFunction logs from system_logs after queue creation time
    const { data, error } = await supabase
      .from('system_logs')
      .select('*')
      .ilike('source', 'EdgeFunction:%')
      .gte('created_at', queueItem.value?.created_at)
      .order('created_at', { ascending: true })
      .limit(200)

    if (error) throw error
    
    // Filter to only show logs relevant to this sync (by queueId or integrationId in details)
    const filteredLogs = (data || []).filter(log => {
      const details = log.details || {}
      // Match if queueId matches
      if (details.queueId === queueItem.value?.id) return true
      // Match if integrationId matches
      if (details.integrationId === queueItem.value?.integration_id) return true
      // Match if functionName matches the sync type
      const syncType = queueItem.value?.sync_type
      if (syncType === 'product_sync' && details.functionName === 'shopify-product-sync') return true
      if (syncType === 'order_sync' && details.functionName === 'shopify-order-sync') return true
      return false
    })
    
    logs.value = filteredLogs
  } catch (error: any) {
    logger.error('Error loading logs:', error)
  }
}

const subscribeToUpdates = () => {
  channel = supabase
    .channel(`sync-queue-${queueId.value}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'sync_queue',
        filter: `id=eq.${queueId.value}`
      },
      () => {
        loadQueueItem()
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'system_logs'
      },
      () => {
        // Reload logs when new system_logs are inserted
        loadLogs()
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

const getLogSeverity = (level: string) => {
  switch (level) {
    case 'error': return 'danger'
    case 'warn': return 'warn'
    case 'info': return 'info'
    case 'debug': return 'secondary'
    default: return 'secondary'
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

const cancelSync = async () => {
  try {
    const { error } = await supabase
      .from('sync_queue')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', queueId.value)

    if (error) throw error

    toast.add({
      severity: 'info',
      summary: 'Cancelled',
      detail: 'Sync has been cancelled'
    })
  } catch (error: any) {
      logger.error('Error cancelling sync:', error)
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to cancel sync'
    })
  }
}

const retrySync = async () => {
  try {
    const { error } = await supabase
      .from('sync_queue')
      .update({ 
        status: 'pending', 
        retry_count: 0,
        error_message: null,
        started_at: null,
        completed_at: null
      })
      .eq('id', queueId.value)

    if (error) throw error

    toast.add({
      severity: 'success',
      summary: 'Queued',
      detail: 'Sync has been queued for retry'
    })
  } catch (error: any) {
      logger.error('Error retrying sync:', error)
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to retry sync'
    })
  }
}

const copyLogToClipboard = async () => {
  if (!selectedLog.value) return
  
  const logText = `Log Entry
==========
Timestamp: ${formatDate(selectedLog.value.created_at)}
Level: ${selectedLog.value.level}
Source: ${selectedLog.value.source}
Message: ${selectedLog.value.message}

Details:
${JSON.stringify(selectedLog.value.details, null, 2)}`

  try {
    await navigator.clipboard.writeText(logText)
    toast.add({
      severity: 'success',
      summary: 'Copied',
      detail: 'Log copied to clipboard',
      life: 2000
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to copy to clipboard'
    })
  }
}

onMounted(async () => {
  await loadQueueItem()
  if (queueItem.value) {
    await loadLogs()
    subscribeToUpdates()
  }
})

onUnmounted(() => {
  if (channel) {
    supabase.removeChannel(channel)
  }
})
</script>

<template>
  <div class="p-3">
    <div class="flex align-items-center justify-content-between mb-3">
      <div class="flex align-items-center gap-2">
        <Button icon="pi pi-arrow-left" text rounded @click="router.push('/settings/shopify/queue')" v-tooltip="'Back to Queue'" />
        <div>
          <h2 class="text-2xl font-bold m-0 mb-1">Sync Details</h2>
          <p class="text-sm text-600 m-0">View detailed information and logs for this sync job.</p>
        </div>
      </div>
      <div class="flex gap-2">
        <Button 
          v-if="queueItem?.status === 'pending' || queueItem?.status === 'processing'"
          label="Cancel" 
          icon="pi pi-times" 
          severity="danger"
          size="small"
          @click="cancelSync"
        />
        <Button 
          v-if="queueItem?.status === 'failed' || queueItem?.status === 'cancelled'"
          label="Retry" 
          icon="pi pi-refresh" 
          severity="secondary"
          size="small"
          @click="retrySync"
        />
        <Button 
          icon="pi pi-refresh" 
          text 
          rounded 
          @click="loadQueueItem" 
          :loading="loading"
          v-tooltip="'Refresh'"
        />
      </div>
    </div>

    <div v-if="loading" class="flex justify-content-center align-items-center py-8">
      <i class="pi pi-spin pi-spinner text-4xl text-primary"></i>
    </div>

    <div v-else-if="queueItem" class="grid">
      <!-- Overview Card -->
      <div class="col-12 lg:col-8">
        <Card class="mb-3">
          <template #title>
            <div class="flex align-items-center justify-content-between">
              <span>Sync Overview</span>
              <Tag :value="queueItem.status" :severity="getStatusSeverity(queueItem.status)" />
            </div>
          </template>
          <template #content>
            <div class="grid">
              <div class="col-12 md:col-6">
                <div class="mb-3">
                  <label class="block text-sm font-semibold text-600 mb-1">Queue ID</label>
                  <code class="text-sm surface-100 border-round px-2 py-1">{{ queueItem.id }}</code>
                </div>
                <div class="mb-3">
                  <label class="block text-sm font-semibold text-600 mb-1">Store Name</label>
                  <div class="flex align-items-center gap-2">
                    <i class="pi pi-shopping-bag text-green-600"></i>
                    <span class="font-semibold">{{ queueItem.integrations?.name || 'Unknown' }}</span>
                  </div>
                </div>
                <div class="mb-3">
                  <label class="block text-sm font-semibold text-600 mb-1">Integration ID</label>
                  <code class="text-sm surface-100 border-round px-2 py-1">{{ queueItem.integration_id }}</code>
                </div>
                <div class="mb-3">
                  <label class="block text-sm font-semibold text-600 mb-1">Shop URL</label>
                  <span>{{ queueItem.integrations?.settings?.shop_url || '-' }}</span>
                </div>
              </div>
              
              <div class="col-12 md:col-6">
                <div class="mb-3">
                  <label class="block text-sm font-semibold text-600 mb-1">Sync Type</label>
                  <span>{{ queueItem.sync_type }}</span>
                </div>
                <div class="mb-3">
                  <label class="block text-sm font-semibold text-600 mb-1">Priority</label>
                  <div class="flex align-items-center gap-1">
                    <i v-for="n in queueItem.priority" :key="n" class="pi pi-circle-fill" 
                       :class="queueItem.priority <= 2 ? 'text-red-500' : queueItem.priority === 3 ? 'text-orange-500' : 'text-gray-400'">
                    </i>
                    <span class="ml-2 text-sm text-500">({{ queueItem.priority }}/5)</span>
                  </div>
                </div>
                <div class="mb-3">
                  <label class="block text-sm font-semibold text-600 mb-1">Retry Count</label>
                  <span :class="queueItem.retry_count > 0 ? 'text-orange-500 font-bold' : ''">
                    {{ queueItem.retry_count }} / {{ queueItem.max_retries }}
                  </span>
                </div>
              </div>

              <div class="col-12">
                <div class="mb-3">
                  <label class="block text-sm font-semibold text-600 mb-1">Timeline</label>
                  <div class="flex flex-column gap-2 text-sm">
                    <div class="flex align-items-center gap-2">
                      <i class="pi pi-calendar text-500"></i>
                      <span class="font-semibold">Created:</span>
                      <span>{{ formatDate(queueItem.created_at) }}</span>
                    </div>
                    <div v-if="queueItem.started_at" class="flex align-items-center gap-2">
                      <i class="pi pi-play text-blue-500"></i>
                      <span class="font-semibold">Started:</span>
                      <span>{{ formatDate(queueItem.started_at) }}</span>
                    </div>
                    <div v-if="queueItem.completed_at" class="flex align-items-center gap-2">
                      <i class="pi pi-check-circle" :class="queueItem.status === 'completed' ? 'text-green-500' : 'text-red-500'"></i>
                      <span class="font-semibold">Completed:</span>
                      <span>{{ formatDate(queueItem.completed_at) }}</span>
                    </div>
                    <div v-if="queueItem.started_at && queueItem.completed_at" class="flex align-items-center gap-2">
                      <i class="pi pi-clock text-500"></i>
                      <span class="font-semibold">Duration:</span>
                      <span>{{ calculateDuration(queueItem.started_at, queueItem.completed_at) }}</span>
                    </div>
                  </div>
                </div>

                <div v-if="queueItem.error_message" class="mb-3">
                  <label class="block text-sm font-semibold text-600 mb-1">Error Message</label>
                  <div class="surface-100 border-round p-3 border-1 border-red-300">
                    <pre class="m-0 text-sm text-red-700 white-space-pre-wrap">{{ queueItem.error_message }}</pre>
                  </div>
                </div>

                <div v-if="queueItem.metadata && Object.keys(queueItem.metadata).length > 0" class="mb-3">
                  <label class="block text-sm font-semibold text-600 mb-1">Metadata</label>
                  <div class="surface-100 border-round p-3">
                    <pre class="m-0 text-sm white-space-pre-wrap">{{ JSON.stringify(queueItem.metadata, null, 2) }}</pre>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </Card>
      </div>

      <!-- Stats Card -->
      <div class="col-12 lg:col-4">
        <Card>
          <template #title>Statistics</template>
          <template #content>
            <div class="flex flex-column gap-3">
              <div class="surface-100 border-round p-3 text-center">
                <div class="text-3xl font-bold text-primary">
                  {{ queueItem.status === 'processing' ? '⏳' : queueItem.status === 'completed' ? '✓' : queueItem.status === 'failed' ? '✗' : '⏸' }}
                </div>
                <div class="text-sm text-600 mt-2">Current Status</div>
              </div>

              <div class="surface-100 border-round p-3">
                <div class="flex align-items-center justify-content-between mb-2">
                  <span class="text-sm font-semibold">Provider</span>
                  <span class="text-sm">{{ queueItem.integrations?.provider || 'Unknown' }}</span>
                </div>
                <div class="flex align-items-center justify-content-between mb-2">
                  <span class="text-sm font-semibold">Active</span>
                  <Tag :value="queueItem.integrations?.is_active ? 'Yes' : 'No'" 
                       :severity="queueItem.integrations?.is_active ? 'success' : 'danger'" 
                       class="text-xs" />
                </div>
              </div>

              <div v-if="logs.length > 0" class="surface-100 border-round p-3">
                <div class="text-center">
                  <div class="text-2xl font-bold text-primary">{{ logs.length }}</div>
                  <div class="text-sm text-600">Log Entries</div>
                </div>
              </div>
            </div>
          </template>
        </Card>
      </div>

      <!-- Logs Table -->
      <div class="col-12">
        <Card>
          <template #title>
            <div class="flex align-items-center justify-content-between">
              <div class="flex align-items-center gap-2">
                <i class="pi pi-file-edit text-primary"></i>
                <span>Edge Function Logs</span>
                <Tag :value="logs.length.toString()" severity="secondary" class="text-xs" />
              </div>
              <Button 
                icon="pi pi-refresh" 
                text 
                rounded 
                size="small"
                @click="loadLogs"
                v-tooltip="'Refresh Logs'"
              />
            </div>
          </template>
          <template #content>
            <DataTable 
              :value="logs" 
              stripedRows 
              paginator 
              :rows="20"
              size="small"
            >
              <template #empty>
                <div class="text-center text-500 py-4">
                  <i class="pi pi-inbox text-4xl mb-3 block text-300"></i>
                  <div>No Edge Function logs found for this sync</div>
                  <div class="text-sm mt-2">Logs will appear here when the sync runs</div>
                </div>
              </template>

              <Column field="created_at" header="Timestamp" style="width: 160px">
                <template #body="{ data }">
                  <span class="text-sm">{{ formatDate(data.created_at) }}</span>
                </template>
              </Column>

              <Column field="level" header="Level" style="width: 80px">
                <template #body="{ data }">
                  <Tag :value="data.level" :severity="getLogSeverity(data.level)" class="text-xs" />
                </template>
              </Column>

              <Column field="source" header="Source" style="width: 150px">
                <template #body="{ data }">
                  <span class="text-sm text-600">{{ data.source?.replace('EdgeFunction:', '') || '-' }}</span>
                </template>
              </Column>

              <Column field="message" header="Message">
                <template #body="{ data }">
                  <span class="text-sm">{{ data.message }}</span>
                </template>
              </Column>

              <Column field="details" header="" style="width: 60px">
                <template #body="{ data }">
                  <Button 
                    v-if="data.details"
                    icon="pi pi-eye" 
                    text
                    rounded
                    size="small"
                    @click="selectedLog = data; showLogDialog = true"
                    v-tooltip="'View Details'"
                  />
                </template>
              </Column>
            </DataTable>
          </template>
        </Card>
      </div>
    </div>

    <div v-else class="text-center text-500 py-8">
      <i class="pi pi-exclamation-triangle text-4xl mb-3 block text-orange-500"></i>
      <div>Sync job not found</div>
    </div>

    <!-- Log Details Dialog (outside v-if/v-else chain) -->
    <Dialog 
      v-model:visible="showLogDialog" 
      header="Log Details" 
      :modal="true" 
      :style="{ width: '600px', maxHeight: '80vh' }"
      class="log-details-dialog"
    >
      <div v-if="selectedLog" class="flex flex-column gap-3">
        <div class="flex align-items-center gap-2">
          <Tag :value="selectedLog.level" :severity="getLogSeverity(selectedLog.level)" />
          <span class="text-600">{{ selectedLog.source }}</span>
        </div>
        <div>
          <label class="block text-sm font-semibold text-600 mb-1">Message</label>
          <div class="surface-100 border-round p-2">{{ selectedLog.message }}</div>
        </div>
        <div>
          <label class="block text-sm font-semibold text-600 mb-1">Timestamp</label>
          <div>{{ formatDate(selectedLog.created_at) }}</div>
        </div>
        <div v-if="selectedLog.details">
          <label class="block text-sm font-semibold text-600 mb-1">Details</label>
          <div class="surface-100 border-round p-3 overflow-auto" style="max-height: 300px">
            <pre class="m-0 text-sm white-space-pre-wrap">{{ JSON.stringify(selectedLog.details, null, 2) }}</pre>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Copy" icon="pi pi-copy" text @click="copyLogToClipboard" />
        <Button label="Close" @click="showLogDialog = false" />
      </template>
    </Dialog>
  </div>
</template>
