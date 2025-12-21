<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { formatCurrency } from '@/lib/formatCurrency'
import { supabase } from '@/lib/supabase'
import { FilterMatchMode } from '@primevue/core/api'

// Centralized Dialog Components
import ProductInventoryDialog from '@/modules/inventory/components/ProductInventoryDialog.vue' 
import ProductDemandDialog from '@/modules/inventory/components/ProductDemandDialog.vue'
import ProductReservedDialog from '@/modules/inventory/components/ProductReservedDialog.vue'
import ProductOnOrderDialog from '@/modules/inventory/components/ProductOnOrderDialog.vue'
import ProductCreateDialog from '@/modules/inventory/components/ProductCreateDialog.vue'

// UI Components
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import Toolbar from 'primevue/toolbar'
import Dropdown from 'primevue/dropdown'
import Badge from 'primevue/badge'

const products = ref<any[]>([])
const loading = ref(false)
const totalRecords = ref(0)
const stats = ref<any>({
    total_products: 0,
    active_products: 0,
    low_stock: 0,
    out_of_stock: 0,
    total_valuation: 0
})

const lazyParams = ref({ 
    first: 0, 
    rows: 50, 
    page: 0,
    sortField: 'sku',
    sortOrder: 1 
}) 

const statuses = ref([
    { label: 'All Statuses', value: null },
    { label: 'Active', value: 'active' },
    { label: 'Inactive', value: 'inactive' },
    { label: 'Discontinued', value: 'discontinued' },
    { label: 'Archived', value: 'archived' }
])

const filters = ref({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
    status: { value: 'active', matchMode: FilterMatchMode.EQUALS }
})

// Dialog Visibility States
const showBreakdown = ref(false)
const showReservedDialog = ref(false)
const showOnOrderDialog = ref(false)
const showDemandDialog = ref(false)
const showCreateDialog = ref(false)

const selectedProduct = ref<any>(null)
const dt = ref()

const onProductCreated = () => {
    fetchProducts()
    fetchStats()
}

const fetchStats = async () => {
    const { data } = await supabase.rpc('get_product_stats')
    if (data) stats.value = data
}

