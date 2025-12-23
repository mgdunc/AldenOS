<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { formatDate } from '@/lib/formatDate'
import { useReceiving } from '@/modules/receiving/composables/useReceiving'

// PrimeVue
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Panel from 'primevue/panel'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

// Use composable
const {
  loading,
  saving,
  loadPurchaseOrderForReceipt,
  processReceipt,
  updatePurchaseOrderStatus
} = useReceiving()

const poId = route.query.po_id as string
const po = ref<any>(null)
const lines = ref<any[]>([])
const locations = ref<any[]>([])
const processing = ref(false)
const notes = ref('')

const fetchData = async () => {
    if (!poId) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'No Purchase Order specified.' })
        router.push('/receipts')
        return
    }

    const result = await loadPurchaseOrderForReceipt(poId)
    
    if (!result.po) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Purchase Order not found.' })
        router.push('/receipts')
        return
    }

    po.value = result.po
    lines.value = result.lines
    locations.value = result.locations
}

const processReceiptAction = async () => {
    const itemsToReceive = lines.value.filter(l => l.qty_to_receive > 0)
    
    if (itemsToReceive.length === 0) {
        toast.add({ severity: 'warn', summary: 'Empty', detail: 'No items to receive.' })
        return
    }

    confirm.require({
        message: `Receive ${itemsToReceive.length} items? This will update inventory.`,
        header: 'Confirm Receipt',
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            await executeReceipt(itemsToReceive)
        }
    })
}

const executeReceipt = async (itemsToReceive: any[]) => {
    processing.value = true

    try {
        const receiptNum = `REC-${po.value.po_number}-${Date.now().toString().slice(-4)}`
        
        const result = await processReceipt(
            poId,
            receiptNum,
            itemsToReceive,
            notes.value
        )

        if (!result.success) {
            processing.value = false
            return
        }

        // Update PO Status
        const allFullyReceived = lines.value.every(l => {
            const current = l.qty_to_receive
            const prev = l.qty_received_prev
            const total = current + prev
            return total >= l.qty_ordered
        })
        
        const newStatus = allFullyReceived ? 'received' : 'partial_received'
        await updatePurchaseOrderStatus(poId, newStatus)

        router.push(`/receipts/${result.receiptId}`)
    } catch (error: any) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message })
    } finally {
        processing.value = false
    }
}

onMounted(fetchData)
</script>

<template>
    <div class="flex flex-column gap-4">
        <!-- Header -->
        <div class="surface-card p-4 shadow-2 border-round flex justify-content-between align-items-center">
            <div>
                <div class="text-500 text-sm mb-1">New Receipt for</div>
                <h1 class="text-3xl font-bold m-0">{{ po?.po_number }}</h1>
                <div class="text-600 mt-2">{{ po?.supplier_name }}</div>
            </div>
            <div class="flex gap-2">
                <Button label="Cancel" severity="secondary" outlined @click="router.back()" />
                <Button label="Confirm Receipt" icon="pi pi-check" severity="success" @click="processReceiptAction" :loading="processing" />
            </div>
        </div>

        <!-- Content -->
        <div class="grid">
            <div class="col-12 lg:col-8">
                <Panel header="Items to Receive">
                    <DataTable :value="lines" :loading="loading" stripedRows showGridlines>
                        <Column field="sku" header="SKU" style="width: 10rem" />
                        <Column field="name" header="Product" />
                        <Column field="qty_ordered" header="Ordered" style="width: 6rem" class="text-right" />
                        <Column field="qty_received_prev" header="Prev. Recv" style="width: 6rem" class="text-right">
                            <template #body="{ data }">
                                <span :class="{'text-green-600 font-bold': data.qty_received_prev > 0}">{{ data.qty_received_prev }}</span>
                            </template>
                        </Column>
                        <Column field="qty_to_receive" header="Receive Now" style="width: 8rem">
                            <template #body="{ data }">
                                <InputNumber v-model="data.qty_to_receive" :min="0" :max="data.qty_ordered - data.qty_received_prev" inputClass="w-full text-center font-bold" />
                            </template>
                        </Column>
                        <Column field="location_id" header="Location" style="width: 12rem">
                            <template #body="{ data }">
                                                            <div class="flex align-items-center gap-2">
                                <Select v-model="data.location_id" :options="locations" optionLabel="name" optionValue="id" class="w-full" />
                            </div>
                            </template>
                        </Column>
                    </DataTable>
                </Panel>
            </div>
            <div class="col-12 lg:col-4">
                <Panel header="Receipt Details">
                    <div class="flex flex-column gap-3">
                        <div class="flex flex-column gap-2">
                            <label class="font-bold">Notes</label>
                            <Textarea v-model="notes" rows="5" placeholder="Delivery notes, tracking numbers, etc." />
                        </div>
                        <div class="surface-100 p-3 border-round">
                            <div class="text-sm font-bold mb-2">Summary</div>
                            <div class="flex justify-content-between mb-1">
                                <span>Lines:</span>
                                <span>{{ lines.length }}</span>
                            </div>
                            <div class="flex justify-content-between">
                                <span>Receiving Items:</span>
                                <span class="font-bold text-primary">{{ lines.reduce((sum, l) => sum + (l.qty_to_receive || 0), 0) }}</span>
                            </div>
                        </div>
                    </div>
                </Panel>
            </div>
        </div>
    </div>
</template>