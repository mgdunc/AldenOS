<script setup lang="ts">
import { ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/formatDate'
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
const onOrderLines = ref<any[]>([])

const fetchIncoming = async () => {
    if (!props.productId || !props.visible) return
    
    loading.value = true
    const { data, error } = await supabase
        .from('purchase_order_lines')
        .select(`
            quantity_ordered, 
            quantity_received, 
            purchase_orders!inner(id, po_number, status, expected_date)
        `)
        .eq('product_id', props.productId)
        .in('purchase_orders.status', ['placed', 'partial_received'])

    if (error) {
        console.error('On Order Dialog Error:', error)
        onOrderLines.value = []
    } else if (data) {
        onOrderLines.value = data.map((d: any) => ({
            id: d.purchase_orders.id,
            po_number: d.purchase_orders.po_number,
            status: d.purchase_orders.status,
            expected_date: d.purchase_orders.expected_date,
            qty_due: (d.quantity_ordered || 0) - (d.quantity_received || 0)
        })).filter(d => d.qty_due > 0)
    }
    loading.value = false
}

watch(() => props.visible, (newVal) => { if (newVal) fetchIncoming() })
</script>

<template>
    <Dialog 
        :visible="visible" 
        @update:visible="emit('update:visible', $event)"
        :header="`On Order: ${productSku}`" 
        modal 
        :style="{ width: '60vw' }"
        dismissableMask
    >
        <DataTable :value="onOrderLines" :loading="loading" size="small" stripedRows paginator :rows="10">
            <template #empty>
                <div class="p-4 text-center text-500">No incoming Purchase Orders for this product.</div>
            </template>
            
            <Column field="po_number" header="PO #">
                <template #body="{ data }">
                    <router-link :to="`/purchases/${data.id}`" class="text-primary font-bold no-underline hover:underline">
                        {{ data.po_number }}
                    </router-link>
                </template>
            </Column>
            
            <Column field="expected_date" header="Expected Arrival">
                <template #body="{ data }">{{ formatDate(data.expected_date) }}</template>
            </Column>
            
            <Column field="status" header="Status">
                <template #body="{ data }">
                    <Tag :value="data.status?.toUpperCase()" severity="info" />
                </template>
            </Column>
            
            <Column field="qty_due" header="Qty Due" class="font-bold text-purple-600" />
        </DataTable>
        <template #footer>
            <div class="flex justify-content-end">
                <small class="text-xs text-300">ProductOnOrderDialog.vue</small>
            </div>
        </template>
    </Dialog>
</template>