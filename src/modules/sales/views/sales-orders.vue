<script setup lang="ts">
// @ts-nocheck
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useSalesOrders } from '../composables/useSalesOrders'
import { useSalesStore } from '../store'
import { useResponsive } from '@/composables/useResponsive'
import { useErrorHandler } from '@/composables/useErrorHandler'

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
const store = useSalesStore()
const { loading, saving, loadOrders, createOrder } = useSalesOrders()
const { isMobile, isTablet } = useResponsive()
const { handleError } = useErrorHandler()

const expandedRows = ref([])
const activeTab = ref('all')
const searchTerm = ref('')
const rowsPerPage = ref(25)
const rowsPerPageOptions = [10, 25, 50, 100]

// KPI Counters
const kpis = computed(() => {
    return {
        new: store.orders.filter(o => o.status === 'new').length,
        draft: store.orders.filter(o => o.status === 'draft').length,
        awaiting: store.orders.filter(o => o.status === 'awaiting_stock' || o.status === 'requires_items').length,
        ready: store.orders.filter(o => ['reserved', 'picking', 'confirmed'].includes(o.status)).length,
        shipped: store.orders.filter(o => o.status === 'shipped').length
    }
})

// Tab Filtering
const filteredOrders = computed(() => {
    let result = store.orders

    // Apply search filter
    if (searchTerm.value) {
        const search = searchTerm.value.toLowerCase()
        result = result.filter(o => 
            o.order_number?.toLowerCase().includes(search) ||
            o.customer_name?.toLowerCase().includes(search)
        )
    }

    // Apply tab filter
    if (activeTab.value === 'all') return result
    
    if (activeTab.value === 'active') {
        return result.filter(o => !['shipped', 'cancelled', 'delivered', 'completed'].includes(o.status))
    }
    
    if (activeTab.value === 'new') return result.filter(o => o.status === 'new')
    if (activeTab.value === 'draft') return result.filter(o => o.status === 'draft')
    if (activeTab.value === 'awaiting') return result.filter(o => ['awaiting_stock', 'requires_items'].includes(o.status))
    if (activeTab.value === 'ready') return result.filter(o => ['reserved', 'picking', 'packed', 'confirmed', 'partially_shipped'].includes(o.status))
    
    return result
})

// Add line items and fulfillment % to orders
const ordersWithDetails = computed(() => {
    return filteredOrders.value.map(order => ({
        ...order,
        // Display customer name from relationship or fallback to direct field
        display_customer_name: order.customer?.name || order.customer_name || 'No Customer',
        item_count: order.lines?.length || 0,
        fulfillment_pct: calculateProgress(order.lines || [])
    }))
})

const calculateProgress = (lines: any[]) => {
    if (!lines || lines.length === 0) return 0
    const totalOrdered = lines.reduce((sum, l) => sum + l.quantity_ordered, 0)
    const totalShipped = lines.reduce((sum, l) => sum + (l.quantity_fulfilled || 0), 0)
    if (totalOrdered === 0) return 0
    return Math.round((totalShipped / totalOrdered) * 100)
}

const fetchOrders = async () => {
    await loadOrders()
}

const createDraftOrder = async () => {
    const order = await createOrder(
        { customer_name: 'New Customer', status: 'draft' },
        []
    )
    
    if (order) {
        router.push(`/sales/${order.id}`)
    }
}

onMounted(fetchOrders)
</script>

