<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { FilterMatchMode } from '@primevue/core/api'

// Import Helpers
import { formatDate } from '@/lib/formatDate'
import { getStatusSeverity } from '@/lib/statusHelpers'
import { formatCurrency } from '@/lib/formatCurrency'

// PrimeVue Components
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import ProgressBar from 'primevue/progressbar'
import Badge from 'primevue/badge'

const router = useRouter()
const toast = useToast()

const orders = ref<any[]>([])
const loading = ref(true)
const creatingOrder = ref(false)
const expandedRows = ref([])
const activeTab = ref('all')

const filters = ref({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS }
})

// KPI Counters
const kpis = computed(() => {
    return {
        draft: orders.value.filter(o => o.status === 'draft').length,
        placed: orders.value.filter(o => o.status === 'placed').length,
        partial: orders.value.filter(o => o.status === 'partial_received').length,
        all: orders.value.length
    }
})

// Tab Filtering Logic
const filteredOrders = computed(() => {
    if (activeTab.value === 'all') return orders.value
    if (activeTab.value === 'active') {
        return orders.value.filter(o => !['received', 'cancelled'].includes(o.status))
    }
    if (activeTab.value === 'draft') return orders.value.filter(o => o.status === 'draft')
    if (activeTab.value === 'placed') return orders.value.filter(o => o.status === 'placed' || o.status === 'partial_received')
    if (activeTab.value === 'received') return orders.value.filter(o => o.status === 'received')
    return orders.value
})

