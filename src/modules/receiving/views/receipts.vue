<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'vue-router'
import { formatDate } from '@/lib/formatDate'
import { FilterMatchMode } from '@primevue/core/api'

// PrimeVue
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'

const router = useRouter()
const receipts = ref<any[]>([])
const receivablePOs = ref<any[]>([])
const loading = ref(true)
const showNewReceiptDialog = ref(false)
const loadingPOs = ref(false)
const filters = ref({ global: { value: null, matchMode: FilterMatchMode.CONTAINS } })

const kpis = computed(() => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    
    return {
        total: receipts.value.length,
        thisMonth: receipts.value.filter(r => new Date(r.received_at) >= startOfMonth).length
    }
})

const fetchReceipts = async () => {
    loading.value = true
    const { data, error } = await supabase
        .from('inventory_receipts')
        .select(`
            id, 
            receipt_number, 
            received_at, 
            notes,
            purchase_orders (po_number, supplier_name)
        `)
        .order('received_at', { ascending: false })
    
    if (!error) receipts.value = data
    loading.value = false
}

const openNewReceiptDialog = async () => {
    showNewReceiptDialog.value = true
    loadingPOs.value = true
    const { data } = await supabase
        .from('purchase_orders')
        .select('*')
        .in('status', ['placed', 'partial', 'partial_received'])
        .order('expected_date', { ascending: true })
    
    receivablePOs.value = data || []
    loadingPOs.value = false
}

onMounted(fetchReceipts)
</script>

<template>
    <div class="flex flex-column gap-4">
        
        <!-- KPI Cards -->
        <div class="grid">
            <div class="col-12 md:col-6">
                <div class="surface-card shadow-2 p-3 border-round flex justify-content-between align-items-center h-full border-left-3 border-primary">
                    <div>
                        <span class="block text-500 font-medium mb-2">Total Receipts</span>
                        <div class="text-900 font-bold text-3xl">{{ kpis.total }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center bg-blue-100 border-round" style="width:3rem;height:3rem">
                        <i class="pi pi-history text-blue-500 text-xl"></i>
                    </div>
                </div>
            </div>
            <div class="col-12 md:col-6">
                <div class="surface-card shadow-2 p-3 border-round flex justify-content-between align-items-center h-full border-left-3 border-green-500">
                    <div>
                        <span class="block text-500 font-medium mb-2">Received This Month</span>
                        <div class="text-900 font-bold text-3xl">{{ kpis.thisMonth }}</div>
                    </div>
                    <div class="flex align-items-center justify-content-center bg-green-100 border-round" style="width:3rem;height:3rem">
                        <i class="pi pi-calendar text-green-500 text-xl"></i>
                    </div>
                </div>
            </div>
        </div>

        <!-- Main Table -->
        <div class="card shadow-2 p-0 border-round overflow-hidden surface-card">
            <div class="p-3 border-bottom-1 surface-border flex flex-wrap gap-2 justify-content-between align-items-center bg-gray-50">
                <div class="flex align-items-center gap-2">
                    <span class="text-xl font-bold text-900">Receipt History</span>
                    <Tag :value="receipts.length" severity="secondary" />
                </div>
                <div class="flex gap-2">
                    <IconField iconPosition="left">
                        <InputIcon class="pi pi-search" />
                        <InputText v-model="filters.global.value" placeholder="Search receipts..." class="p-inputtext-sm w-20rem" />
                    </IconField>
                    <Button icon="pi pi-refresh" outlined rounded @click="fetchReceipts" :loading="loading" v-tooltip.top="'Refresh'" />
                    <Button label="New Receipt" icon="pi pi-plus" severity="success" @click="openNewReceiptDialog" />
                </div>
            </div>

            <DataTable 
                :value="receipts" 
                :loading="loading" 
                paginator 
                :rows="10" 
                :filters="filters"
                stripedRows 
                showGridlines
                rowHover
                selectionMode="single" 
                @row-select="(e) => router.push(`/receipts/${e.data.id}`)"
                class="p-datatable-sm"
            >
                <template #empty><div class="p-5 text-center text-500">No receipts found.</div></template>

                <Column field="receipt_number" header="Receipt #" sortable style="width: 12rem">
                    <template #body="{ data }">
                        <span class="font-bold text-primary cursor-pointer hover:underline">{{ data.receipt_number }}</span>
                    </template>
                </Column>
                
                <Column field="purchase_orders.po_number" header="PO Reference" sortable style="width: 12rem">
                    <template #body="{ data }">
                        <Tag v-if="data.purchase_orders" :value="data.purchase_orders.po_number" severity="info" class="font-mono" />
                        <span v-else class="text-300">-</span>
                    </template>
                </Column>

                <Column field="purchase_orders.supplier_name" header="Supplier" sortable>
                    <template #body="{ data }">
                        <span class="font-medium">{{ data.purchase_orders?.supplier_name || 'Unknown' }}</span>
                    </template>
                </Column>

                <Column field="received_at" header="Date Received" sortable style="width: 12rem">
                    <template #body="{ data }">
                        <span class="text-sm">{{ formatDate(data.received_at) }}</span>
                    </template>
                </Column>

                <Column field="notes" header="Notes">
                    <template #body="{ data }">
                        <span class="text-500 text-sm">{{ data.notes || '-' }}</span>
                    </template>
                </Column>

                <Column style="width: 4rem">
                    <template #body>
                        <Button icon="pi pi-angle-right" text rounded severity="secondary" />
                    </template>
                </Column>
            </DataTable>
        </div>

        <!-- New Receipt Dialog -->
        <Dialog v-model:visible="showNewReceiptDialog" header="Select Purchase Order to Receive" modal :style="{ width: '50vw' }">
            <p class="text-500 mb-4">Select an open Purchase Order to create a receipt against.</p>
            
            <DataTable :value="receivablePOs" :loading="loadingPOs" stripedRows selectionMode="single" @row-select="(e) => router.push(`/purchases/${e.data.id}`)">
                <template #empty><div class="text-center p-4">No open Purchase Orders found.</div></template>
                <Column field="po_number" header="PO #" sortable class="font-bold" />
                <Column field="supplier_name" header="Supplier" sortable />
                <Column field="expected_date" header="Expected" sortable>
                    <template #body="{ data }">{{ formatDate(data.expected_date) }}</template>
                </Column>
                <Column header="Action" style="width: 8rem">
                    <template #body="{ data }">
                        <Button label="Receive" size="small" severity="success" @click="router.push(`/receipts/create?po_id=${data.id}`)" />
                    </template>
                </Column>
            </DataTable>
        </Dialog>
    </div>
</template>