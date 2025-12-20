<script setup lang="ts">
/**
 * Inventory Ledger View
 * Displays a chronological history of all inventory movements (physical and allocations).
 * Useful for auditing stock changes and debugging reservation logic.
 */
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { FilterMatchMode } from '@primevue/core/api'

// PrimeVue Components
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'

const toast = useToast()
const ledger = ref<any[]>([])
const loading = ref(true)

// Filters for the DataTable
const filters = ref({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS }
})

/**
 * Formats a timestamp into a readable local date string
 */
const formatDate = (dateStr: string) => {
    return dateStr ? new Date(dateStr).toLocaleString() : '-'
}

/**
 * Determines the color severity for the transaction type tag
 */
const getTypeSeverity = (type: string) => {
    switch (type?.toLowerCase()) {
        case 'purchase': 
        case 'po_received': 
        case 'po_placed': return 'success'
        case 'sale': 
        case 'reserved': 
        case 'unreserved': return 'danger'
        case 'adjustment': return 'warn'
        case 'transfer': return 'info'
        default: return 'secondary'
    }
}

/**
 * Generates a router link based on the reference ID and transaction type.
 * Links to Sales Orders or Purchase Orders.
 */
const getReferenceLink = (data: any) => {
    if (!data.reference_id) return null;
    const type = data.transaction_type?.toLowerCase();
    
    // Sales Links
    if (['sale', 'reserved', 'unreserved', 'picking', 'shipped', 'cancelled'].includes(type)) {
        return `/sales/${data.reference_id}`;
    }
    
    // Purchase Links
    if (['purchase', 'po_placed', 'po_received'].includes(type)) {
        return `/purchases/${data.reference_id}`;
    }
    
    return null;
}

/**
 * Fetches the latest 500 ledger entries from Supabase.
 * Includes related Product and Location data.
 */
const fetchLedger = async () => {
    loading.value = true
    
    const { data, error } = await supabase
        .from('inventory_ledger')
        .select(`
            *,
            products ( sku, name ),
            locations ( name )
        `)
        .order('created_at', { ascending: false })
        .limit(500)

    if (error) {
        console.error('Error fetching ledger:', error)
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load ledger.' })
    } else {
        ledger.value = data || []
    }
    loading.value = false
}

onMounted(() => {
    fetchLedger()
})
</script>