const fetchProducts = async () => {
    loading.value = true
    const { first, rows, sortField, sortOrder } = lazyParams.value

    let query = supabase
        .from('product_inventory_view')
        .select('*', { count: 'exact' })
        
    if (filters.value.global.value) {
        const searchTerm = filters.value.global.value
        query = query.or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%`)
    }

    if (filters.value.status.value) {
        query = query.eq('status', filters.value.status.value)
    }

    if (sortField) {
        query = query.order(sortField, { ascending: sortOrder === 1 })
    }

    query = query.range(first, first + rows - 1)

    const { data, count, error } = await query
    if (error) {
        console.error(error)
    } else {
        totalRecords.value = count || 0
        products.value = data || []
    }
    loading.value = false
}

const openReserved = (prod: any) => {
    selectedProduct.value = prod
    showReservedDialog.value = true
}

const openOnOrder = (prod: any) => {
    selectedProduct.value = prod
    showOnOrderDialog.value = true
}

const openDemand = (prod: any) => {
    selectedProduct.value = prod
    showDemandDialog.value = true
}

const onAvailableClick = async (productData: any) => {
    selectedProduct.value = productData
    showBreakdown.value = true
    
    const { data } = await supabase
        .from('inventory_snapshots')
        .select('qoh, available, locations(name)')
        .eq('product_id', productData.id)
    
    selectedProduct.value.inventory_snapshots = data
}

const onPage = (event: any) => { 
    lazyParams.value = event
    fetchProducts() 
}

const onSort = (event: any) => { 
    lazyParams.value.sortField = event.sortField
    lazyParams.value.sortOrder = event.sortOrder
    fetchProducts() 
}

const onSearch = () => { 
    lazyParams.value.first = 0
    fetchProducts() 
}

const onStatusChange = () => {
    lazyParams.value.first = 0
    fetchProducts()
}

const exportCSV = () => {
    dt.value.exportCSV()
}

onMounted(() => {
    fetchProducts()
    fetchStats()
})

const getSeverity = (val: number, reorderPoint: number = 0) => {
    if (val <= 0) return 'danger'
    if (val <= reorderPoint) return 'warn'
    return 'success'
}

const getStatusSeverity = (status: string) => {
    switch (status) {
        case 'active': return 'success';
        case 'inactive': return 'secondary';
        case 'discontinued': return 'danger';
        case 'archived': return 'info';
        default: return 'info';
    }
}
</script>

<template>
    <div class="flex flex-column gap-4">
        <!-- Stats Cards -->
        <div class="grid">
            <div class="col-12 md:col-6 lg:col-3">
                <div class="surface-card shadow-2 p-3 border-round">
                    <div class="flex justify-content-between mb-3">
                        <div>
                            <span class="block text-500 font-medium mb-3">Total Products</span>
                            <div class="text-900 font-medium text-xl">{{ stats.total_products }}</div>
                        </div>
                        <div class="flex align-items-center justify-content-center bg-blue-100 border-round" style="width:2.5rem;height:2.5rem">
                            <i class="pi pi-box text-blue-500 text-xl"></i>
                        </div>
                    </div>
                    <span class="text-green-500 font-medium">{{ stats.active_products }} </span>
                    <span class="text-500">active</span>
                </div>
            </div>
            <div class="col-12 md:col-6 lg:col-3">
                <div class="surface-card shadow-2 p-3 border-round">
                    <div class="flex justify-content-between mb-3">
                        <div>
                            <span class="block text-500 font-medium mb-3">Low Stock</span>
                            <div class="text-900 font-medium text-xl">{{ stats.low_stock }}</div>
                        </div>
                        <div class="flex align-items-center justify-content-center bg-orange-100 border-round" style="width:2.5rem;height:2.5rem">
                            <i class="pi pi-exclamation-triangle text-orange-500 text-xl"></i>
                        </div>
                    </div>
                    <span class="text-500">Below reorder point</span>
                </div>
            </div>
            <div class="col-12 md:col-6 lg:col-3">
                <div class="surface-card shadow-2 p-3 border-round">
                    <div class="flex justify-content-between mb-3">
                        <div>
                            <span class="block text-500 font-medium mb-3">Out of Stock</span>
                            <div class="text-900 font-medium text-xl">{{ stats.out_of_stock }}</div>
                        </div>
                        <div class="flex align-items-center justify-content-center bg-red-100 border-round" style="width:2.5rem;height:2.5rem">
                            <i class="pi pi-times-circle text-red-500 text-xl"></i>
                        </div>
                    </div>
                    <span class="text-500">Available &le; 0</span>
                </div>
            </div>
            <div class="col-12 md:col-6 lg:col-3">
                <div class="surface-card shadow-2 p-3 border-round">
                    <div class="flex justify-content-between mb-3">
                        <div>
                            <span class="block text-500 font-medium mb-3">Inventory Value</span>
                            <div class="text-900 font-medium text-xl">{{ formatCurrency(stats.total_valuation) }}</div>
                        </div>
                        <div class="flex align-items-center justify-content-center bg-green-100 border-round" style="width:2.5rem;height:2.5rem">
                            <i class="pi pi-dollar text-green-500 text-xl"></i>
                        </div>
                    </div>
                    <span class="text-500">Cost basis</span>
                </div>
            </div>
        </div>

        <div class="card shadow-2 p-4 border-round surface-card">
            <Toolbar class="mb-4 border-none p-0 bg-transparent">
                <template #start>
                    <div class="flex gap-2">
                        <Button label="New Product" icon="pi pi-plus" severity="success" @click="showCreateDialog = true" />
                        <Button label="Export" icon="pi pi-upload" severity="secondary" @click="exportCSV" />
                    </div>
                </template>
                <template #end>
                    <div class="flex gap-2">
                        <Dropdown v-model="filters.status.value" :options="statuses" optionLabel="label" optionValue="value" placeholder="Filter Status" class="w-12rem" @change="onStatusChange" />
                        <IconField iconPosition="left">
                            <InputIcon class="pi pi-search" />
                            <InputText v-model="filters['global'].value" placeholder="Search..." @keydown.enter="onSearch" />
                        </IconField>
                    </div>
                </template>
            </Toolbar>

            <DataTable 
                ref="dt"
                :value="products" 
                :loading="loading" 
                lazy 
                paginator 
                :rows="50" 
                :totalRecords="totalRecords" 
                @page="onPage" 
                @sort="onSort" 
                dataKey="product_id" 
                stripedRows
                class="p-datatable-sm"
            >
                <Column field="sku" header="SKU" sortable style="min-width: 8rem">
                    <template #body="{ data }">
                        <router-link :to="`/product/${data.product_id}`" class="text-primary font-bold hover:underline cursor-pointer no-underline">
                            {{ data.sku }}
                        </router-link>
                    </template>
                </Column>
                
                <Column field="name" header="Product" sortable style="min-width: 12rem" />
                
                <Column field="status" header="Status" sortable style="width: 8rem">
                    <template #body="{ data }">
                        <Tag :value="data.status" :severity="getStatusSeverity(data.status)" />
                    </template>
                </Column>

                <Column field="available" header="Avail" sortable style="width: 7rem">
                    <template #body="{ data }">
                        <div class="flex align-items-center gap-1">
                            <Tag :severity="getSeverity(data.available, data.reorder_point)" :value="data.available" />
                            <Button icon="pi pi-info-circle" size="small" text rounded @click="onAvailableClick(data)" />
                        </div>
                    </template>
                </Column>

                <Column field="qoh" header="On Hand" sortable style="width: 6rem" />

                <Column field="reserved" header="Reserved" sortable style="width: 8rem">
                    <template #body="{ data }">
                        <div class="flex align-items-center gap-1">
                            <span :class="data.reserved > 0 ? 'text-orange-500 font-bold' : 'text-400'">{{ data.reserved }}</span>
                            <Button v-if="data.reserved > 0" icon="pi pi-list" size="small" text rounded severity="warning" @click="openReserved(data)" />
                        </div>
                    </template>
                </Column>

                <Column field="on_order" header="On Order" sortable style="width: 8rem">
                    <template #body="{ data }">
                        <div class="flex align-items-center gap-1">
                            <span :class="data.on_order > 0 ? 'text-purple-500 font-bold' : 'text-400'">{{ data.on_order }}</span>
                            <Button v-if="data.on_order > 0" icon="pi pi-truck" size="small" text rounded severity="help" @click="openOnOrder(data)" />
                        </div>
                    </template>
                </Column>

                <Column field="net_required" header="Net Req" sortable style="width: 8rem">
                    <template #body="{ data }">
                        <div class="flex align-items-center gap-1">
                            <Tag v-if="data.net_required > 0" severity="danger" :value="data.net_required" />
                            <span v-else class="text-green-600 text-sm"><i class="pi pi-check"></i> OK</span>
                            <Button v-if="data.backlog > 0" icon="pi pi-exclamation-circle" size="small" text rounded severity="danger" @click="openDemand(data)" />
                        </div>
                    </template>
                </Column>

                <Column field="list_price" header="Price" sortable>
                     <template #body="{ data }">{{ formatCurrency(data.list_price) }}</template>
                </Column>
            </DataTable>
        </div>

        <ProductReservedDialog 
            v-model:visible="showReservedDialog" 
            :product-id="selectedProduct?.id"
            :product-sku="selectedProduct?.sku"
        />

        <ProductOnOrderDialog 
            v-model:visible="showOnOrderDialog" 
            :product-id="selectedProduct?.id"
            :product-sku="selectedProduct?.sku"
        />

        <ProductDemandDialog 
            v-model:visible="showDemandDialog" 
            :product-id="selectedProduct?.id"
            :product-sku="selectedProduct?.sku"
        />

        <ProductInventoryDialog v-model:visible="showBreakdown" :product="selectedProduct" />

        <ProductCreateDialog 
            v-model:visible="showCreateDialog" 
            @created="onProductCreated"
        />
    </div>
</template>