<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { formatDate, formatDateTime } from '@/lib/formatDate'
import { useRealtime } from '@/composables/useRealtime'
import { logger } from '@/lib/logger'
import { useToast } from 'primevue/usetoast'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Dropdown from 'primevue/dropdown'
import ToggleButton from 'primevue/togglebutton'
import Badge from 'primevue/badge'

const logs = ref<any[]>([])
const loading = ref(true)
const selectedLog = ref<any>(null)
const showDetailsDialog = ref(false)
const filterText = ref('')
const filterLevel = ref<string | null>(null)
const autoRefresh = ref(false)
const refreshInterval = ref<NodeJS.Timeout | null>(null)
const totalCount = ref(0)
const currentPage = ref(0)
const rowsPerPage = ref(50)

const { subscribe, unsubscribe } = useRealtime()
const toast = useToast()

const levelOptions = [
    { label: 'All Levels', value: null },
    { label: 'Error', value: 'ERROR' },
    { label: 'Warning', value: 'WARN' },
    { label: 'Info', value: 'INFO' },
    { label: 'Debug', value: 'DEBUG' }
]

const filteredLogs = computed(() => {
    let filtered = logs.value

    if (filterLevel.value) {
        filtered = filtered.filter(log => log.level === filterLevel.value)
    }

    if (filterText.value) {
        const search = filterText.value.toLowerCase()
        filtered = filtered.filter(log =>
            log.message?.toLowerCase().includes(search) ||
            log.source?.toLowerCase().includes(search)
        )
    }

    return filtered
})

const logStats = computed(() => {
    return {
        total: logs.value.length,
        errors: logs.value.filter(l => l.level === 'ERROR').length,
        warnings: logs.value.filter(l => l.level === 'WARN').length,
        info: logs.value.filter(l => l.level === 'INFO').length,
        debug: logs.value.filter(l => l.level === 'DEBUG').length
    }
})

const fetchLogs = async () => {
    loading.value = true
    try {
        let query = supabase
            .from('system_logs')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .limit(rowsPerPage.value)

        if (filterLevel.value) {
            query = query.eq('level', filterLevel.value)
        }

        if (filterText.value) {
            query = query.or(`message.ilike.%${filterText.value}%,source.ilike.%${filterText.value}%`)
        }

        const { data, error, count } = await query
        
        if (error) {
            logger.error('Error fetching logs', error)
            return
        }
        
        if (data) {
            logs.value = data
            totalCount.value = count || 0
        }
    } catch (error) {
        logger.error('Error fetching logs', error as Error)
    } finally {
        loading.value = false
    }
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

const copyLogToClipboard = async () => {
    if (!selectedLog.value) return

    try {
        // Format the entire log entry as a readable string
        const userInfo = selectedLog.value.details?.userEmail 
          ? `${selectedLog.value.details.userEmail} (${selectedLog.value.user_id || 'N/A'})`
          : selectedLog.value.user_id || 'Not available'
        
        const logText = `System Log Entry
================
Timestamp: ${formatDateTime(selectedLog.value.created_at)} (${new Date(selectedLog.value.created_at).toISOString()})
Level: ${selectedLog.value.level}
Source: ${selectedLog.value.source}
User: ${userInfo}
Message: ${selectedLog.value.message}

Details:
${JSON.stringify(selectedLog.value.details, null, 2)}`

        // Copy to clipboard
        await navigator.clipboard.writeText(logText)
        
        toast.add({
            severity: 'success',
            summary: 'Copied',
            detail: 'Log entry copied to clipboard',
            life: 2000
        })
    } catch (error: any) {
        logger.error('Failed to copy log to clipboard', error)
        toast.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to copy to clipboard',
            life: 2000
        })
    }
}

const refresh = () => {
    fetchLogs()
}

const clearFilter = () => {
    filterText.value = ''
    filterLevel.value = null
    fetchLogs()
}

