<script setup lang="ts">
import { useShopifySync } from '../composables/useShopifySync'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'

const props = defineProps<{
    integrationId: string
}>()

const {
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
  clearLogs
} = useShopifySync(props.integrationId, 'product_sync')

const getStatusSeverity = (status: string) => {
  switch (status) {
    case 'completed': return 'success'
    case 'failed': return 'danger'
    case 'cancelled': return 'warn'
    case 'running': return 'info'
    default: return 'secondary'
  }
}

const getLogClass = (log: string) => {
  if (log.includes('ERROR') || log.includes('error')) return 'text-red-400'
  if (log.includes('WARN') || log.includes('warning')) return 'text-yellow-400'
  if (log.includes('SUCCESS') || log.includes('completed')) return 'text-green-400'
  return ''
}

const calculateElapsedTime = (startTime: string) => {
  const start = new Date(startTime).getTime()
  const now = Date.now()
  const elapsed = Math.floor((now - start) / 1000)
  
  if (elapsed < 60) return `${elapsed}s`
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
  return `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`
}

const calculateDuration = (start: string, end: string) => {
  const duration = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  if (duration < 60) return `${duration}s`
  return `${Math.floor(duration / 60)}m ${duration % 60}s`
}

const downloadLogs = () => {
  const blob = new Blob([liveLogs.value.join('\n')], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `shopify-sync-logs-${new Date().toISOString()}.txt`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="surface-card border-1 surface-border border-round p-3">
    <div class="flex align-items-center justify-content-between mb-3">
      <div>
        <h3 class="text-lg font-semibold m-0 mb-1 flex align-items-center gap-2">
          <i class="pi pi-sync text-primary"></i>
          Product Synchronization
        </h3>
        <p class="text-xs text-600 m-0">Fetch products from Shopify and match by SKU. Live logs show real-time progress.</p>
      </div>
      <div class="flex gap-2">
          <Button 
            v-if="canCancel" 
            label="Stop" 
            icon="pi pi-stop-circle" 
            severity="danger" 
            outlined
            size="small"
            @click="cancelSync" 
          />
          <Button 
            :label="syncing ? 'Syncing' : 'Start Sync'" 
            :icon="syncing ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'" 
            @click="startSync" 
            :disabled="syncing"
            severity="primary"
            size="small"
          />
      </div>
    </div>

    <!-- Progress Section with Enhanced Metrics -->
    <div v-if="isRunning && currentJob" class="surface-100 border-1 surface-border p-3 border-round mb-3">
        <div class="grid">
            <div class="col-12 md:col-6">
                <div class="flex justify-content-between mb-2 text-sm">
                    <span class="font-semibold text-600">Progress</span>
                    <div class="flex align-items-center gap-2">
                        <Tag :value="currentJob.status.toUpperCase()" :severity="getStatusSeverity(currentJob.status)" size="small" />
                        <span class="font-mono font-semibold">{{ currentJob.processed_items || 0 }} / {{ currentJob.total_items || '?' }}</span>
                    </div>
                </div>
                <ProgressBar :value="progressPercentage" style="height: 8px" :showValue="false"></ProgressBar>
            </div>
            <div class="col-12 md:col-6">
                <div class="flex flex-column gap-1">
                    <div class="flex justify-content-between text-xs">
                        <span class="text-600">Matched:</span>
                        <span class="font-semibold text-green-600">{{ currentJob.matched_items || 0 }}</span>
                    </div>
                    <div class="flex justify-content-between text-xs" v-if="currentJob.started_at">
                        <span class="text-600">Elapsed:</span>
                        <span class="font-semibold font-mono">{{ calculateElapsedTime(currentJob.started_at) }}</span>
                    </div>
                    <div class="flex justify-content-between text-xs" v-if="currentJob.error_count">
                        <span class="text-600">Errors:</span>
                        <span class="font-semibold text-red-600">{{ currentJob.error_count }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Enhanced Live Logs Section -->
    <div v-if="liveLogs.length > 0" class="mb-3">
      <div class="flex justify-content-between align-items-center mb-2">
        <div class="flex align-items-center gap-2">
            <i class="pi pi-terminal text-primary"></i>
            <span class="font-semibold text-sm">Live Logs</span>
            <Tag :value="`${liveLogs.length} entries`" severity="secondary" size="small" />
        </div>
        <div class="flex gap-2">
            <Button icon="pi pi-download" text rounded size="small" @click="downloadLogs" severity="secondary" v-tooltip.top="'Download logs'" />
            <Button icon="pi pi-times" text rounded size="small" @click="clearLogs" severity="danger" v-tooltip.top="'Clear logs'" />
        </div>
      </div>
      <div class="border-1 surface-border border-round font-mono text-xs overflow-auto" style="max-height: 300px; background-color: #0d1117; color: #c9d1d9; padding: 12px;" id="log-container">
        <div v-for="(log, index) in liveLogs" :key="index" class="mb-1 pb-1 border-bottom-1 border-700" style="white-space: pre-wrap; word-break: break-word;" :class="getLogClass(log)">
            {{ log }}
        </div>
      </div>
    </div>


    <!-- Sync History with Enhanced Details -->
    <div class="flex align-items-center gap-2 mb-2">
      <i class="pi pi-history text-600"></i>
      <h4 class="m-0 text-sm font-semibold text-600">Sync History</h4>
    </div>
    <DataTable :value="history" :loading="loadingHistory" size="small" stripedRows showGridlines paginator :rows="5">
      <template #empty>
        <div class="text-center p-3 text-sm text-500">
            <i class="pi pi-inbox text-2xl mb-2"></i>
            <p class="m-0">No sync history found. Start your first sync above.</p>
        </div>
      </template>
      
      <Column field="created_at" header="Started" style="width: 18%">
        <template #body="slotProps">
          <div class="text-xs">
              <div class="font-semibold">{{ new Date(slotProps.data.created_at).toLocaleDateString() }}</div>
              <div class="text-500">{{ new Date(slotProps.data.created_at).toLocaleTimeString() }}</div>
          </div>
        </template>
      </Column>
      <Column field="status" header="Status" style="width: 12%">
        <template #body="slotProps">
          <Tag :value="slotProps.data.status" :severity="getStatusSeverity(slotProps.data.status)" size="small" />
        </template>
      </Column>
      <Column field="processed_items" header="Items" style="width: 12%">
        <template #body="slotProps">
          <div class="text-xs font-mono">
              <div>Total: <span class="font-semibold">{{ slotProps.data.total_items || 0 }}</span></div>
              <div class="text-500">Proc: {{ slotProps.data.processed_items || 0 }}</div>
          </div>
        </template>
      </Column>
      <Column field="matched_items" header="Matched" style="width: 10%">
        <template #body="slotProps">
          <span class="text-xs font-semibold font-mono text-green-600">{{ slotProps.data.matched_items || 0 }}</span>
        </template>
      </Column>
      <Column field="duration" header="Duration" style="width: 10%">
        <template #body="slotProps">
          <span class="text-xs font-mono text-500" v-if="slotProps.data.started_at && slotProps.data.completed_at">
              {{ calculateDuration(slotProps.data.started_at, slotProps.data.completed_at) }}
          </span>
          <span class="text-xs text-400" v-else>-</span>
        </template>
      </Column>
      <Column field="error_message" header="Details" style="width: 38%">
        <template #body="slotProps">
          <div v-if="slotProps.data.error_message" class="text-xs">
              <Tag severity="danger" size="small" class="mr-2">ERROR</Tag>
              <span class="text-500">{{ slotProps.data.error_message.substring(0, 100) }}{{ slotProps.data.error_message.length > 100 ? '...' : '' }}</span>
          </div>
          <div v-else-if="slotProps.data.error_count" class="text-xs">
              <Tag :value="`${slotProps.data.error_count} errors`" severity="warning" size="small" />
          </div>
          <span v-else class="text-xs text-500">No issues</span>
        </template>
      </Column>
    </DataTable>
  </div>
</template>