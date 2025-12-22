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
</script>

<template>
  <div class="surface-card shadow-2 border-round p-4">
    <div class="flex align-items-center justify-content-between mb-4">
      <div>
        <h3 class="text-xl font-semibold m-0 mb-2"><i class="pi pi-sync mr-2"></i>Product Synchronization</h3>
        <p class="text-sm text-600 m-0">Fetch and match products from Shopify by SKU</p>
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

    <div v-if="isRunning && currentJob" class="surface-100 p-3 border-round mb-4">
        <div class="flex justify-content-between mb-2 text-sm">
            <span class="font-semibold">Progress: {{ currentJob.processed_items || 0 }} / {{ currentJob.total_items || '?' }}</span>
            <Tag :value="currentJob.status" :severity="getStatusSeverity(currentJob.status)" size="small" />
        </div>
        <ProgressBar :value="progressPercentage" style="height: 12px"></ProgressBar>
    </div>

    <div v-if="liveLogs.length > 0" class="mb-4">
      <div class="flex justify-content-between align-items-center mb-2">
        <span class="font-semibold text-sm">Live Logs</span>
        <Button icon="pi pi-times" text rounded size="small" @click="clearLogs" />
      </div>
      <div class="surface-50 border-1 surface-border p-3 border-round font-mono text-xs" style="max-height: 250px; overflow-y: auto; background-color: #1e1e1e; color: #d4d4d4;" id="log-container">
        <div v-for="(log, index) in liveLogs" :key="index" class="mb-1" style="white-space: pre-wrap; word-break: break-word;">{{ log }}</div>
      </div>
    </div>

    <div class="flex align-items-center gap-2 mb-3">
      <i class="pi pi-history text-xl"></i>
      <h4 class="m-0">Sync History</h4>
    </div>
    <DataTable :value="history" :loading="loadingHistory" size="small" stripedRows>
      <template #empty>No sync history found.</template>
      
      <Column field="created_at" header="Date" style="width: 25%">
        <template #body="slotProps">
          {{ new Date(slotProps.data.created_at).toLocaleString() }}
        </template>
      </Column>
      <Column field="status" header="Status" style="width: 15%">
        <template #body="slotProps">
          <Tag :value="slotProps.data.status" :severity="getStatusSeverity(slotProps.data.status)" />
        </template>
      </Column>
      <Column field="processed_items" header="Processed" style="width: 15%">
        <template #body="slotProps">
          {{ slotProps.data.processed_items || 0 }}
        </template>
      </Column>
      <Column field="matched_items" header="Matched" style="width: 15%">
        <template #body="slotProps">
          {{ slotProps.data.matched_items || 0 }}
        </template>
      </Column>
      <Column field="error_message" header="Error" style="width: 30%">
        <template #body="slotProps">
          <span v-if="slotProps.data.error_message" class="text-sm text-500">{{ slotProps.data.error_message }}</span>
        </template>
      </Column>
    </DataTable>
  </div>
</template>
