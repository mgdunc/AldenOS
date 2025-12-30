<script setup lang="ts">
/**
 * AddProductDialog.vue
 * 
 * This component provides a modal dialog for searching and selecting products.
 * It is used in both Sales Orders and Purchase Orders to add line items.
 * 
 * Features:
 * - Search by Name or SKU
 * - Displays real-time inventory status (Available, Required, On Order)
 * - Returns the full product object to the parent component
 */

import { ref, watch } from 'vue'
import { formatCurrency } from '@/lib/formatCurrency'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { FilterMatchMode } from '@primevue/core/api'
import { logger } from '@/lib/logger'

// Components
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'

const toast = useToast()

// --- PROPS & EMITS ---

const props = defineProps<{
    visible: boolean,
    orderId?: string // Optional: Context of the order we are adding to
}>()

// Emits the selected product object back to the parent
const emit = defineEmits(['update:visible', 'product-selected'])

// --- STATE ---

const selectedProduct = ref<any>(null)
const tableLoading = ref(false)
const tableProducts = ref<any[]>([])
const tableFilters = ref({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS }
})

// --- HELPERS ---

/**
 * Determines the severity color for stock levels.
 * @param val - The quantity available
 */
const getStockSeverity = (val: number) => {
    if (val === 0) return 'danger'
    if (val < 5) return 'warn'
    return 'success'
}

/**
 * Determines the severity color for required stock (shortfall).
 * @param val - The quantity required
 */
const getRequiredSeverity = (val: number) => {
    if (val > 0) return 'danger' // We need stock!
    return 'success' // We are good
}

// --- DATA FETCHING ---

/**
 * Fetches products from the `product_inventory_view`.
 * This view provides pre-calculated fields like `available`, `net_required`, and `on_order`.
 */
const fetchTableProducts = async () => {
    tableLoading.value = true
    
    // Query the View instead of the raw table to get aggregated inventory data
    let query = supabase
        .from('product_inventory_view')
        .select(`
            id, sku, name, list_price, price_cost,
            available, net_required, on_order
        `)
        .limit(100)

    // Apply Search Filter
    if (tableFilters.value.global.value) {
        const searchTerm = tableFilters.value.global.value
        query = query.or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%`)
    }

    const { data, error } = await query

    if (error) {
        logger.error('Query error', error)
        toast.add({ severity: 'error', summary: 'Query Error', detail: error.message })
    } else {
        // The view returns flat data, so we don't need to map/reduce snapshots anymore
        tableProducts.value = data || []
    }
    tableLoading.value = false
}

// --- ACTIONS ---

/**
 * Immediately selects a product and closes the dialog.
 * @param product - The product object from the row
 */
const quickAdd = (product: any) => {
    emit('product-selected', product)
    emit('update:visible', false)
}

/**
 * Handles row selection (single click).
 */
const onRowSelect = (event: any) => {
    selectedProduct.value = event.data
}

/**
 * Confirms the selection of the currently highlighted product.
 */
const confirmSelection = () => {
    if (!selectedProduct.value) {
        toast.add({ severity: 'warn', summary: 'No product selected', detail: 'Please select a product first.' })
        return
    }
    emit('product-selected', selectedProduct.value)
    emit('update:visible', false)
}

// --- WATCHERS ---

// Watch for search input changes to trigger re-fetch (debounced)
watch(() => tableFilters.value.global.value, (newVal, oldVal) => {
    setTimeout(() => {
        if (tableFilters.value.global.value === newVal) {
            fetchTableProducts()
        }
    }, 300)
})

// Watch for dialog visibility to reset state
watch(() => props.visible, (newVal) => {
    if (newVal) {
        tableFilters.value.global.value = null
        selectedProduct.value = null
        fetchTableProducts()
    } else {
        tableProducts.value = []
    }
})
</script>

<template>
    <Dialog 
        :visible="visible" 
        @update:visible="val => emit('update:visible', val)"
        modal 
        header="Select Product" 
        :style="{ width: '70rem' }"
        dismissableMask
    >
        <div class="flex flex-column gap-3">
            <!-- Product Table -->
            <DataTable 
                :value="tableProducts" 
                :loading="tableLoading"
                v-model:filters="tableFilters"
                dataKey="id"
                stripedRows
                size="small"
                paginator
                :rows="10"
                selectionMode="single"
                v-model:selection="selectedProduct"
                @row-select="onRowSelect"
                rowHover
            >
                <template #header>
                    <div class="flex justify-content-between align-items-center">
                        <div class="flex-1 mr-3">
                            <span class="p-input-icon-left w-full">
                                <i class="pi pi-search" />
                                <InputText 
                                    v-model="tableFilters['global'].value" 
                                    placeholder="Filter Products by Name or SKU..." 
                                    @keydown.enter="fetchTableProducts"
                                    class="w-full"
                                />
                            </span>
                        </div>
                        <Button icon="pi pi-refresh" severity="secondary" text @click="fetchTableProducts" :loading="tableLoading" />
                    </div>
                </template>
                
                <Column field="sku" header="SKU" sortable style="width: 10rem" />
                
                <Column field="name" header="Product Name" sortable />
                
                <Column field="list_price" header="List Price" style="width: 8rem">
                    <template #body="{ data }">{{ formatCurrency(data.list_price) }}</template>
                </Column>
                
                <Column field="price_cost" header="Cost" style="width: 8rem">
                    <template #body="{ data }">{{ formatCurrency(data.price_cost) }}</template>
                </Column>
                
                <!-- Inventory Columns -->
                <Column field="available" header="Available" sortable style="width: 8rem" class="text-center">
                    <template #body="{ data }">
                        <Tag :value="data.available" :severity="getStockSeverity(data.available)" />
                    </template>
                </Column>

                <Column field="net_required" header="Required" sortable style="width: 8rem" class="text-center">
                    <template #body="{ data }">
                        <span v-if="data.net_required > 0" class="text-red-500 font-bold">{{ data.net_required }}</span>
                        <span v-else class="text-300">-</span>
                    </template>
                </Column>

                <Column field="on_order" header="Incoming" sortable style="width: 8rem" class="text-center">
                    <template #body="{ data }">
                        <span v-if="data.on_order > 0" class="text-blue-600 font-bold">{{ data.on_order }}</span>
                        <span v-else class="text-300">-</span>
                    </template>
                </Column>

                <Column header="Add" bodyClass="text-center" style="width: 4rem">
                    <template #body="{ data }">
                        <Button icon="pi pi-plus" size="small" severity="success" text rounded @click="quickAdd(data)" />
                    </template>
                </Column>
            </DataTable>
        </div>
        
        <template #footer>
            <div class="flex w-full justify-content-between align-items-center">
                <div class="flex align-items-center gap-2">
                    <Button label="Cancel" text @click="emit('update:visible', false)" />
                    <small class="text-xs text-400">AddProductDialog.vue</small>
                </div>
                <div class="flex gap-3 align-items-center">
                    <div v-if="selectedProduct" class="text-right">
                        <div class="font-bold">{{ selectedProduct.name }}</div>
                        <div class="text-xs text-500">SKU: {{ selectedProduct.sku }} | Cost: {{ formatCurrency(selectedProduct.price_cost) }}</div>
                    </div>
                    <Button label="Add Selected" severity="success" @click="confirmSelection" :disabled="!selectedProduct" />
                </div>
            </div>
        </template>
    </Dialog>
</template>