const fetchOrders = async () => {
    loading.value = true
    // Fetch POs + Line Items for the preview/progress calculation
    const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
            *,
            purchase_order_lines (
                id,
                quantity_ordered,
                quantity_received,
                products (sku, name)
            )
        `)
        .order('created_at', { ascending: false })
    
    if (error) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to fetch orders' })
    } else {
        orders.value = (data || []).map(po => ({
            ...po,
            item_count: po.purchase_order_lines.length,
            receipt_pct: calculateReceiptProgress(po.purchase_order_lines)
        }))
    }
    loading.value = false
}

const calculateReceiptProgress = (lines: any[]) => {
    if (!lines || lines.length === 0) return 0
    const totalOrdered = lines.reduce((sum, l) => sum + l.quantity_ordered, 0)
    const totalReceived = lines.reduce((sum, l) => sum + (l.quantity_received || 0), 0)
    if (totalOrdered === 0) return 0
    return Math.round((totalReceived / totalOrdered) * 100)
}

const createDraftOrder = async () => {
    creatingOrder.value = true
    const { data, error } = await supabase
        .from('purchase_orders')
        .insert({ supplier_name: 'New Supplier', status: 'draft' })
        .select().single()

    creatingOrder.value = false
    if (error) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message })
    } else {
        toast.add({ severity: 'success', summary: 'Created', detail: 'Draft PO created.' })
        router.push(`/purchases/${data.id}`)
    }
}

onMounted(fetchOrders)
</script>

<template>
    <div class="flex flex-column gap-4">
        
        <div class="grid">
            <div class="col-12 md:col-3">
                <div class="surface-card shadow-2 p-3 border-round flex justify-content-between align-items-center h-full cursor-pointer hover:surface-50 transition-colors" @click="activeTab = 'draft'">
                    <div>
                        <span class="block text-500 font-medium mb-2">Draft POs</span>
                        <div class="text-900 font-bold text-2xl">{{ kpis.draft }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center bg-gray-100 border-round" style="width:2.5rem;height:2.5rem">
                        <i class="pi pi-file-edit text-gray-500 text-xl"></i>
                    </div>
                </div>
            </div>
            <div class="col-12 md:col-3">
                <div class="surface-card shadow-2 p-3 border-round flex justify-content-between align-items-center h-full cursor-pointer hover:surface-50 transition-colors" @click="activeTab = 'placed'">
                    <div>
                        <span class="block text-500 font-medium mb-2">On Order</span>
                        <div class="text-900 font-bold text-2xl">{{ kpis.placed }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center bg-blue-100 border-round" style="width:2.5rem;height:2.5rem">
                        <i class="pi pi-send text-blue-500 text-xl"></i>
                    </div>
                </div>
            </div>
            <div class="col-12 md:col-3">
                <div class="surface-card shadow-2 p-3 border-round flex justify-content-between align-items-center h-full cursor-pointer hover:surface-50 transition-colors" @click="activeTab = 'placed'">
                    <div>
                        <span class="block text-500 font-medium mb-2">Partially Received</span>
                        <div class="text-900 font-bold text-2xl">{{ kpis.partial }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center bg-orange-100 border-round" style="width:2.5rem;height:2.5rem">
                        <i class="pi pi-box text-orange-500 text-xl"></i>
                    </div>
                </div>
            </div>
            <div class="col-12 md:col-3">
                <div class="surface-card shadow-2 p-3 border-round flex justify-content-between align-items-center h-full cursor-pointer hover:surface-50 transition-colors" @click="activeTab = 'all'">
                    <div>
                        <span class="block text-500 font-medium mb-2">All Orders</span>
                        <div class="text-900 font-bold text-2xl">{{ kpis.all }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center bg-purple-100 border-round" style="width:2.5rem;height:2.5rem">
                        <i class="pi pi-list text-purple-500 text-xl"></i>
                    </div>
                </div>
            </div>
        </div>

        <div class="card shadow-2 p-0 border-round overflow-hidden surface-card">
            
            <div class="p-3 border-bottom-1 surface-border flex flex-wrap gap-2 justify-content-between align-items-center">
                <div class="flex gap-2">
                    <Button label="All" size="small" :outlined="activeTab !== 'all'" @click="activeTab = 'all'" />
                    <Button label="Active" size="small" severity="info" :outlined="activeTab !== 'active'" @click="activeTab = 'active'" />
                    <Button label="Drafts" size="small" severity="secondary" :outlined="activeTab !== 'draft'" @click="activeTab = 'draft'" />
                    <Button label="In Transit" size="small" severity="warning" :outlined="activeTab !== 'placed'" @click="activeTab = 'placed'" />
                    <Button label="Received" size="small" severity="success" :outlined="activeTab !== 'received'" @click="activeTab = 'received'" />
                </div>

                <div class="flex gap-2">
                    <span class="p-input-icon-left">
                        <i class="pi pi-search" />
                        <InputText v-model="filters['global'].value" placeholder="Search POs..." class="p-inputtext-sm" />
                    </span>
                    <Button icon="pi pi-refresh" outlined rounded @click="fetchOrders" :loading="loading" />
                    <Button label="New PO" icon="pi pi-plus" @click="createDraftOrder" :loading="creatingOrder" />
                </div>
            </div>

            <DataTable 
                v-model:expandedRows="expandedRows"
                :value="filteredOrders" 
                stripedRows 
                :loading="loading" 
                paginator 
                :rows="10" 
                :filters="filters"
                selectionMode="single" 
                dataKey="id"
                @rowSelect="e => router.push(`/purchases/${e.data.id}`)"
            >
                <template #empty>No purchase orders found.</template>

                <Column expander style="width: 3rem" />
                
                <Column field="po_number" header="PO #" sortable class="font-bold text-primary cursor-pointer white-space-nowrap" />
                
                <Column field="supplier_name" header="Supplier" sortable />
                
                <Column field="status" header="Status" sortable>
                    <template #body="{ data }">
                        <Tag :value="data.status?.toUpperCase().replace('_', ' ')" :severity="getStatusSeverity(data.status)" class="text-xs" />
                    </template>
                </Column>

                <Column field="item_count" header="Items" class="text-center">
                    <template #body="{ data }">
                        <Badge :value="data.item_count" severity="secondary"></Badge>
                    </template>
                </Column>
                
                <Column field="expected_date" header="Expected" sortable>
                    <template #body="{ data }">
                        <span v-if="data.expected_date" class="text-sm font-medium">{{ formatDate(data.expected_date) }}</span>
                        <span v-else class="text-300">-</span>
                    </template>
                </Column>

                <Column header="Received" style="width: 8rem">
                    <template #body="{ data }">
                        <ProgressBar :value="data.receipt_pct" :showValue="false" style="height: 6px" 
                            :class="data.receipt_pct === 100 ? 'bg-green-100' : 'bg-gray-200'">
                        </ProgressBar>
                        <div class="text-xs text-500 mt-1 text-center">{{ data.receipt_pct }}%</div>
                    </template>
                </Column>
                
                <Column header="" style="width: 4rem">
                    <template #body>
                        <i class="pi pi-angle-right text-500"></i>
                    </template>
                </Column>

                <template #expansion="{ data }">
                    <div class="p-3 surface-50 border-bottom-1 surface-border">
                        <span class="font-bold block mb-2 text-sm text-500">PO Contents</span>
                        <DataTable :value="data.purchase_order_lines" size="small" class="p-datatable-sm">
                            <Column field="products.sku" header="SKU" />
                            <Column field="products.name" header="Product" />
                            <Column field="quantity_ordered" header="Ordered" />
                            <Column field="quantity_received" header="Received">
                                <template #body="{ data: line }">
                                    <span :class="line.quantity_received > 0 ? 'text-green-600 font-bold' : 'text-400'">
                                        {{ line.quantity_received || 0 }}
                                    </span>
                                </template>
                            </Column>
                        </DataTable>
                    </div>
                </template>
            </DataTable>
        </div>
    </div>
</template>