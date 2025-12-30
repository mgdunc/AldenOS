<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { formatCurrency } from '@/lib/formatCurrency'
import { supabase } from '@/lib/supabase'
import { useInventoryStore } from '../store'
import { useInventory } from '../composables/useInventory'
import { useResponsive } from '@/composables/useResponsive'
import { useErrorHandler } from '@/composables/useErrorHandler'
import type { ProductFilters } from '../types'
import { logger } from '@/lib/logger'

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
import Select from 'primevue/select'

const store = useInventoryStore()
const { getProductStats } = useInventory()
const { isMobile, isTablet } = useResponsive()
const { handleError } = useErrorHandler()

const totalRecords = ref(0)
const localSearch = ref('')
const localStatus = ref<string | null>('active')
const productsWithShopify = ref<any[]>([])

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

// Dialog Visibility States
const showBreakdown = ref(false)
const showReservedDialog = ref(false)
const showOnOrderDialog = ref(false)
const showDemandDialog = ref(false)
const showCreateDialog = ref(false)

const selectedProduct = ref<any>(null)
const dt = ref()

// Stats from RPC (kept for now since it uses product_inventory_view)
const statsRpc = ref<any>({
    total_products: 0,
    active_products: 0,
    low_stock: 0,
    out_of_stock: 0,
    total_valuation: 0
})

const onProductCreated = () => {
    fetchProducts()
    fetchStats()
}

const fetchStats = async () => {
    const data = await getProductStats()
    if (data) statsRpc.value = data
}

