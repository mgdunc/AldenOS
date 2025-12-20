<script setup lang="ts">
import { ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { getStatusSeverity } from '@/lib/statusHelpers'
import Dialog from 'primevue/dialog'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'

const props = defineProps<{
    visible: boolean,
    productId: string | undefined,
    productSku: string | undefined
}>()

const emit = defineEmits(['update:visible'])

const loading = ref(false)
const reservedLines = ref<any[]>([])

const fetchReservations = async () => {
    if (!props.productId || !props.visible) return
    
    loading.value = true
    
    // FETCH: Uses quantity_ordered to match your schema and prevent NaN
    const { data, error } = await supabase
        .from('sales_order_lines')
        .select(`
            quantity_ordered, 
            quantity_fulfilled, 
            sales_orders!inner(id, order_number, status, customer_name, is_open)
        `)
        .eq('product_id', props.productId)
        .eq('sales_orders.is_open', true)
        .in('sales_orders.status', ['reserved', 'picking', 'packed', 'partially_shipped'])

    if (error) {
        console.error('Reserved Dialog Error:', error)
        reservedLines.value = []
    } else if (data) {
        reservedLines.value = data.map(d => ({
            id: d.sales_orders.id,
            order_number: d.sales_orders.order_number,
            customer: d.sales_orders.customer_name,
            status: d.sales_orders.status,
            // LOGIC: Prevents NaN by using correct column names
            qty_reserved: (d.quantity_ordered || 0) - (d.quantity_fulfilled || 0)
        })).filter(d => d.qty_reserved > 0)
    }
    loading.value = false
}

watch(() => props.visible, (newVal) => { if (newVal) fetchReservations() })
</script>

<template>
    <Dialog 
        :visible="visible" 
        @update:visible="emit('update:visible', $event)"
        :header="`Active Reservations: ${productSku}`" 
        modal 
        :style="{ width: '60vw' }"
        dismissableMask
    >
        <DataTable :value="reservedLines" :loading="loading" size="small" stripedRows paginator :rows="10">
            <template #empty>
                <div class="p-4 text-center text-500">No active reservations for this product.</div>
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
            
            <Column field="qty_reserved" header="Qty Reserved" class="font-bold text-orange-600" />
        </DataTable>
        <template #footer>
            <div class="flex justify-content-end">
                <small class="text-xs text-300">ProductReservedDialog.vue</small>
            </div>
        </template>
    </Dialog>
</template>