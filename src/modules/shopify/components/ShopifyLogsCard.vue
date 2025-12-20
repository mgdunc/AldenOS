<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Button from 'primevue/button'

const props = defineProps<{
  integrationId: string
}>()

const logs = ref<any[]>([])
const loading = ref(false)

const fetchLogs = async () => {
  if (!props.integrationId) return

  loading.value = true
  let query = supabase
    .from('integration_logs')
    .select('*')
    .eq('integration_id', props.integrationId)
    .order('created_at', { ascending: false })
    .limit(50)

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
    case 'warning': return 'warning'
    case 'success': return 'success'
    default: return 'info'
  }
}

onMounted(() => {
  fetchLogs()
})
</script>

<template>
  <div class="card p-4 border-1 surface-border border-round mt-4">
    <div class="flex align-items-center justify-content-between mb-3">
      <h3 class="text-xl font-bold m-0">Integration Logs</h3>
      <Button icon="pi pi-refresh" text rounded @click="fetchLogs" :loading="loading" />
    </div>

    <DataTable :value="logs" :loading="loading" size="small" stripedRows paginator :rows="5">
      <template #empty>No logs found.</template>
      
      <Column field="created_at" header="Time" style="width: 20%">
        <template #body="slotProps">
          {{ new Date(slotProps.data.created_at).toLocaleString() }}
        </template>
      </Column>
      
      <Column field="event_type" header="Event" style="width: 20%">
        <template #body="slotProps">
          <span class="font-semibold">{{ slotProps.data.event_type }}</span>
        </template>
      </Column>

      <Column field="level" header="Status" style="width: 15%">
        <template #body="slotProps">
          <Tag :value="slotProps.data.level" :severity="getSeverity(slotProps.data.level)" />
        </template>
      </Column>

      <Column field="message" header="Message"></Column>
    </DataTable>
  </div>
</template>
