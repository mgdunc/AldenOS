<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/formatDate'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'

const logs = ref<any[]>([])
const loading = ref(true)
const selectedLog = ref<any>(null)
const showDetailsDialog = ref(false)
const filterText = ref('')

const fetchLogs = async () => {
    loading.value = true
    let query = supabase
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

    if (filterText.value) {
        query = query.or(`message.ilike.%${filterText.value}%,source.ilike.%${filterText.value}%`)
    }

    const { data, error } = await query
    
    if (!error && data) {
        logs.value = data
    }
    loading.value = false
}

const getSeverity = (level: string) => {
    switch (level) {
        case 'ERROR': return 'danger'
        case 'WARN': return 'warning'
        case 'INFO': return 'info'
        case 'DEBUG': return 'secondary'
        default: return 'secondary'
    }
}

const viewDetails = (log: any) => {
    selectedLog.value = log
    showDetailsDialog.value = true
}

const refresh = () => {
    fetchLogs()
}

onMounted(() => {
    fetchLogs()
})
</script>

<template>
    <div class="flex flex-column gap-4 h-full">
        <div class="flex justify-content-between align-items-center">
            <h1 class="text-3xl font-bold m-0">System Logs</h1>
            <div class="flex gap-2">
                <span class="p-input-icon-left">
                    <i class="pi pi-search" />
                    <InputText v-model="filterText" placeholder="Search logs..." @keydown.enter="fetchLogs" />
                </span>
                <Button icon="pi pi-refresh" label="Refresh" @click="refresh" :loading="loading" />
            </div>
        </div>

        <div class="surface-card p-4 shadow-2 border-round flex-grow-1 overflow-hidden flex flex-column">
            <DataTable 
                :value="logs" 
                :loading="loading" 
                scrollable 
                scrollHeight="flex" 
                stripedRows 
                class="p-datatable-sm"
                v-model:selection="selectedLog"
                selectionMode="single"
                @rowSelect="viewDetails(selectedLog)"
            >
                <Column field="created_at" header="Time" style="width: 12rem">
                    <template #body="{ data }">
                        {{ formatDate(data.created_at) }}
                    </template>
                </Column>
                <Column field="level" header="Level" style="width: 6rem">
                    <template #body="{ data }">
                        <Tag :value="data.level" :severity="getSeverity(data.level)" />
                    </template>
                </Column>
                <Column field="source" header="Source" style="width: 15rem" class="font-medium" />
                <Column field="message" header="Message" />
                <Column header="" style="width: 4rem">
                    <template #body="{ data }">
                        <Button icon="pi pi-eye" text rounded severity="secondary" @click.stop="viewDetails(data)" />
                    </template>
                </Column>
            </DataTable>
        </div>

        <Dialog v-model:visible="showDetailsDialog" header="Log Details" modal :style="{ width: '50vw' }">
            <div v-if="selectedLog" class="flex flex-column gap-3">
                <div class="grid">
                    <div class="col-3 font-bold text-500">Timestamp</div>
                    <div class="col-9">{{ formatDate(selectedLog.created_at) }}</div>
                    
                    <div class="col-3 font-bold text-500">Level</div>
                    <div class="col-9"><Tag :value="selectedLog.level" :severity="getSeverity(selectedLog.level)" /></div>
                    
                    <div class="col-3 font-bold text-500">Source</div>
                    <div class="col-9 font-mono text-sm surface-100 p-1 border-round">{{ selectedLog.source }}</div>
                    
                    <div class="col-3 font-bold text-500">Message</div>
                    <div class="col-9">{{ selectedLog.message }}</div>
                </div>

                <div class="flex flex-column gap-2">
                    <span class="font-bold text-500">JSON Details</span>
                    <pre class="surface-900 text-0 p-3 border-round overflow-auto text-sm" style="max-height: 300px">{{ JSON.stringify(selectedLog.details, null, 2) }}</pre>
                </div>
            </div>
            <template #footer>
                <Button label="Close" icon="pi pi-times" text @click="showDetailsDialog = false" />
            </template>
        </Dialog>
    </div>
</template>
