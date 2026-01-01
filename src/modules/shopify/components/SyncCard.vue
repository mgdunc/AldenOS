<script setup lang="ts">
import { computed } from 'vue'
import Card from 'primevue/card'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Divider from 'primevue/divider'
import { useShopifySync, type SyncType } from '../composables/useShopifySync'

const props = defineProps<{
  type: SyncType
  title: string
  icon: string
  description?: string
}>()

const { 
  syncing, 
  currentSync, 
  history, 
  progress, 
  statusSeverity, 
  stats, 
  startSync,
  formatSyncDate,
  getDuration
} = useShopifySync(props.type)

const syncLabel = computed(() => {
  if (syncing.value) {
    return `Syncing${progress.value > 0 ? ` (${progress.value}%)` : '...'}`
  }
  return 'Start Sync'
})

const getStatusSeverity = (status: string) => {
  switch (status) {
    case 'running': return 'info'
    case 'completed': return 'success'
    case 'failed': return 'danger'
    default: return 'secondary'
  }
}
</script>

<template>
  <Card>
    <template #title>
      <div class="flex align-items-center justify-content-between">
        <div class="flex align-items-center gap-2">
          <i :class="`pi ${icon} text-primary`"></i>
          <span>{{ title }}</span>
        </div>
        <Tag 
          v-if="currentSync && syncing" 
          :value="currentSync.status" 
          :severity="statusSeverity"
        />
      </div>
    </template>
    
    <template #content>
      <div v-if="description" class="text-sm text-600 mb-3">
        {{ description }}
      </div>

      <!-- Progress Section (when syncing) -->
      <div v-if="syncing && currentSync" class="mb-4">
        <ProgressBar :value="progress" />
        
        <div v-if="stats" class="grid mt-3 text-sm">
          <div class="col-6 md:col-3 text-center">
            <div class="font-semibold text-600">Processed</div>
            <div class="text-2xl font-bold text-primary">{{ stats.processed }}</div>
          </div>
          <div class="col-6 md:col-3 text-center">
            <div class="font-semibold text-600">Created</div>
            <div class="text-2xl font-bold text-success">{{ stats.created }}</div>
          </div>
          <div class="col-6 md:col-3 text-center">
            <div class="font-semibold text-600">Updated</div>
            <div class="text-2xl font-bold text-blue-500">{{ stats.updated }}</div>
          </div>
          <div class="col-6 md:col-3 text-center">
            <div class="font-semibold text-600">Errors</div>
            <div class="text-2xl font-bold" :class="stats.errors > 0 ? 'text-danger' : 'text-500'">
              {{ stats.errors }}
            </div>
          </div>
        </div>
      </div>

      <!-- Error Message -->
      <div v-if="currentSync?.error_message" class="p-3 surface-ground border-round mb-3">
        <div class="flex align-items-start gap-2">
          <i class="pi pi-exclamation-triangle text-danger"></i>
          <div class="flex-1">
            <div class="font-semibold text-danger mb-1">Error</div>
            <div class="text-sm">{{ currentSync.error_message }}</div>
          </div>
        </div>
      </div>

      <!-- Sync Button -->
      <Button 
        :label="syncLabel"
        :icon="syncing ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'"
        :disabled="syncing"
        @click="startSync"
        class="w-full"
        :severity="syncing ? 'secondary' : 'primary'"
      />

      <!-- History Section -->
      <div v-if="history.length > 0" class="mt-4">
        <Divider />
        
        <div class="flex align-items-center justify-content-between mb-3">
          <h4 class="m-0">Recent Syncs</h4>
          <span class="text-sm text-600">Last 10 syncs</span>
        </div>

        <DataTable 
          :value="history" 
          size="small"
          :rows="5"
          :paginator="history.length > 5"
          stripedRows
        >
          <Column field="started_at" header="Date" style="width: 180px">
            <template #body="{ data }">
              <span class="text-sm">{{ formatSyncDate(data.started_at) }}</span>
            </template>
          </Column>
          
          <Column field="status" header="Status" style="width: 120px">
            <template #body="{ data }">
              <Tag 
                :value="data.status" 
                :severity="getStatusSeverity(data.status)"
                class="text-xs"
              />
            </template>
          </Column>
          
          <Column header="Results" style="width: 200px">
            <template #body="{ data }">
              <div class="text-sm">
                <span class="text-success font-semibold">{{ data.created_count || 0 }}</span> created,
                <span class="text-blue-500 font-semibold ml-1">{{ data.updated_count || 0 }}</span> updated
                <span v-if="data.error_count > 0" class="text-danger font-semibold ml-1">
                  , {{ data.error_count }} errors
                </span>
              </div>
            </template>
          </Column>
          
          <Column header="Duration" style="width: 100px">
            <template #body="{ data }">
              <span class="text-sm text-600">{{ getDuration(data) }}</span>
            </template>
          </Column>
        </DataTable>
      </div>

      <!-- Empty State -->
      <div v-else class="text-center py-4 text-500">
        <i class="pi pi-info-circle text-4xl mb-2 block text-300"></i>
        <p class="text-sm m-0">No sync history yet. Click "Start Sync" to begin.</p>
      </div>
    </template>
  </Card>
</template>
