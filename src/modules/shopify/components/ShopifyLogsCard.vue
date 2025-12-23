<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import Dropdown from 'primevue/dropdown'
import InputText from 'primevue/inputtext'

const props = defineProps<{
  integrationId: string
}>()

const logs = ref<any[]>([])
const loading = ref(false)
const filterLevel = ref<string | null>(null)
const filterEvent = ref<string | null>(null)
const searchTerm = ref('')

const levelOptions = [
  { label: 'All Levels', value: null },
  { label: 'Error', value: 'error' },
  { label: 'Warning', value: 'warning' },
  { label: 'Info', value: 'info' },
  { label: 'Success', value: 'success' }
]

const eventTypes = computed(() => {
  const types = [...new Set(logs.value.map(log => log.event_type))].filter(Boolean)
  return [{ label: 'All Events', value: null }, ...types.map(t => ({ label: t, value: t }))]
})

const filteredLogs = computed(() => {
  let filtered = logs.value
  
  if (filterLevel.value) {
    filtered = filtered.filter(log => log.level === filterLevel.value)
  }
  
  if (filterEvent.value) {
    filtered = filtered.filter(log => log.event_type === filterEvent.value)
  }
  
  if (searchTerm.value) {
    const search = searchTerm.value.toLowerCase()
    filtered = filtered.filter(log => 
      log.message?.toLowerCase().includes(search) ||
      log.event_type?.toLowerCase().includes(search)
    )
  }
  
  return filtered
})

const fetchLogs = async () => {
  if (!props.integrationId) return

  loading.value = true
  let query = supabase
    .from('integration_logs')
    .select('*')
    .eq('integration_id', props.integrationId)
    .order('created_at', { ascending: false })
    .limit(200)

  const { data, error } = await query

  if (data) {
    logs.value = data
  }
  loading.value = false
}

watch(() => props.integrationId, () => {
  fetchLogs()
})

const getSeverity = (level: string) => {
  switch (level) {
    case 'error': return 'danger'
    case 'warning': return 'warn'
    case 'success': return 'success'
    default: return 'info'
  }
}

const downloadLogs = () => {
  const csv = [
    ['Timestamp', 'Level', 'Event', 'Message'].join(','),
    ...filteredLogs.value.map(log => [
      new Date(log.created_at).toISOString(),
      log.level,
      log.event_type,
      `"${log.message?.replace(/"/g, '""') || ''}"`
    ].join(','))
  ].join('\n')
  
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `shopify-integration-logs-${new Date().toISOString()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const clearFilters = () => {
  filterLevel.value = null
  filterEvent.value = null
  searchTerm.value = ''
}

onMounted(() => {
  fetchLogs()
})
</script>

<template>
  <div class="surface-card border-1 surface-border border-round p-3">
    <div class="flex align-items-center justify-content-between mb-3">
      <div>
        <h3 class="text-lg font-semibold m-0 mb-1 flex align-items-center gap-2">
          <i class="pi pi-list text-primary"></i>
          Activity Logs
        </h3>
        <p class="text-xs text-600 m-0">Detailed integration event logs with filtering and export capabilities.</p>
      </div>
      <div class="flex gap-2">
        <Button icon="pi pi-download" text size="small" @click="downloadLogs" severity="secondary" v-tooltip.top="'Export to CSV'" />
        <Button icon="pi pi-refresh" text size="small" @click="fetchLogs" :loading="loading" v-tooltip.top="'Refresh logs'" />
      </div>
    </div>

    <!-- Filters -->
    <div class="grid mb-3">
      <div class="col-12 md:col-4">
        <span class="p-input-icon-left w-full">
          <i class="pi pi-search"></i>
          <InputText 
            v-model="searchTerm" 
            placeholder="Search logs..." 
            class="w-full" 
            size="small"
          />
        </span>
      </div>
      <div class="col-12 md:col-3">
        <Dropdown 
          v-model="filterLevel" 
          :options="levelOptions" 
          optionLabel="label" 
          optionValue="value"
          placeholder="Filter by level" 
          class="w-full"
          size="small"
        />
      </div>
      <div class="col-12 md:col-3">
        <Dropdown 
          v-model="filterEvent" 
          :options="eventTypes" 
          optionLabel="label" 
          optionValue="value"
          placeholder="Filter by event" 
          class="w-full"
          size="small"
        />
      </div>
      <div class="col-12 md:col-2 flex align-items-center">
        <Button 
          label="Clear" 
          icon="pi pi-filter-slash" 
          text 
          size="small" 
          @click="clearFilters"
          class="w-full"
        />
      </div>
    </div>

    <!-- Stats Row -->
    <div class="grid mb-3" v-if="logs.length > 0">
      <div class="col-3">
        <div class="text-center p-2 surface-100 border-round">
          <div class="text-xl font-bold text-600">{{ filteredLogs.length }}</div>
          <div class="text-xs text-500">Total Logs</div>
        </div>
      </div>
      <div class="col-3">
        <div class="text-center p-2 surface-100 border-round">
          <div class="text-xl font-bold text-red-600">{{ filteredLogs.filter(l => l.level === 'error').length }}</div>
          <div class="text-xs text-500">Errors</div>
        </div>
      </div>
      <div class="col-3">
        <div class="text-center p-2 surface-100 border-round">
          <div class="text-xl font-bold text-yellow-600">{{ filteredLogs.filter(l => l.level === 'warning').length }}</div>
          <div class="text-xs text-500">Warnings</div>
        </div>
      </div>
      <div class="col-3">
        <div class="text-center p-2 surface-100 border-round">
          <div class="text-xl font-bold text-green-600">{{ filteredLogs.filter(l => l.level === 'success').length }}</div>
          <div class="text-xs text-500">Success</div>
        </div>
      </div>
    </div>

    <DataTable :value="filteredLogs" :loading="loading" size="small" stripedRows paginator :rows="10" showGridlines>
      <template #empty>
        <div class="text-center p-3 text-sm text-500">
          <i class="pi pi-inbox text-2xl mb-2"></i>
          <p class="m-0">No logs found. Activity will appear here as the integration runs.</p>
        </div>
      </template>
      
      <Column field="created_at" header="Timestamp" style="width: 18%">
        <template #body="slotProps">
          <div class="text-xs font-mono">
            <div class="font-semibold">{{ new Date(slotProps.data.created_at).toLocaleDateString() }}</div>
            <div class="text-500">{{ new Date(slotProps.data.created_at).toLocaleTimeString() }}</div>
          </div>
        </template>
      </Column>
      
      <Column field="level" header="Level" style="width: 10%">
        <template #body="slotProps">
          <Tag :value="slotProps.data.level.toUpperCase()" :severity="getSeverity(slotProps.data.level)" size="small" />
        </template>
      </Column>

      <Column field="event_type" header="Event Type" style="width: 20%">
        <template #body="slotProps">
          <span class="font-semibold text-sm">{{ slotProps.data.event_type }}</span>
        </template>
      </Column>

      <Column field="message" header="Message" style="width: 52%">
        <template #body="slotProps">
          <div class="text-xs" style="word-break: break-word;">{{ slotProps.data.message }}</div>
        </template>
      </Column>
    </DataTable>
  </div>
</template>