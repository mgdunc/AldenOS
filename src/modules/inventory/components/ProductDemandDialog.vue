<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { getStatusSeverity } from '@/lib/statusHelpers'
import Dialog from 'primevue/dialog'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Divider from 'primevue/divider'

const props = defineProps({
    visible: Boolean,
    productId: String,
    productSku: String
})

const emit = defineEmits(['update:visible'])

const loading = ref(false)
const demandLines = ref<any[]>([])
const incomingQty = ref(0)

// Computed totals for the summary bar
const totalDemand = computed(() => {
    return demandLines.value.reduce((sum, item) => sum + item.qty_needed, 0)
})

const netRequired = computed(() => {
    const val = totalDemand.value - incomingQty.value
    return val > 0 ? val : 0
})

const fetchData = async () => {
    if (!props.productId || !props.visible) return
    
    loading.value = true
    
    // 1. Fetch Sales Demand
    const demandQuery = supabase
        .from('sales_order_lines')
        .select(`
            quantity_ordered, 
            quantity_fulfilled, 
            sales_orders!inner(id, order_number, status, customer_name, is_open)
        `)
        .eq('product_id', props.productId)
        .eq('sales_orders.is_open', true)

    // 2. Fetch Incoming "On Order" Qty from POs
    const incomingQuery = supabase
        .from('purchase_order_lines')
        .select(`quantity_ordered, quantity_received`)
        .eq('product_id', props.productId)
        .in('purchase_orders.status', ['placed', 'partial_received'])

    const [demandRes, incomingRes] = await Promise.all([demandQuery, incomingQuery])

    // Process Demand
    if (demandRes.data) {
        demandLines.value = demandRes.data.map((d: any) => ({
            id: d.sales_orders.id,
            order_number: d.sales_orders.order_number,
            customer: d.sales_orders.customer_name,
            status: d.sales_orders.status,
            qty_needed: (d.quantity_ordered || 0) - (d.quantity_fulfilled || 0)
        })).filter(d => d.qty_needed > 0)
    }

    // Process Incoming
    if (incomingRes.data) {
        incomingQty.value = incomingRes.data.reduce((sum, line) => {
            return sum + ((line.quantity_ordered || 0) - (line.quantity_received || 0))
        }, 0)
    }

    loading.value = false
}

watch(() => props.visible, (newVal) => { if (newVal) fetchData() })
</script>

<template>
    <Dialog 
        :visible="visible" 
        @update:visible="emit('update:visible', $event)"
        :header="`Net Requirement Breakdown: ${productSku}`" 
        modal 
        :style="{ width: '65vw' }"
        dismissableMask
    >
        <div class="flex justify-content-between align-items-center p-3 mb-3 surface-100 border-round border-1 surface-border">
            <div class="text-center flex-1">
                <span class="block text-500 text-sm mb-1 uppercase font-bold">Total Demand</span>
                <span class="text-2xl font-bold text-900">{{ totalDemand }}</span>
            </div>
            <div class="text-500 text-xl font-bold">-</div>
            <div class="text-center flex-1">
                <span class="block text-500 text-sm mb-1 uppercase font-bold">Incoming (On Order)</span>
                <span class="text-2xl font-bold text-purple-600">{{ incomingQty }}</span>
            </div>
            <div class="text-500 text-xl font-bold">=</div>
            <div class="text-center flex-1">
                <span class="block text-500 text-sm mb-1 uppercase font-bold">Net Required</span>
                <span class="text-2xl font-bold" :class="netRequired > 0 ? 'text-red-600' : 'text-green-600'">
                    {{ netRequired }}
                </span>
            </div>
        </div>

        <DataTable :value="demandLines" :loading="loading" size="small" stripedRows paginator :rows="10">
            <template #header>
                <div class="font-bold text-lg">Sales Demand Details</div>
            </template>
            <template #empty>
                <div class="p-4 text-center text-500">No active demand found.</div>
            </template>
            
            <Column field="order_number" header="Order #">
                <template #body="{ data }">
                    <router-link :to="`/sales/${data.id}`" class="text-primary font-bold no-underline hover:underline">
                        {{ data.order_number }}
                    </router-link>
                </template>
            </Column>
            
            <Column field="customer" header="Customer" />
            
            <Column field="status" header="Status">
                <template #body="{ data }">
                    <Tag :value="data.status?.toUpperCase().replace('_', ' ')" :severity="getStatusSeverity(data.status)" />
                </template>
            </Column>
            
                        <Column field="qty_needed" header="Qty Needed" class="font-bold text-red-500 text-right" />
        </DataTable>
        
        <div v-if="incomingQty > 0" class="mt-3 p-2 text-sm text-500 bg-purple-50 border-round">
            <i class="pi pi-info-circle mr-2"></i>
            Current Net Required is reduced by <strong>{{ incomingQty }}</strong> units already expected on incoming Purchase Orders.
        </div>

        <template #footer>
            <div class="flex justify-content-end">
                <small class="text-xs text-300">ProductDemandDialog.vue</small>
            </div>
        </template>
    </Dialog>
</template>