<template>
    <div class="flex flex-column gap-4">
        
        <!-- Header Section -->
        <div class="surface-card p-4 shadow-2 border-round flex flex-column md:flex-row justify-content-between align-items-center gap-3">
            <div class="flex align-items-center gap-3">
                <i class="pi pi-list text-4xl text-primary"></i>
                <div>
                    <div class="text-500 text-sm font-medium mb-1">Audit Log</div>
                    <h1 class="text-3xl font-bold m-0 text-900">Inventory Ledger</h1>
                </div>
            </div>
            <div class="flex gap-2">
                <Button icon="pi pi-refresh" label="Refresh" @click="fetchLedger" :loading="loading" severity="secondary" outlined />
                <Button icon="pi pi-download" label="Export" severity="secondary" outlined disabled v-tooltip="'Coming Soon'" />
            </div>
        </div>

        <!-- Ledger Table -->
        <div class="card shadow-2 p-0 border-round overflow-hidden surface-card">
            <DataTable 
                v-model:filters="filters"
                :value="ledger" 
                stripedRows 
                paginator 
                :rows="15" 
                :loading="loading"
                size="small"
                sortField="created_at" 
                :sortOrder="-1"
                :globalFilterFields="['products.sku', 'products.name', 'transaction_type', 'reference_id', 'notes']"
                showGridlines
            >
                <template #header>
                    <div class="flex justify-content-between align-items-center">
                        <span class="text-xl font-bold text-700">Recent Transactions</span>
                        <IconField iconPosition="left">
                            <InputIcon class="pi pi-search" />
                            <InputText v-model="filters['global'].value" placeholder="Search SKU, Ref, Notes..." class="w-20rem" />
                        </IconField>
                    </div>
                </template>

                <template #empty>
                    <div class="text-center p-4">
                        <i class="pi pi-folder-open text-5xl text-300 mb-3"></i>
                        <div class="text-700">No records found.</div>
                    </div>
                </template>

                <!-- Timestamp -->
                <Column field="created_at" header="Timestamp" sortable style="width: 12rem">
                    <template #body="{ data }">
                        <span class="text-sm text-700 font-medium">{{ formatDate(data.created_at) }}</span>
                    </template>
                </Column>

                <!-- Transaction Type -->
                <Column field="transaction_type" header="Type" sortable style="width: 10rem">
                    <template #body="{ data }">
                        <Tag :value="data.transaction_type?.toUpperCase()" :severity="getTypeSeverity(data.transaction_type)" class="text-xs" />
                    </template>
                </Column>

                <!-- Product Info -->
                <Column field="products.sku" header="Product" sortable style="min-width: 14rem">
                    <template #body="{ data }">
                        <div class="flex flex-column">
                            <span class="font-bold text-primary">{{ data.products?.sku }}</span>
                            <span class="text-sm text-500">{{ data.products?.name }}</span>
                        </div>
                    </template>
                </Column>

                <!-- Location -->
                <Column field="locations.name" header="Location" sortable style="width: 10rem">
                    <template #body="{ data }">
                        <div class="flex align-items-center gap-2">
                            <i class="pi pi-map-marker text-500"></i>
                            <span>{{ data.locations?.name || 'Unknown' }}</span>
                        </div>
                    </template>
                </Column>

                <!-- Physical Change (QOH) -->
                <Column field="change_qoh" header="Physical" sortable style="width: 8rem" class="text-right">
                    <template #body="{ data }">
                        <span :class="{
                            'text-green-600 font-bold': data.change_qoh > 0,
                            'text-red-500 font-bold': data.change_qoh < 0,
                            'text-400': data.change_qoh === 0
                        }" class="text-lg">
                            {{ data.change_qoh > 0 ? '+' : '' }}{{ data.change_qoh }}
                        </span>
                    </template>
                </Column>

                <!-- Reserved Change -->
                <Column field="change_reserved" header="Reserved" sortable style="width: 8rem" class="text-right">
                    <template #body="{ data }">
                         <span :class="{
                            'text-orange-500 font-bold': data.change_reserved > 0,
                            'text-green-600 font-bold': data.change_reserved < 0,
                            'text-400': !data.change_reserved
                        }" class="text-lg">
                            {{ data.change_reserved > 0 ? '+' : '' }}{{ data.change_reserved || 0 }}
                        </span>
                    </template>
                </Column>

                <!-- Net Available Change -->
                <Column header="Net Avail" style="width: 8rem" class="text-right surface-50">
                    <template #body="{ data }">
                        <span :class="{
                            'text-green-600 font-bold': (data.change_qoh - (data.change_reserved || 0)) > 0,
                            'text-red-500 font-bold': (data.change_qoh - (data.change_reserved || 0)) < 0,
                            'text-400': (data.change_qoh - (data.change_reserved || 0)) === 0
                        }" class="text-lg">
                             {{ (data.change_qoh - (data.change_reserved || 0)) > 0 ? '+' : '' }}{{ data.change_qoh - (data.change_reserved || 0) }}
                        </span>
                    </template>
                </Column>

                <!-- Reference Link -->
                <Column field="reference_id" header="Reference" style="width: 10rem">
                    <template #body="{ data }">
                        <router-link 
                            v-if="getReferenceLink(data)"
                            :to="getReferenceLink(data)"
                            class="text-primary hover:underline font-mono text-sm no-underline flex align-items-center gap-1"
                            :title="data.reference_id"
                        >
                            <i class="pi pi-external-link text-xs"></i>
                            <span class="white-space-nowrap overflow-hidden text-overflow-ellipsis" style="max-width: 8rem;">
                                {{ data.reference_id }}
                            </span>
                        </router-link>
                        <span 
                            v-else 
                            class="text-sm font-mono text-500"
                        >
                            {{ data.reference_id || '-' }}
                        </span>
                    </template>
                </Column>

                <!-- Notes -->
                <Column field="notes" header="Notes" style="min-width: 15rem;">
                    <template #body="{ data }">
                        <span class="text-sm text-600">{{ data.notes }}</span>
                    </template>
                </Column>

            </DataTable>
        </div>
    </div>
</template>