const exportLogs = () => {
    const dataStr = JSON.stringify(filteredLogs.value, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `system-logs-${new Date().toISOString()}.json`
    link.click()
    URL.revokeObjectURL(url)
}

const toggleAutoRefresh = () => {
    if (autoRefresh.value) {
        refreshInterval.value = setInterval(() => {
            fetchLogs()
        }, 5000) // Refresh every 5 seconds
    } else {
        if (refreshInterval.value) {
            clearInterval(refreshInterval.value)
            refreshInterval.value = null
        }
    }
}

// Set up realtime subscription for new logs
const setupRealtime = () => {
    subscribe('system-logs-realtime', {
        table: 'system_logs',
        event: 'INSERT',
        callback: (payload) => {
            // Add new log to the beginning of the array
            if (payload.new) {
                logs.value.unshift(payload.new as any)
                // Keep only the most recent logs
                if (logs.value.length > rowsPerPage.value) {
                    logs.value = logs.value.slice(0, rowsPerPage.value)
                }
            }
        }
    })
}

onMounted(() => {
    fetchLogs()
    setupRealtime()
})

onUnmounted(() => {
    unsubscribe()
    if (refreshInterval.value) {
        clearInterval(refreshInterval.value)
    }
})
</script>

<template>
    <div class="flex flex-column gap-4 h-full">
        <div class="flex justify-content-between align-items-center">
            <div class="flex flex-column gap-2">
                <h1 class="text-3xl font-bold m-0">System Logs</h1>
                <div class="flex gap-3 align-items-center">
                    <Badge :value="logStats.total" severity="secondary" />
                    <Badge :value="logStats.errors" severity="danger" />
                    <Badge :value="logStats.warnings" severity="warning" />
                    <Badge :value="logStats.info" severity="info" />
                    <Badge :value="logStats.debug" severity="secondary" />
                </div>
            </div>
            <div class="flex gap-2">
                <Button 
                    icon="pi pi-download" 
                    label="Export" 
                    severity="secondary" 
                    outlined
                    @click="exportLogs"
                    :disabled="filteredLogs.length === 0"
                />
                <Button icon="pi pi-refresh" label="Refresh" @click="refresh" :loading="loading" />
            </div>
        </div>

        <!-- Filters -->
        <div class="surface-card p-4 border-round shadow-1">
            <div class="grid">
                <div class="col-12 md:col-6">
                    <span class="p-input-icon-left w-full">
                        <i class="pi pi-search" />
                        <InputText 
                            v-model="filterText" 
                            placeholder="Search by message or source..." 
                            class="w-full"
                            @input="fetchLogs"
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
                        @change="fetchLogs"
                    />
                </div>
                <div class="col-12 md:col-3 flex gap-2 align-items-center">
                    <ToggleButton 
                        v-model="autoRefresh" 
                        onLabel="Auto-refresh ON" 
                        offLabel="Auto-refresh OFF"
                        @change="toggleAutoRefresh"
                    />
                    <Button 
                        v-if="filterText || filterLevel" 
                        icon="pi pi-times" 
                        label="Clear" 
                        text 
                        @click="clearFilter"
                    />
                </div>
            </div>
        </div>

        <div class="surface-card p-4 shadow-2 border-round flex-grow-1 overflow-hidden flex flex-column">
            <DataTable 
                :value="filteredLogs" 
                :loading="loading" 
                scrollable 
                scrollHeight="flex" 
                stripedRows 
                class="p-datatable-sm"
                paginator
                :rows="rowsPerPage"
                :rowsPerPageOptions="[25, 50, 100, 200]"
                v-model:selection="selectedLog"
                selectionMode="single"
                @rowSelect="viewDetails(selectedLog)"
            >
                <Column field="created_at" header="Timestamp" style="width: 18rem">
                    <template #body="{ data }">
                        <div class="text-xs">
                            <div class="font-semibold">{{ formatDateTime(data.created_at) }}</div>
                            <div class="text-500 font-mono">{{ new Date(data.created_at).toISOString() }}</div>
                        </div>
                    </template>
                </Column>
                <Column field="level" header="Level" style="width: 6rem">
                    <template #body="{ data }">
                        <Tag :value="data.level" :severity="getSeverity(data.level)" />
                    </template>
                </Column>
                <Column field="source" header="Source" style="width: 12rem" class="font-medium" />
                <Column header="User" style="width: 12rem">
                    <template #body="{ data }">
                        <div v-if="data.details?.userEmail" class="text-xs">
                            <div class="font-semibold">{{ data.details.userEmail }}</div>
                            <div class="text-500 font-mono text-xxs">{{ data.user_id?.substring(0, 8) }}...</div>
                        </div>
                        <span v-else-if="data.user_id" class="text-xs text-500 font-mono">{{ data.user_id.substring(0, 8) }}...</span>
                        <span v-else class="text-xs text-400">-</span>
                    </template>
                </Column>
                <Column field="message" header="Message" style="min-width: 300px">
                    <template #body="{ data }">
                        <div class="text-sm" style="max-width: 500px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            {{ data.message }}
                        </div>
                    </template>
                </Column>
                <Column header="Actions" style="width: 6rem">
                    <template #body="{ data }">
                        <Button 
                            icon="pi pi-eye" 
                            text 
                            rounded 
                            severity="secondary" 
                            @click.stop="viewDetails(data)"
                            v-tooltip.top="'View details'"
                        />
                    </template>
                </Column>
            </DataTable>
        </div>

        <Dialog v-model:visible="showDetailsDialog" header="Log Details" modal :style="{ width: '50vw' }">
            <div v-if="selectedLog" class="flex flex-column gap-3">
                <div class="grid">
                    <div class="col-3 font-bold text-500">Timestamp</div>
                    <div class="col-9">
                        <div class="font-semibold">{{ formatDateTime(selectedLog.created_at) }}</div>
                        <div class="text-xs text-500 font-mono">{{ new Date(selectedLog.created_at).toISOString() }}</div>
                    </div>
                    
                    <div class="col-3 font-bold text-500">Level</div>
                    <div class="col-9"><Tag :value="selectedLog.level" :severity="getSeverity(selectedLog.level)" /></div>
                    
                    <div class="col-3 font-bold text-500">Source</div>
                    <div class="col-9 font-mono text-sm surface-100 p-1 border-round">{{ selectedLog.source }}</div>
                    
                    <div class="col-3 font-bold text-500">User</div>
                    <div class="col-9">
                        <div v-if="selectedLog.details?.userEmail" class="text-sm">
                            <div class="font-semibold">{{ selectedLog.details.userEmail }}</div>
                            <div class="text-xs text-500 font-mono">{{ selectedLog.user_id || 'N/A' }}</div>
                        </div>
                        <div v-else-if="selectedLog.user_id" class="text-sm font-mono">{{ selectedLog.user_id }}</div>
                        <span v-else class="text-500">Not available</span>
                    </div>
                    
                    <div class="col-3 font-bold text-500">Message</div>
                    <div class="col-9">{{ selectedLog.message }}</div>
                </div>

                <div class="flex flex-column gap-2">
                    <div class="flex justify-content-between align-items-center">
                        <span class="font-bold text-500">JSON Details</span>
                        <Button 
                            icon="pi pi-copy" 
                            label="Copy All" 
                            text 
                            size="small"
                            @click="copyLogToClipboard"
                            v-tooltip.top="'Copy entire log to clipboard'"
                        />
                    </div>
                    <pre class="surface-900 text-0 p-3 border-round overflow-auto text-sm" style="max-height: 300px">{{ JSON.stringify(selectedLog.details, null, 2) }}</pre>
                </div>
            </div>
            <template #footer>
                <Button label="Close" icon="pi pi-times" text @click="showDetailsDialog = false" />
            </template>
        </Dialog>
    </div>
</template>
