<script setup lang="ts">
import { computed, ref } from 'vue'
import { useUnifiedSync, type SyncType } from '../composables/useUnifiedSync'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import Card from 'primevue/card'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Accordion from 'primevue/accordion'
import AccordionTab from 'primevue/accordiontab'
import { formatDate } from '@/lib/formatDate'

const props = defineProps<{
  integrationId: string
}>()

const {
  activeSyncs,
  syncHistory,
  syncLogs,
  loading,
  isSyncing,
  startSync,
  cancelSync,
  clearLogs,
  getSyncStats,
  canCancel
} = useUnifiedSync(props.integrationId)

const expandedTabs = ref<string[]>([])

const syncTypes: Array<{ type: SyncType; label: string; icon: string; description: string }> = [
  {
    type: 'product_sync',
    label: 'Products',
    icon: 'pi pi-box',
    description: 'Sync products from Shopify and match by SKU'
  },
  {
    type: 'order_sync',
    label: 'Orders',
    icon: 'pi pi-shopping-cart',
    description: 'Import orders from Shopify and create sales orders'
  }
]

const getStatusSeverity = (status: string) => {
  switch (status) {
    case 'completed': return 'success'
    case 'failed': return 'danger'
    case 'cancelled': return 'warn'
    case 'running': return 'info'
    case 'pending': return 'secondary'
    default: return 'secondary'
  }
}

const getLogClass = (level: string) => {
  switch (level) {
    case 'error': return 'text-red-400'
    case 'warning': return 'text-yellow-400'
    case 'success': return 'text-green-400'
    case 'info': return 'text-blue-400'
    default: return 'text-gray-300'
  }
}

const formatDuration = (start: string, end?: string) => {
  const startTime = new Date(start).getTime()
  const endTime = end ? new Date(end).getTime() : Date.now()
  const duration = Math.floor((endTime - startTime) / 1000)
  
  if (duration < 60) return `${duration}s`
  if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`
  return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`
}

