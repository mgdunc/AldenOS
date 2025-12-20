<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { FilterMatchMode } from '@primevue/core/api'

// Helpers
import { formatDate } from '@/lib/formatDate'
import { formatCurrency } from '@/lib/formatCurrency'
import { getStatusSeverity } from '@/lib/statusHelpers'

// PrimeVue Components
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
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
        awaiting: orders.value.filter(o => o.status === 'awaiting_stock' || o.status === 'requires_items').length,
        ready: orders.value.filter(o => o.status === 'reserved' || o.status === 'picking').length,
        shipped: orders.value.filter(o => o.status === 'shipped').length
    }
})

// Tab Filtering
const filteredOrders = computed(() => {
    if (activeTab.value === 'all') return orders.value
    
    if (activeTab.value === 'active') {
        return orders.value.filter(o => !['shipped', 'cancelled'].includes(o.status))
    }
    
    // Filter by specific status group
    if (activeTab.value === 'draft') return orders.value.filter(o => o.status === 'draft')
    if (activeTab.value === 'awaiting') return orders.value.filter(o => ['awaiting_stock', 'requires_items'].includes(o.status))
    if (activeTab.value === 'ready') return orders.value.filter(o => ['reserved', 'picking', 'packed', 'partially_shipped'].includes(o.status))
    
    return orders.value
})

const fetchOrders = async () => {
    loading.value = true
    // Fetch Orders + Line Item Count + Lines (for preview)
    const { data, error } = await supabase
        .from('sales_orders')
        .select(`
            *,
            sales_order_lines (
                id,
                quantity_ordered,
                quantity_fulfilled,
                products (sku, name)
            )
        `)
        .order('created_at', { ascending: false })
        
    if (error) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to fetch orders' })
    } else {
        // Transform data to include simple item count
        orders.value = (data || []).map(order => ({
            ...order,
            item_count: order.sales_order_lines.length,
            // Calculate a simple fulfillment % for the progress bar
            fulfillment_pct: calculateProgress(order.sales_order_lines)
        }))
    }
    loading.value = false
}

const calculateProgress = (lines: any[]) => {
    if (!lines || lines.length === 0) return 0
    const totalOrdered = lines.reduce((sum, l) => sum + l.quantity_ordered, 0)
    const totalShipped = lines.reduce((sum, l) => sum + (l.quantity_fulfilled || 0), 0)
    if (totalOrdered === 0) return 0
    return Math.round((totalShipped / totalOrdered) * 100)
}

const createDraftOrder = async () => {
    creatingOrder.value = true
    const { data, error } = await supabase
        .from('sales_orders')
        .insert({ customer_name: 'New Customer', status: 'draft' })
        .select()
        .single()
    
    creatingOrder.value = false

    if (error) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message })
    } else {
        router.push(`/sales/${data.id}`);
    }
}

const getTabSeverity = (tabKey: string) => {
    return activeTab.value === tabKey ? 'primary' : 'secondary';
}

onMounted(fetchOrders)
</script>

