<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { getStatusSeverity } from '@/lib/statusHelpers'
import { formatDate } from '@/lib/formatDate'
import Dialog from 'primevue/dialog'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'

const props = defineProps({
    visible: Boolean,
    productId: String,
    productSku: String
})

const emit = defineEmits(['update:visible'])

const loading = ref(false)
const demandLines = ref<any[]>([])
const reservedLines = ref<any[]>([])
const incomingLines = ref<any[]>([])

// Logic: Summary Calculations
const totalDemand = computed(() => demandLines.value.reduce((sum, i) => sum + i.qty, 0))
const totalReserved = computed(() => reservedLines.value.reduce((sum, i) => sum + i.qty, 0))
const totalIncoming = computed(() => incomingLines.value.reduce((sum, i) => sum + i.qty, 0))

const netRequired = computed(() => {
    const shortfall = (totalDemand.value + totalReserved.value) - totalIncoming.value
    return shortfall > 0 ? shortfall : 0
})

const fetchData = async () => {
    if (!props.productId || !props.visible) return
    loading.value = true

    // 1. Fetch Sales Demand (Backlog)
    const demandReq = supabase.from('sales_order_lines').select(`quantity_ordered, quantity_fulfilled, sales_orders!inner(id, order_number, status, customer_name)` )
        .eq('product_id', props.productId).in('sales_orders.status', ['requires_items', 'awaiting_stock'])

    // 2. Fetch Reservations (Allocated but not shipped)
    const reservedReq = supabase.from('sales_order_lines').select(`quantity_ordered, quantity_fulfilled, sales_orders!inner(id, order_number, status, customer_name)` )
        .eq('product_id', props.productId).in('sales_orders.status', ['reserved', 'picking', 'packed'])

    // 3. Fetch Incoming Supply (Purchase Orders)
    const incomingReq = supabase.from('purchase_order_lines').select(`quantity_ordered, quantity_received, purchase_orders!inner(id, po_number, status, expected_date)` )
        .eq('product_id', props.productId).in('purchase_orders.status', ['placed', 'partial_received'])

    const [dRes, rRes, iRes] = await Promise.all([demandReq, reservedReq, incomingReq])

    demandLines.value = dRes.data?.map(d => ({ id: d.sales_orders.id, order: d.sales_orders.order_number, customer: d.sales_orders.customer_name, status: d.sales_orders.status, qty: d.quantity_ordered - d.quantity_fulfilled })) || []
    reservedLines.value = rRes.data?.map(d => ({ id: d.sales_orders.id, order: d.sales_orders.order_number, customer: d.sales_orders.customer_name, status: d.sales_orders.status, qty: d.quantity_ordered - d.quantity_fulfilled })) || []
    incomingLines.value = iRes.data?.map(d => ({ id: d.purchase_orders.id, order: d.purchase_orders.po_number, status: d.purchase_orders.status, date: d.purchase_orders.expected_date, qty: d.quantity_ordered - d.quantity_received })) || []

    loading.value = false
}

watch(() => props.visible, (newVal) => { if (newVal) fetchData() })
</script>

<template>
    <Dialog :visible="visible" @update:visible="emit('update:visible', $event)" :header="`Inventory Allocation: ${productSku}`" modal :style="{ width: '75vw' }" dismissableMask>
        
        <div class="grid mb-4 text-center">
            <div class="col-12 md:col-3">
                <div class="p-3 border-round surface-card border-1 surface-border">
                    <span class="block text-500 font-bold mb-2 uppercase text-xs">Unmet Demand</span>
                    <span class="text-2xl font-bold text-red-500">{{ totalDemand }}</span>
                </div>
            </div>
            <div class="col-12 md:col-3">
                <div class="p-3 border-round surface-card border-1 surface-border">
                    <span class="block text-500 font-bold mb-2 uppercase text-xs">Reserved</span>
                    <span class="text-2xl font-bold text-orange-500">{{ totalReserved }}</span>
                </div>
            </div>
            <div class="col-12 md:col-3">
                <div class="p-3 border-round surface-card border-1 surface-border">
                    <span class="block text-500 font-bold mb-2 uppercase text-xs">Incoming (PO)</span>
                    <span class="text-2xl font-bold text-purple-600">{{ totalIncoming }}</span>
                </div>
            </div>
            <div class="col-12 md:col-3">
                <div class="p-3 border-round surface-primary text-white border-1 surface-border">
                    <span class="block font-bold mb-2 uppercase text-xs opacity-80">Final Net Required</span>
                    <span class="text-2xl font-bold">{{ netRequired }}</span>
                </div>
            </div>
        </div>

        <Tabs value="0">
            <TabList>
                <Tab value="0">Demand ({{ demandLines.length }})</Tab>
                <Tab value="1">Reserved ({{ reservedLines.length }})</Tab>
                <Tab value="2">Incoming ({{ incomingLines.length }})</Tab>
            </TabList>
            <TabPanels>
                <TabPanel value="0">
                    <DataTable :value="demandLines" size="small" stripedRows paginator :rows="5">
                        <Column field="order" header="SO #" />
                        <Column field="customer" header="Customer" />
                        <Column field="qty" header="Qty Needed" class="font-bold text-red-500 text-right" />
                    </DataTable>
                </TabPanel>
                <TabPanel value="1">
                    <DataTable :value="reservedLines" size="small" stripedRows paginator :rows="5">
                        <Column field="order" header="SO #" />
                        <Column field="status" header="Status" />
                        <Column field="qty" header="Qty Reserved" class="font-bold text-orange-500 text-right" />
                    </DataTable>
                </TabPanel>
                <TabPanel value="2">
                    <DataTable :value="incomingLines" size="small" stripedRows paginator :rows="5">
                        <Column field="order" header="PO #" />
                        <Column field="date" header="Expected"><template #body="{data}">{{ formatDate(data.date) }}</template></Column>
                        <Column field="qty" header="Qty Due" class="font-bold text-purple-600 text-right" />
                    </DataTable>
                </TabPanel>
            </TabPanels>
        </Tabs>
        <template #footer>
            <div class="flex justify-content-end">
                <small class="text-xs text-300">ProductAllocationDialog.vue</small>
            </div>
        </template>
    </Dialog>
</template>