const downloadLogs = (type: SyncType) => {
  const logs = syncLogs.value.get(type) || []
  const content = logs.map(log => 
    `[${new Date(log.timestamp).toLocaleString()}] [${log.level.toUpperCase()}] ${log.message}`
  ).join('\n')
  
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `shopify-${type}-logs-${new Date().toISOString()}.txt`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <Card>
    <template #title>
      <div class="flex align-items-center gap-2">
        <i class="pi pi-sync text-primary"></i>
        <span>Shopify Synchronization</span>
      </div>
    </template>
    <template #content>
      <div class="flex flex-column gap-4">
        <!-- Sync Type Cards -->
        <div class="grid">
          <div 
            v-for="syncType in syncTypes" 
            :key="syncType.type"
            class="col-12 md:col-6"
          >
            <div class="surface-card border-1 surface-border border-round p-4">
              <div class="flex flex-column gap-3">
                <!-- Header -->
                <div class="flex align-items-center justify-content-between">
                  <div class="flex align-items-center gap-2">
                    <i :class="`${syncType.icon} text-primary text-xl`"></i>
                    <div>
                      <h4 class="m-0 text-lg font-semibold">{{ syncType.label }}</h4>
                      <p class="m-0 text-xs text-600 mt-1">{{ syncType.description }}</p>
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <Button
                      v-if="canCancel(syncType.type)"
                      icon="pi pi-stop-circle"
                      severity="danger"
                      outlined
                      size="small"
                      @click="cancelSync(syncType.type)"
                      v-tooltip.top="'Cancel sync'"
                    />
                    <Button
                      :label="activeSyncs.get(syncType.type) ? 'Syncing...' : 'Start Sync'"
                      :icon="activeSyncs.get(syncType.type) ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'"
                      :disabled="!!activeSyncs.get(syncType.type)"
                      size="small"
                      @click="startSync(syncType.type)"
                    />
                  </div>
                </div>

                <!-- Progress -->
                <div v-if="activeSyncs.get(syncType.type)" class="flex flex-column gap-2">
                  <div class="flex justify-content-between align-items-center">
                    <span class="text-sm font-semibold">Progress</span>
                    <Tag 
                      :value="activeSyncs.get(syncType.type)?.status.toUpperCase() || ''"
                      :severity="getStatusSeverity(activeSyncs.get(syncType.type)?.status || '')"
                      size="small"
                    />
                  </div>
                  
                  <ProgressBar 
                    :value="getSyncStats(syncType.type).progress" 
                    :showValue="true"
                    style="height: 10px"
                  />
                  
                  <div class="grid text-xs">
                    <div class="col-6">
                      <div class="flex justify-content-between mb-1">
                        <span class="text-600">Processed:</span>
                        <span class="font-semibold">{{ getSyncStats(syncType.type).processed }} / {{ getSyncStats(syncType.type).total }}</span>
                      </div>
                      <div class="flex justify-content-between">
                        <span class="text-600">Matched:</span>
                        <span class="font-semibold text-green-600">{{ getSyncStats(syncType.type).matched }}</span>
                      </div>
                    </div>
                    <div class="col-6">
                      <div class="flex justify-content-between mb-1">
                        <span class="text-600">Updated:</span>
                        <span class="font-semibold text-blue-600">{{ getSyncStats(syncType.type).updated }}</span>
                      </div>
                      <div class="flex justify-content-between">
                        <span class="text-600">Errors:</span>
                        <span class="font-semibold text-red-600">{{ getSyncStats(syncType.type).errors }}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div v-if="getSyncStats(syncType.type).estimatedTimeRemaining" class="text-xs text-600">
                    <i class="pi pi-clock mr-1"></i>
                    Est. remaining: {{ getSyncStats(syncType.type).estimatedTimeRemaining }}
                  </div>
                </div>

                <!-- Quick Stats (when not syncing) -->
                <div v-else class="flex gap-3">
                  <div class="flex-1 text-center p-2 surface-100 border-round">
                    <div class="text-xs text-600 mb-1">Last Sync</div>
                    <div class="text-sm font-semibold">
                      {{ syncHistory.get(syncType.type)?.[0] 
                        ? formatDate(syncHistory.get(syncType.type)![0].created_at, 'short')
                        : 'Never' }}
                    </div>
                  </div>
                  <div class="flex-1 text-center p-2 surface-100 border-round">
                    <div class="text-xs text-600 mb-1">Total Jobs</div>
                    <div class="text-sm font-semibold">{{ syncHistory.get(syncType.type)?.length || 0 }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- History and Logs Accordion -->
        <Accordion v-model:activeIndex="expandedTabs">
          <AccordionTab 
            v-for="syncType in syncTypes" 
            :key="syncType.type"
            :header="`${syncType.label} History & Logs`"
          >
            <div class="flex flex-column gap-4">
              <!-- History Table -->
              <div>
                <h5 class="m-0 mb-3 flex align-items-center gap-2">
                  <i class="pi pi-history text-600"></i>
                  <span>Sync History</span>
                </h5>
                <DataTable 
                  :value="syncHistory.get(syncType.type) || []" 
                  :loading="loading.get(syncType.type)"
                  size="small"
                  stripedRows
                  paginator
                  :rows="5"
                  class="p-datatable-sm"
                >
                  <template #empty>
                    <div class="text-center p-4 text-sm text-500">
                      <i class="pi pi-inbox text-2xl mb-2"></i>
                      <p class="m-0">No sync history found</p>
                    </div>
                  </template>
                  
                  <Column field="created_at" header="Started" style="width: 20%">
                    <template #body="{ data }">
                      <div class="text-xs">
                        <div class="font-semibold">{{ formatDate(data.created_at, 'short') }}</div>
                        <div class="text-500">{{ formatDate(data.created_at, 'time') }}</div>
                      </div>
                    </template>
                  </Column>
                  
                  <Column field="status" header="Status" style="width: 12%">
                    <template #body="{ data }">
                      <Tag 
                        :value="data.status" 
                        :severity="getStatusSeverity(data.status)"
                        size="small"
                      />
                    </template>
                  </Column>
                  
                  <Column header="Progress" style="width: 20%">
                    <template #body="{ data }">
                      <div class="text-xs">
                        <div class="font-semibold">{{ data.processed_items || 0 }} / {{ data.total_items || 0 }}</div>
                        <div class="text-500">
                          {{ data.matched_items || 0 }} matched, {{ data.updated_items || 0 }} updated
                        </div>
                      </div>
                    </template>
                  </Column>
                  
                  <Column header="Duration" style="width: 12%">
                    <template #body="{ data }">
                      <span class="text-xs font-mono text-500" v-if="data.started_at">
                        {{ formatDuration(data.started_at, data.completed_at) }}
                      </span>
                      <span class="text-xs text-400" v-else>-</span>
                    </template>
                  </Column>
                  
                  <Column field="error_message" header="Details" style="width: 36%">
                    <template #body="{ data }">
                      <div v-if="data.error_message" class="text-xs">
                        <Tag severity="danger" size="small" class="mr-2">ERROR</Tag>
                        <span class="text-500">{{ data.error_message.substring(0, 80) }}{{ data.error_message.length > 80 ? '...' : '' }}</span>
                      </div>
                      <div v-else-if="data.error_count" class="text-xs">
                        <Tag :value="`${data.error_count} errors`" severity="warning" size="small" />
                      </div>
                      <span v-else class="text-xs text-500">No issues</span>
                    </template>
                  </Column>
                </DataTable>
              </div>

              <!-- Live Logs -->
              <div v-if="(syncLogs.get(syncType.type) || []).length > 0">
                <div class="flex justify-content-between align-items-center mb-2">
                  <h5 class="m-0 flex align-items-center gap-2">
                    <i class="pi pi-terminal text-primary"></i>
                    <span>Live Logs</span>
                    <Tag 
                      :value="`${(syncLogs.get(syncType.type) || []).length} entries`" 
                      severity="secondary" 
                      size="small"
                    />
                  </h5>
                  <div class="flex gap-2">
                    <Button
                      icon="pi pi-download"
                      text
                      rounded
                      size="small"
                      @click="downloadLogs(syncType.type)"
                      v-tooltip.top="'Download logs'"
                    />
                    <Button
                      icon="pi pi-times"
                      text
                      rounded
                      size="small"
                      severity="danger"
                      @click="clearLogs(syncType.type)"
                      v-tooltip.top="'Clear logs'"
                    />
                  </div>
                </div>
                <div 
                  class="border-1 surface-border border-round font-mono text-xs overflow-auto p-3" 
                  style="max-height: 300px; background-color: #0d1117; color: #c9d1d9;"
                >
                  <div 
                    v-for="(log, index) in (syncLogs.get(syncType.type) || [])" 
                    :key="index"
                    class="mb-1 pb-1 border-bottom-1 border-700"
                    :class="getLogClass(log.level)"
                    style="white-space: pre-wrap; word-break: break-word;"
                  >
                    [{{ formatDate(log.timestamp, 'time') }}] [{{ log.level.toUpperCase() }}] {{ log.message }}
                  </div>
                </div>
              </div>
            </div>
          </AccordionTab>
        </Accordion>
      </div>
    </template>
  </Card>
</template>