const fetchProducts = async () => {
    const { first, rows, sortField, sortOrder } = lazyParams.value

    let query = supabase
        .from('product_inventory_view')
        .select('*', { count: 'exact' })
        
    if (localSearch.value) {
        query = query.or(`name.ilike.%${localSearch.value}%,sku.ilike.%${localSearch.value}%`)
    }

    if (localStatus.value) {
        query = query.eq('status', localStatus.value)
    }

    if (sortField) {
        query = query.order(sortField, { ascending: sortOrder === 1 })
    }

    query = query.range(first, first + rows - 1)

    const { data, count, error } = await query
    if (error) {
        logger.error('Error loading products', error)
    } else {
        totalRecords.value = count || 0
        
        // Fetch Shopify status for these products
        if (data && data.length > 0) {
            const productIds = data.map(p => p.product_id)
            
            // 1. Check Legacy Links
            const { data: legacyData } = await supabase
                .from('products')
                .select('id')
                .in('id', productIds)
                .not('shopify_product_id', 'is', null)
            
            // 2. Check Multi-Store Links
            const { data: integrationData } = await supabase
                .from('product_integrations')
                .select('product_id')
                .in('product_id', productIds)

            const linkedSet = new Set<string>()
            legacyData?.forEach(p => linkedSet.add(p.id))
            integrationData?.forEach(p => linkedSet.add(p.product_id))

            productsWithShopify.value = data.map(p => ({
                ...p,
                is_shopify_linked: linkedSet.has(p.product_id)
            }))
        } else {
            productsWithShopify.value = []
        }
    }
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
    <div class="flex flex-column gap-3">
        
        <!-- Page Header -->
        <div class="flex justify-content-between align-items-center">
            <div class="flex align-items-center gap-2">
                <i class="pi pi-box text-primary text-xl"></i>
                <h1 class="text-xl font-bold m-0 text-900">Products</h1>
            </div>
            <Button label="New Product" icon="pi pi-plus" size="small" @click="showCreateDialog = true" />
        </div>

        <!-- Stats Cards -->
        <div class="grid">
            <div class="col-12 md:col-6 lg:col-3">
                <div class="surface-card shadow-2 p-3 border-round hover:shadow-3 transition-all transition-duration-200 cursor-pointer border-1 border-transparent hover:border-primary-200">
                    <div class="flex justify-content-between align-items-start">
                        <div class="flex-1">
                            <span class="block text-500 font-medium mb-1 text-xs uppercase">Total Products</span>
                            <div class="text-900 font-bold text-2xl mb-1">{{ statsRpc.total_products.toLocaleString() }}</div>
                            <span class="text-green-600 font-semibold text-xs">{{ statsRpc.active_products }} active</span>
                        </div>
                        <div class="flex align-items-center justify-content-center bg-blue-50 border-round" style="width: 2.5rem; height: 2.5rem;">
                            <i class="pi pi-box text-blue-500"></i>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-12 md:col-6 lg:col-3">
                <div class="surface-card shadow-2 p-3 border-round hover:shadow-3 transition-all transition-duration-200 cursor-pointer border-1 border-transparent hover:border-orange-200">
                    <div class="flex justify-content-between align-items-start">
                        <div class="flex-1">
                            <span class="block text-500 font-medium mb-1 text-xs uppercase">Low Stock</span>
                            <div class="text-900 font-bold text-2xl mb-1">{{ statsRpc.low_stock }}</div>
                            <span class="text-600 text-xs">Below reorder point</span>
                        </div>
                        <div class="flex align-items-center justify-content-center bg-orange-50 border-round" style="width: 2.5rem; height: 2.5rem;">
                            <i class="pi pi-exclamation-triangle text-orange-500"></i>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-12 md:col-6 lg:col-3">
                <div class="surface-card shadow-2 p-3 border-round hover:shadow-3 transition-all transition-duration-200 cursor-pointer border-1 border-transparent hover:border-red-200">
                    <div class="flex justify-content-between align-items-start">
                        <div class="flex-1">
                            <span class="block text-500 font-medium mb-1 text-xs uppercase">Out of Stock</span>
                            <div class="text-900 font-bold text-2xl mb-1">{{ statsRpc.out_of_stock }}</div>
                            <span class="text-600 text-xs">Available ≤ 0</span>
                        </div>
                        <div class="flex align-items-center justify-content-center bg-red-50 border-round" style="width: 2.5rem; height: 2.5rem;">
                            <i class="pi pi-times-circle text-red-500"></i>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-12 md:col-6 lg:col-3">
                <div class="surface-card shadow-2 p-3 border-round hover:shadow-3 transition-all transition-duration-200 cursor-pointer border-1 border-transparent hover:border-green-200">
                    <div class="flex justify-content-between align-items-start">
                        <div class="flex-1">
                            <span class="block text-500 font-medium mb-1 text-xs uppercase">Inventory Value</span>
                            <div class="text-900 font-bold text-2xl mb-1">{{ formatCurrency(statsRpc.total_valuation) }}</div>
                            <span class="text-600 text-xs">Total cost basis</span>
                        </div>
                        <div class="flex align-items-center justify-content-center bg-green-50 border-round" style="width: 2.5rem; height: 2.5rem;">
                            <i class="pi pi-dollar text-green-500"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Data Table Card -->
        <div class="surface-card shadow-2 border-round overflow-hidden">
            <!-- Toolbar -->
            <div class="flex flex-column md:flex-row justify-content-between align-items-start md:align-items-center gap-2 p-3 border-bottom-1 surface-border bg-gray-50">
                <div class="flex align-items-center gap-2">
                    <i class="pi pi-filter text-700"></i>
                    <span class="font-semibold text-900 text-sm">Filter & Search</span>
                </div>
                <div class="flex gap-2 w-full md:w-auto">
                    <Select 
                        v-model="localStatus" 
                        :options="statuses" 
                        optionLabel="label" 
                        optionValue="value" 
                        placeholder="All Statuses" 
                        class="w-full md:w-12rem" 
                        @change="onStatusChange" 
                    />
                    <IconField iconPosition="left" class="w-full md:w-auto">
                        <InputIcon class="pi pi-search" />
                        <InputText 
                            v-model="localSearch" 
                            placeholder="Search SKU or name..." 
                            @keydown.enter="onSearch"
                            class="w-full md:w-20rem"
                        />
                    </IconField>
                </div>
            </div>

            <DataTable 
                ref="dt"
                :value="productsWithShopify" 
                :loading="store.loading" 
                lazy 
                paginator 
                :rows="50" 
                :totalRecords="totalRecords" 
                @page="onPage" 
                @sort="onSort" 
                dataKey="product_id" 
                stripedRows
                class="p-datatable-sm"
                :scrollable="!isMobile"
                scrollHeight="flex"
                responsiveLayout="scroll"
            >
                <template #empty>
                    <div class="flex flex-column align-items-center justify-content-center py-5">
                        <div class="flex align-items-center justify-content-center bg-gray-100 border-round-xl mb-2" style="width: 48px; height: 48px;">
                            <i class="pi pi-inbox text-3xl text-400"></i>
                        </div>
                        <div class="text-700 font-semibold text-sm mb-1">No products found</div>
                        <div class="text-500 text-xs">Try adjusting your filters or create a new product</div>
                    </div>
                </template>

                <Column header="Image" style="width: 4rem">
                    <template #body="{ data }">
                        <div v-if="data.image_url" class="w-3rem h-3rem border-round surface-50 flex align-items-center justify-content-center overflow-hidden border-1 surface-border">
                            <img :src="data.image_url" class="w-full h-full" style="object-fit: cover;" />
                        </div>
                        <div v-else class="w-3rem h-3rem border-round surface-100 flex align-items-center justify-content-center border-1 surface-border">
                            <i class="pi pi-image text-400"></i>
                        </div>
                    </template>
                </Column>

                <Column field="sku" header="SKU" sortable style="min-width: 10rem">
                    <template #body="{ data }">
                        <router-link :to="`/product/${data.product_id}`" class="text-primary font-bold hover:underline cursor-pointer no-underline flex align-items-center gap-2">
                            {{ data.sku }}
                            <i v-if="data.is_shopify_linked" class="pi pi-shopping-bag text-green-500 text-sm" v-tooltip.top="'Synced with Shopify'"></i>
                        </router-link>
                    </template>
                </Column>
                
                <Column field="name" header="Product Name" sortable style="min-width: 15rem">
                    <template #body="{ data }">
                        <div class="font-medium text-900">{{ data.name }}</div>
                    </template>
                </Column>
                
                <Column field="status" header="Status" sortable style="width: 9rem">
                    <template #body="{ data }">
                        <Tag :value="data.status?.toUpperCase()" :severity="getStatusSeverity(data.status)" class="text-xs font-bold" />
                    </template>
                </Column>

                <Column field="available" header="Available" sortable style="width: 9rem">
                    <template #body="{ data }">
                        <div class="flex align-items-center gap-2">
                            <Tag :severity="getSeverity(data.available, data.reorder_point)" class="font-bold">
                                {{ data.available }}
                            </Tag>
                            <Button 
                                icon="pi pi-info-circle" 
                                size="small" 
                                text 
                                rounded 
                                severity="secondary"
                                @click="onAvailableClick(data)"
                                v-tooltip.top="'View inventory breakdown'"
                            />
                        </div>
                    </template>
                </Column>

                <Column field="qoh" header="On Hand" sortable style="width: 8rem">
                    <template #body="{ data }">
                        <span class="font-semibold text-700">{{ data.qoh }}</span>
                    </template>
                </Column>

                <Column field="reserved" header="Reserved" sortable style="width: 9rem">
                    <template #body="{ data }">
                        <div class="flex align-items-center gap-2">
                            <span :class="data.reserved > 0 ? 'text-orange-600 font-bold' : 'text-400'">
                                {{ data.reserved }}
                            </span>
                            <Button 
                                v-if="data.reserved > 0" 
                                icon="pi pi-list" 
                                size="small" 
                                text 
                                rounded 
                                severity="warning" 
                                @click="openReserved(data)"
                                v-tooltip.top="'View reservations'"
                            />
                        </div>
                    </template>
                </Column>

                <Column field="on_order" header="On Order" sortable style="width: 9rem">
                    <template #body="{ data }">
                        <div class="flex align-items-center gap-2">
                            <span :class="data.on_order > 0 ? 'text-purple-600 font-bold' : 'text-400'">
                                {{ data.on_order }}
                            </span>
                            <Button 
                                v-if="data.on_order > 0" 
                                icon="pi pi-truck" 
                                size="small" 
                                text 
                                rounded 
                                severity="help" 
                                @click="openOnOrder(data)"
                                v-tooltip.top="'View purchase orders'"
                            />
                        </div>
                    </template>
                </Column>

                <Column field="net_required" header="Net Required" sortable style="width: 10rem">
                    <template #body="{ data }">
                        <div class="flex align-items-center gap-2">
                            <Tag v-if="data.net_required > 0" severity="danger" class="font-bold">
                                {{ data.net_required }}
                            </Tag>
                            <div v-else class="flex align-items-center gap-1 text-green-600 font-semibold">
                                <i class="pi pi-check-circle"></i>
                                <span class="text-sm">In Stock</span>
                            </div>
                            <Button 
                                v-if="data.backlog > 0" 
                                icon="pi pi-exclamation-circle" 
                                size="small" 
                                text 
                                rounded 
                                severity="danger" 
                                @click="openDemand(data)"
                                v-tooltip.top="'View demand details'"
                            />
                        </div>
                    </template>
                </Column>

                <Column field="list_price" header="Price" sortable style="width: 9rem">
                     <template #body="{ data }">
                        <span class="font-semibold text-900">{{ formatCurrency(data.list_price) }}</span>
                     </template>
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