<template>
    <div class="flex flex-column gap-4">
        
        <div class="grid">
            <div class="col-12 md:col-3">
                <div class="surface-card shadow-2 p-3 border-round flex justify-content-between align-items-center h-full cursor-pointer hover:surface-50 transition-colors" @click="activeTab = 'draft'">
                    <div>
                        <span class="block text-500 font-medium mb-2">Drafts</span>
                        <div class="text-900 font-bold text-2xl">{{ kpis.draft }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center bg-gray-100 border-round" style="width:2.5rem;height:2.5rem">
                        <i class="pi pi-file text-gray-500 text-xl"></i>
                    </div>
                </div>
            </div>
            <div class="col-12 md:col-3">
                <div class="surface-card shadow-2 p-3 border-round flex justify-content-between align-items-center h-full cursor-pointer hover:surface-50 transition-colors" @click="activeTab = 'awaiting'">
                    <div>
                        <span class="block text-500 font-medium mb-2">Awaiting Stock</span>
                        <div class="text-900 font-bold text-2xl">{{ kpis.awaiting }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center bg-orange-100 border-round" style="width:2.5rem;height:2.5rem">
                        <i class="pi pi-clock text-orange-500 text-xl"></i>
                    </div>
                </div>
            </div>
            <div class="col-12 md:col-3">
                <div class="surface-card shadow-2 p-3 border-round flex justify-content-between align-items-center h-full cursor-pointer hover:surface-50 transition-colors" @click="activeTab = 'ready'">
                    <div>
                        <span class="block text-500 font-medium mb-2">Ready to Pack</span>
                        <div class="text-900 font-bold text-2xl">{{ kpis.ready }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center bg-green-100 border-round" style="width:2.5rem;height:2.5rem">
                        <i class="pi pi-box text-green-500 text-xl"></i>
                    </div>
                </div>
            </div>
            <div class="col-12 md:col-3">
                <div class="surface-card shadow-2 p-3 border-round flex justify-content-between align-items-center h-full cursor-pointer hover:surface-50 transition-colors" @click="activeTab = 'all'">
                    <div>
                        <span class="block text-500 font-medium mb-2">Total Active</span>
                        <div class="text-900 font-bold text-2xl">{{ kpis.draft + kpis.awaiting + kpis.ready }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center bg-blue-100 border-round" style="width:2.5rem;height:2.5rem">
                        <i class="pi pi-chart-bar text-blue-500 text-xl"></i>
                    </div>
                </div>
            </div>
        </div>

        <div class="card shadow-2 p-0 border-round overflow-hidden surface-card">
            
            <div class="p-3 border-bottom-1 surface-border flex flex-wrap gap-2 justify-content-between align-items-center">
                <div class="flex gap-2">
                    <Button label="All" size="small" :outlined="activeTab !== 'all'" @click="activeTab = 'all'" />
                    <Button label="Active" size="small" :outlined="activeTab !== 'active'" @click="activeTab = 'active'" />
                    <Button label="Awaiting Stock" size="small" severity="warning" :outlined="activeTab !== 'awaiting'" @click="activeTab = 'awaiting'" />
                    <Button label="Ready" size="small" severity="success" :outlined="activeTab !== 'ready'" @click="activeTab = 'ready'" />
                </div>

                <div class="flex gap-2">
                    <span class="p-input-icon-left">
                        <i class="pi pi-search" />
                        <InputText v-model="filters['global'].value" placeholder="Search..." class="p-inputtext-sm" />
                    </span>
                    <Button icon="pi pi-refresh" outlined rounded @click="fetchOrders" :loading="loading" />
                    <Button label="New Order" icon="pi pi-plus" @click="createDraftOrder" :loading="creatingOrder" />
                </div>
            </div>

            <DataTable 
                v-model:expandedRows="expandedRows"
                :value="filteredOrders" 
                :loading="loading" 
                stripedRows 
                paginator 
                :rows="10" 
                :filters="filters"
                selectionMode="single" 
                dataKey="id"
                @rowSelect="(e: any) => router.push(`/sales/${e.data.id}`)"
            >
                <template #empty><div class="p-4 text-center">No sales orders found for this filter.</div></template>

                <Column expander style="width: 3rem" />

                <Column field="order_number" header="Order #" sortable class="font-bold text-primary cursor-pointer white-space-nowrap" />
                
                <Column field="customer_name" header="Customer" sortable />
                
                <Column field="dispatch_date" header="Dispatch" sortable>
                    <template #body="{ data }">
                        <span v-if="data.dispatch_date" class="text-sm font-medium">{{ formatDate(data.dispatch_date) }}</span>
                        <span v-else class="text-300">-</span>
                    </template>
                </Column>

                <Column field="item_count" header="Items" sortable style="width: 6rem" class="text-center">
                    <template #body="{ data }">
                        <Badge :value="data.item_count" severity="secondary"></Badge>
                    </template>
                </Column>

                <Column field="total_amount" header="Total" sortable class="font-bold">
                    <template #body="{ data }">
                        {{ formatCurrency(data.total_amount) }}
                    </template>
                </Column>

                <Column field="status" header="Status" sortable>
                    <template #body="{ data }">
                        <Tag :value="data.status?.toUpperCase().replace('_', ' ')" :severity="getStatusSeverity(data.status)" class="text-xs" />
                    </template>
                </Column>

                <Column header="Shipped" style="width: 8rem">
                    <template #body="{ data }">
                        <ProgressBar :value="data.fulfillment_pct" :showValue="false" style="height: 6px" 
                            :class="data.fulfillment_pct === 100 ? 'bg-green-100' : 'bg-gray-200'">
                        </ProgressBar>
                        <div class="text-xs text-500 mt-1 text-center">{{ data.fulfillment_pct }}%</div>
                    </template>
                </Column>

                <Column header="" style="width: 4rem">
                    <template #body>
                        <i class="pi pi-angle-right text-500"></i>
                    </template>
                </Column>

                <template #expansion="{ data }">
                    <div class="p-3 surface-50 border-bottom-1 surface-border">
                        <span class="font-bold block mb-2 text-sm text-500">Order Contents</span>
                        <DataTable :value="data.sales_order_lines" size="small" class="p-datatable-sm">
                            <Column field="products.sku" header="SKU" />
                            <Column field="products.name" header="Product" />
                            <Column field="quantity_ordered" header="Qty" />
                            <Column field="quantity_fulfilled" header="Shipped">
                                <template #body="{ data: line }">
                                    <span :class="line.quantity_fulfilled > 0 ? 'text-green-600 font-bold' : 'text-300'">
                                        {{ line.quantity_fulfilled || 0 }}
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