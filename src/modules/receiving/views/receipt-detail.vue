<script setup lang="ts">
/**
 * COMPONENT: ReceiptDetailView.vue
 * PURPOSE: Read-only view of a specific historical receipt.
 * NOTE: To create NEW receipts, use the 'PurchaseDetailView'.
 */

import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useReceiving } from '../composables/useReceiving'
import { useConfirm } from 'primevue/useconfirm'
import { formatDate } from '@/lib/formatDate'
import type { InventoryReceiptWithRelations, InventoryReceiptLineWithRelations } from '../types'

// --- Components ---
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Panel from 'primevue/panel'
import Dialog from 'primevue/dialog'
import PurchaseOrderDetailView from '@/modules/purchasing/views/purchase-order-detail.vue'

const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const { loadReceiptById, cancelReceipt: cancelReceiptRpc, loading } = useReceiving()

const receiptId = route.params.id as string
const receipt = ref<InventoryReceiptWithRelations | null>(null)
const lines = ref<InventoryReceiptLineWithRelations[]>([])
const showPoDialog = ref(false)

const fetchReceiptData = async () => {
    const result = await loadReceiptById(receiptId)
    
    if (!result.receipt) {
        router.push('/receipts')
        return
    }
    
    receipt.value = result.receipt
    lines.value = result.lines
}

const goToPO = () => {
    if (receipt.value?.purchase_orders?.id) {
        showPoDialog.value = true
    }
}

const navigateToPO = () => {
    if (receipt.value?.purchase_orders?.id) {
        router.push(`/purchases/${receipt.value.purchase_orders.id}`)
    }
}

const cancelReceipt = () => {
    confirm.require({
        message: 'Are you sure you want to cancel this receipt? This will reverse inventory adjustments and update the PO status.',
        header: 'Cancel Receipt',
        icon: 'pi pi-exclamation-triangle',
        rejectProps: {
            label: 'Cancel',
            severity: 'secondary',
            outlined: true
        },
        acceptProps: {
            label: 'Confirm Cancellation',
            severity: 'danger'
        },
        accept: async () => {
            const success = await cancelReceiptRpc(receiptId)
            if (success) {
                router.push('/receipts')
            }
        }
    })
}

onMounted(() => fetchReceiptData())
</script>

<template>
    <div v-if="loading" class="flex justify-content-center p-6">
        <i class="pi pi-spin pi-spinner text-4xl text-500"></i>
    </div>

    <div v-else-if="receipt" class="flex flex-column gap-4">
        
        <div class="surface-card p-4 shadow-2 border-round flex flex-wrap justify-content-between align-items-center gap-3">
            <div>
                <div class="text-500 text-sm mb-1">Receipt Record</div>
                <div class="flex align-items-center gap-3">
                    <h1 class="text-3xl font-bold m-0">{{ receipt.receipt_number }}</h1>
                    <Tag :value="receipt.notes?.includes('[REVERTED]') ? 'CANCELLED' : 'COMPLETED'" :severity="receipt.notes?.includes('[REVERTED]') ? 'danger' : 'success'" />
                </div>
                <div class="mt-2 text-sm text-600">
                    Received on {{ formatDate(receipt.received_at) }} 
                    <!-- by <span class="font-semibold">{{ receipt.received_by_user?.email || 'Unknown' }}</span> -->
                </div>
            </div>

            <div class="flex gap-2">
                <Button label="Back to List" icon="pi pi-arrow-left" text @click="router.push('/receipts')" />
                <Button v-if="!receipt.notes?.includes('[REVERTED]')" label="Cancel Receipt" icon="pi pi-times" severity="danger" outlined @click="cancelReceipt" />
            </div>
        </div>

        <div class="grid">
            <div class="col-12 md:col-6">
                <div class="surface-card p-3 border-round shadow-1 h-full">
                    <div class="text-500 font-medium text-sm mb-2">Vendor Details</div>
                    <div class="font-bold text-xl">{{ receipt.purchase_orders?.supplier_name }}</div>
                    <div class="text-600 flex align-items-center gap-2 mt-1">
                        <span>PO: {{ receipt.purchase_orders?.po_number }}</span>
                        <Button icon="pi pi-external-link" text rounded size="small" @click="goToPO" v-tooltip="'View Purchase Order'" />
                    </div>
                </div>
            </div>
        </div>

        <Panel header="Items Received">
            <DataTable :value="lines" stripedRows showGridlines>
                <Column field="products.sku" header="SKU" style="width: 15%"></Column>
                <Column field="products.name" header="Product"></Column>
                <Column field="locations.name" header="Putaway Location">
                    <template #body="{ data }">
                        <Tag :value="data.locations?.name || 'Default'" severity="info" />
                    </template>
                </Column>
                <Column field="quantity_received" header="Qty Received" style="width: 10%">
                    <template #body="{ data }">
                        <span class="text-green-600 font-bold">+{{ data.quantity_received }}</span>
                    </template>
                </Column>
            </DataTable>
        </Panel>

        <Dialog v-model:visible="showPoDialog" modal :style="{ width: '90vw' }" :dismissableMask="true">
            <template #header>
                <div class="flex align-items-center gap-2">
                    <span class="font-bold text-xl">Purchase Order Details</span>
                    <Button icon="pi pi-external-link" text rounded @click="navigateToPO" v-tooltip="'Open in full page'" />
                </div>
            </template>
            <PurchaseOrderDetailView v-if="showPoDialog && receipt?.purchase_orders?.id" :id="receipt.purchase_orders.id" />
        </Dialog>

    </div>
</template>