<template>
    <div class="flex flex-column gap-4">
        
        <div class="grid">
            <div class="col-6 md:col-2">
                <div class="surface-card shadow-2 p-3 border-round flex justify-content-between align-items-center h-full cursor-pointer hover:surface-50 transition-colors" @click="activeTab = 'new'">
                    <div>
                        <span class="block text-500 font-medium mb-2">New</span>
                        <div class="text-900 font-bold text-2xl">{{ kpis.new }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center bg-cyan-100 border-round" style="width:2.5rem;height:2.5rem">
                        <i class="pi pi-sparkles text-cyan-500 text-xl"></i>
                    </div>
                </div>
            </div>
            <div class="col-6 md:col-2">
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
            <div class="col-6 md:col-2">
                <div class="surface-card shadow-2 p-3 border-round flex justify-content-between align-items-center h-full cursor-pointer hover:surface-50 transition-colors" @click="activeTab = 'awaiting'">
                    <div>
                        <span class="block text-500 font-medium mb-2">Awaiting</span>
                        <div class="text-900 font-bold text-2xl">{{ kpis.awaiting }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center bg-orange-100 border-round" style="width:2.5rem;height:2.5rem">
                        <i class="pi pi-clock text-orange-500 text-xl"></i>
                    </div>
                </div>
            </div>
            <div class="col-6 md:col-2">
                <div class="surface-card shadow-2 p-3 border-round flex justify-content-between align-items-center h-full cursor-pointer hover:surface-50 transition-colors" @click="activeTab = 'ready'">
                    <div>
                        <span class="block text-500 font-medium mb-2">Ready</span>
                        <div class="text-900 font-bold text-2xl">{{ kpis.ready }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center bg-green-100 border-round" style="width:2.5rem;height:2.5rem">
                        <i class="pi pi-box text-green-500 text-xl"></i>
                    </div>
                </div>
            </div>
            <div class="col-6 md:col-2">
                <div class="surface-card shadow-2 p-3 border-round flex justify-content-between align-items-center h-full cursor-pointer hover:surface-50 transition-colors" @click="activeTab = 'active'">
                    <div>
                        <span class="block text-500 font-medium mb-2">Active</span>
                        <div class="text-900 font-bold text-2xl">{{ kpis.new + kpis.draft + kpis.awaiting + kpis.ready }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center bg-blue-100 border-round" style="width:2.5rem;height:2.5rem">
                        <i class="pi pi-chart-bar text-blue-500 text-xl"></i>
                    </div>
                </div>
            </div>
            <div class="col-6 md:col-2">
                <div class="surface-card shadow-2 p-3 border-round flex justify-content-between align-items-center h-full cursor-pointer hover:surface-50 transition-colors" @click="activeTab = 'all'">
                    <div>
                        <span class="block text-500 font-medium mb-2">Total</span>
                        <div class="text-900 font-bold text-2xl">{{ store.orders.length }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center bg-purple-100 border-round" style="width:2.5rem;height:2.5rem">
                        <i class="pi pi-list text-purple-500 text-xl"></i>
                    </div>
                </div>
            </div>
        </div>

        <div class="card shadow-2 p-0 border-round overflow-hidden surface-card">
            
            <div class="p-3 border-bottom-1 surface-border flex flex-wrap gap-2 justify-content-between align-items-center">
                <div class="flex flex-wrap gap-2">
                    <Button label="All" size="small" :outlined="activeTab !== 'all'" @click="activeTab = 'all'" />
                    <Button label="New" size="small" severity="info" :outlined="activeTab !== 'new'" @click="activeTab = 'new'" />
                    <Button label="Active" size="small" :outlined="activeTab !== 'active'" @click="activeTab = 'active'" />
                    <Button label="Awaiting" size="small" severity="warning" :outlined="activeTab !== 'awaiting'" @click="activeTab = 'awaiting'" />
                    <Button label="Ready" size="small" severity="success" :outlined="activeTab !== 'ready'" @click="activeTab = 'ready'" />
                </div>

                <div class="flex gap-2 align-items-center">
                    <span class="p-input-icon-left">
                        <i class="pi pi-search" />
                        <InputText v-model="searchTerm" placeholder="Search..." class="p-inputtext-sm" />
                    </span>
                    <Button icon="pi pi-refresh" outlined rounded @click="fetchOrders" :loading="loading" />
                    <Button label="New Order" icon="pi pi-plus" @click="createDraftOrder" :loading="saving" />
                </div>
            </div>

            <DataTable 
                v-model:expandedRows="expandedRows"
                :value="ordersWithDetails" 
                :loading="loading" 
                stripedRows 
                paginator 
                :rows="rowsPerPage"
                :rowsPerPageOptions="rowsPerPageOptions"
                selectionMode="single" 
                dataKey="id"
                @rowSelect="(e: any) => router.push(`/sales/${e.data.id}`)"
                :scrollable="!isMobile"
                responsiveLayout="scroll"
                paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
            >
                <template #empty><div class="p-4 text-center">No sales orders found for this filter.</div></template>

                <Column expander style="width: 3rem" />

                <Column field="order_number" header="Order #" sortable class="font-bold text-primary cursor-pointer white-space-nowrap" />
                
                <Column field="display_customer_name" header="Customer" sortable>
                    <template #body="{ data }">
                        <div class="flex flex-column">
                            <span class="font-medium">{{ data.display_customer_name }}</span>
                            <span v-if="data.customer?.email" class="text-sm text-500">{{ data.customer.email }}</span>
                        </div>
                    </template>
                </Column>
                
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
                        <span class="font-bold block mb-2 text-sm text-500">Order Contents ({{ data.lines?.length || 0 }} items)</span>
                        <DataTable v-if="data.lines?.length" :value="data.lines" size="small" class="p-datatable-sm">
                            <Column field="sku" header="SKU" style="width: 120px">
                                <template #body="{ data: line }">
                                    <code class="text-sm">{{ line.sku || line.products?.sku || '-' }}</code>
                                </template>
                            </Column>
                            <Column field="product_name" header="Product">
                                <template #body="{ data: line }">
                                    {{ line.product_name || line.products?.name || 'Unknown Product' }}
                                </template>
                            </Column>
                            <Column field="quantity_ordered" header="Qty" style="width: 80px" class="text-center" />
                            <Column field="quantity_fulfilled" header="Shipped" style="width: 80px">
                                <template #body="{ data: line }">
                                    <span :class="line.quantity_fulfilled > 0 ? 'text-green-600 font-bold' : 'text-300'">
                                        {{ line.quantity_fulfilled || 0 }}
                                    </span>
                                </template>
                            </Column>
                            <Column header="Status" style="width: 100px">
                                <template #body="{ data: line }">
                                    <Tag v-if="line.quantity_fulfilled >= line.quantity_ordered" value="SHIPPED" severity="success" class="text-xs" />
                                    <Tag v-else-if="line.quantity_fulfilled > 0" value="PARTIAL" severity="warning" class="text-xs" />
                                    <Tag v-else value="PENDING" severity="secondary" class="text-xs" />
                                </template>
                            </Column>
                        </DataTable>
                        <div v-else class="text-500 text-sm py-2">No line items</div>
                    </div>
                </template>

            </DataTable>
        </div>
    </div>
</template>