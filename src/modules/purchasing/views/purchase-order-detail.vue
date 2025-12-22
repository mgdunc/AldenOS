<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { formatCurrency } from '@/lib/formatCurrency'
import { usePurchaseOrder } from '@/modules/purchasing/composables/usePurchaseOrder'
import AddProductDialog from '@/modules/inventory/components/AddProductDialog.vue'
import ProductDemandDialog from '@/modules/inventory/components/ProductDemandDialog.vue'
import TimelineSidebar from '@/modules/core/components/TimelineSidebar.vue'

// PrimeVue
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Panel from 'primevue/panel'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import ProgressBar from 'primevue/progressbar'
import Dialog from 'primevue/dialog'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'

import { getStatusSeverity } from '@/lib/statusHelpers'
import { formatDate } from '@/lib/formatDate'

import AttachmentGallery from '@/modules/core/components/AttachmentGallery.vue'

/**
 * PurchaseOrderDetailView.vue
 * 
 * Manages the detailed view of a Purchase Order (PO).
 * 
 * Features:
 * - Displays PO status, supplier, and expected dates.
 * - Manages line items (add, edit, delete) in Draft state.
 * - Handles PO lifecycle: Draft -> Placed -> Received.
 * - Shows receipt history and attachment gallery.
 * - Integrates with Inventory Demand to show required stock.
 */

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()
const poId = route.params.id as string

// Use Composable
const { 
    po, 
    lines, 
    receipts, 
    suppliers, 
    allocations, 
    loading, 
    processing, 
    isDraft, 
    isPlaced, 
    totalAmount, 
    fetchData, 
    updateStatus, 
    receiveAll, 
    updateLine, 
    deleteLine, 
    updateSupplier, 
    updateExpectedDate, 
    onProductSelected 
} = usePurchaseOrder(poId)

// Local UI State
const showAddDialog = ref(false)
const showReceiptsDialog = ref(false)
const showDemandDialog = ref(false)
const receiptsLoading = ref(false)

const selectedProductReceipts = ref<any[]>([])
const selectedProductId = ref('') 
const selectedProductSku = ref('')

// --- UI ACTIONS (With Confirmation) ---

/**
 * Wraps the status update with a confirmation dialog.
 */
const handleUpdateStatus = (status: string) => {
    confirm.require({
        message: `Mark status as ${status.toUpperCase()}?`,
        header: 'Update Status',
        icon: 'pi pi-info-circle',
        accept: () => updateStatus(status)
    })
}

/**
 * Wraps the receive all action with a confirmation dialog.
 */
const handleReceiveAll = () => {
    confirm.require({
        message: 'Receive ALL items into default location?',
        header: 'Receive All',
        icon: 'pi pi-box',
        accept: () => receiveAll()
    })
}

/**
 * Wraps the delete line action with a confirmation dialog.
 */
const handleDeleteLine = (id: string) => {
    confirm.require({
        message: 'Remove item?',
        header: 'Delete Line',
        icon: 'pi pi-trash',
        acceptClass: 'p-button-danger',
        accept: () => deleteLine(id)
    })
}

const openDemandBreakdown = (product: any) => {
    selectedProductId.value = product.id
    selectedProductSku.value = product.sku
    showDemandDialog.value = true
}

const viewReceiptsBreakdown = async (product: any) => {
    selectedProductSku.value = product.sku
    showReceiptsDialog.value = true
    receiptsLoading.value = true
    const { data } = await supabase
        .from('inventory_ledger')
        .select(`created_at, change_qoh, locations (name), notes`)
        .eq('product_id', product.id)
        .eq('reference_id', poId)
        .eq('transaction_type', 'po_received')
        .order('created_at', { ascending: false })
    selectedProductReceipts.value = data || []
    receiptsLoading.value = false
}

const printOrder = () => { window.print() }

const getReceiptProgress = (receipt: any) => {
    if (!receipt.inventory_receipt_lines) return '-'
    const totalRec = receipt.inventory_receipt_lines.reduce((sum: number, line: any) => sum + line.quantity_received, 0)
    const productIds = receipt.inventory_receipt_lines.map((l: any) => l.product_id)
    const relevantPOLines = lines.value.filter(l => productIds.includes(l.product_id))
    const totalOrd = relevantPOLines.reduce((sum: number, line: any) => sum + line.quantity_ordered, 0)
    return `${totalRec} / ${totalOrd}`
}

onMounted(fetchData)
</script>

<template>
    <div v-if="loading" class="flex justify-content-center p-6"><i class="pi pi-spin pi-spinner text-4xl text-500"></i></div>
    <div v-else-if="po" class="flex flex-column gap-4 print-container">
        
        <!-- Header Section -->
        <div class="surface-card p-4 shadow-2 border-round print:shadow-none print:border-none">
            <div class="flex justify-content-between align-items-start mb-4">
                <div class="flex align-items-center gap-3">
                    <h1 class="text-3xl font-bold m-0 text-900">{{ po.po_number }}</h1>
                    <Tag :value="po.status?.toUpperCase()" :severity="getStatusSeverity(po.status)" class="text-sm font-bold px-3 py-1" />
                </div>
                <div class="flex gap-2 print:hidden">
                    <Button label="Download PO" icon="pi pi-download" severity="secondary" outlined @click="printOrder" />
                    <Button v-if="po.status !== 'cancelled' && isDraft" label="Cancel" severity="danger" outlined icon="pi pi-times" @click="handleUpdateStatus('cancelled')" :loading="processing" />
                    <Button v-if="isDraft" label="Place Order" icon="pi pi-check" @click="handleUpdateStatus('placed')" :disabled="lines.length === 0" :loading="processing" />
                    <Button v-if="po.status === 'placed'" label="Revert to Draft" icon="pi pi-undo" severity="warning" outlined @click="handleUpdateStatus('draft')" :loading="processing" />
                    <Button v-if="isPlaced" label="Receive" icon="pi pi-box" severity="success" @click="handleReceiveAll" :loading="processing" />
                </div>
            </div>

            <div class="grid">
                <div class="col-12 md:col-4">
                    <div class="surface-50 p-3 border-round h-full flex align-items-start gap-3">
                        <i class="pi pi-building text-2xl text-500 mt-1"></i>
                        <div class="flex-1">
                            <span class="text-500 text-sm font-medium block mb-2">Supplier</span>
                            <div v-if="isDraft" class="print:hidden">
                                <Select v-model="po.supplier_id" :options="suppliers" optionLabel="name" optionValue="id" class="w-full" @change="updateSupplier" placeholder="Select Supplier" />
                            </div>
                            <div class="text-xl font-bold text-900 mt-2">{{ po.supplier_name || 'Unknown Supplier' }}</div>
                        </div>
                    </div>
                </div>
                <div class="col-12 md:col-4">
                    <div class="surface-50 p-3 border-round h-full flex align-items-start gap-3">
                        <i class="pi pi-calendar text-2xl text-500 mt-1"></i>
                        <div class="flex-1">
                            <span class="text-500 text-sm font-medium block mb-2">Expected Arrival</span>
                            <DatePicker v-model="po.expected_date" dateFormat="yy-mm-dd" showIcon @value-change="updateExpectedDate" v-if="isDraft || isPlaced" class="w-full print:hidden" />
                            <div v-else class="text-xl font-bold text-900 mt-2">{{ formatDate(po.expected_date) || 'TBD' }}</div>
                        </div>
                    </div>
                </div>
                <div class="col-12 md:col-4">
                    <div class="surface-50 p-3 border-round h-full flex align-items-start gap-3">
                        <i class="pi pi-dollar text-2xl text-500 mt-1"></i>
                        <div class="flex-1 flex flex-column justify-content-between h-full">
                            <span class="text-500 text-sm font-medium block">Total Amount</span>
                            <div class="text-3xl font-bold text-primary text-right mt-auto">{{ formatCurrency(totalAmount) }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <Tabs value="0">
            <TabList>
                <Tab value="0">Order Items</Tab>
                <Tab value="1">Receipt History <Tag v-if="receipts.length" :value="receipts.length" severity="secondary" class="ml-2" /></Tab>
                <Tab value="2">Attachments</Tab>
            </TabList>
            <TabPanels>
                <TabPanel value="0">
                    <div class="flex justify-content-end mb-3">
                        <Button label="Add Product" icon="pi pi-plus" size="small" @click="showAddDialog = true" :disabled="!isDraft" class="print:hidden" />
                    </div>
                    <DataTable :value="lines" stripedRows class="print:w-full" showGridlines>
                <Column field="products.sku" header="SKU" style="width: 10rem">
                    <template #body="{ data }">
                        <router-link :to="`/product/${data.products.id}`" class="text-primary font-bold no-underline hover:underline">
                            {{ data.products.sku }}
                        </router-link>
                    </template>
                </Column>
                <Column field="products.name" header="Product" />
                
                <Column v-if="!isDraft" header="Fulfillment" style="min-width: 12rem">
                    <template #body="{ data }">
                        <div class="flex flex-column gap-2">
                            <div class="flex align-items-center justify-content-between">
                                <span class="text-sm font-medium text-700">Received:</span>
                                <span class="text-lg font-bold" :class="data.quantity_received >= data.quantity_ordered ? 'text-green-600' : 'text-900'">
                                    {{ data.quantity_received || 0 }} / {{ data.quantity_ordered }}
                                </span>
                            </div>

                            <div class="flex align-items-center gap-2">
                                <ProgressBar 
                                    :value="Math.min(Math.round(((data.quantity_received || 0) / data.quantity_ordered) * 100), 100)" 
                                    :showValue="false"
                                    class="flex-1"
                                    style="height: 6px"
                                    :class="data.quantity_received >= data.quantity_ordered ? 'bg-green-100' : 'bg-gray-200'"
                                />
                                <Button 
                                    v-if="data.quantity_received > 0" 
                                    icon="pi pi-list" 
                                    text 
                                    rounded 
                                    size="small" 
                                    severity="secondary"
                                    @click="viewReceiptsBreakdown(data.products)" 
                                    v-tooltip.top="'View Receipt History'"
                                    class="print:hidden" 
                                />
                            </div>
                        </div>
                    </template>
                </Column>

                <Column header="Demand" style="width: 10rem" class="print:hidden">
                    <template #body="{ data }">
                        <div v-if="allocations[data.product_id]" class="flex align-items-center gap-2">
                            <Tag 
                                severity="warn" 
                                :value="`${allocations[data.product_id]} Required`" 
                                class="font-bold" 
                            />
                            <Button 
                                icon="pi pi-list" 
                                text 
                                rounded 
                                size="small" 
                                severity="warning"
                                @click="openDemandBreakdown(data.products)" 
                                v-tooltip.top="'View Sales Orders'"
                            />
                        </div>
                        <span v-else class="text-300 text-sm">No Demand</span>
                    </template>
                </Column>

                <Column header="Qty" style="width: 8rem" class="print:hidden">
                    <template #body="{ data }">
                        <InputNumber v-if="isDraft" v-model="data.quantity_ordered" :min="1" @blur="updateLine(data)" inputClass="w-4rem text-center font-bold" showButtons buttonLayout="horizontal" :step="1" decrementButtonClass="p-button-secondary p-button-text" incrementButtonClass="p-button-secondary p-button-text" />
                        <span v-else class="text-xl font-bold">{{ data.quantity_ordered }}</span>
                    </template>
                </Column>

                <Column header="Unit Cost" style="width: 10rem">
                    <template #body="{ data }">
                        <InputNumber v-if="isDraft" v-model="data.unit_cost" mode="currency" currency="GBP" locale="en-GB" @blur="updateLine(data)" class="print:hidden w-full" />
                        <span v-else>{{ formatCurrency(data.unit_cost) }}</span>
                    </template>
                </Column>
                <Column header="Total" style="width: 10rem" class="text-right">
                    <template #body="{ data }"><span class="font-bold text-lg">{{ formatCurrency(data.quantity_ordered * data.unit_cost) }}</span></template>
                </Column>
                <Column style="width: 4rem" class="print:hidden">
                    <template #body="{ data }"><Button v-if="isDraft" icon="pi pi-trash" text severity="danger" @click="handleDeleteLine(data.id)" /></template>
                </Column>

                <template #footer>
                    <div class="flex justify-content-end pr-6">
                        <div class="flex flex-column gap-2 w-15rem">
                            <div class="flex justify-content-between text-500">
                                <span>Subtotal:</span>
                                <span>{{ formatCurrency(totalAmount) }}</span>
                            </div>
                            <div class="flex justify-content-between text-500">
                                <span>Tax (0%):</span>
                                <span>$0.00</span>
                            </div>
                            <div class="flex justify-content-between font-bold text-xl text-900 border-top-1 surface-border pt-2">
                                <span>Total:</span>
                                <span class="text-primary">{{ formatCurrency(totalAmount) }}</span>
                            </div>
                        </div>
                    </div>
                </template>
            </DataTable>
                </TabPanel>

                <TabPanel value="1">
                    <div v-if="receipts.length === 0" class="text-center p-4 text-500">No receipts found.</div>
                    <DataTable v-else :value="receipts" stripedRows size="small">
                        <Column field="receipt_number" header="Receipt #" />
                        <Column field="received_at" header="Date">
                            <template #body="{ data }">{{ formatDate(data.received_at) }}</template>
                        </Column>
                        <Column header="Received / Ordered">
                            <template #body="{ data }">
                                <span class="font-bold">{{ getReceiptProgress(data) }}</span>
                            </template>
                        </Column>
                        <Column field="notes" header="Notes" />
                        <Column header="Actions" style="width: 4rem">
                            <template #body="{ data }">
                                <Button icon="pi pi-eye" text rounded severity="secondary" @click="router.push(`/receipts/${data.id}`)" />
                            </template>
                        </Column>
                    </DataTable>
                </TabPanel>

                <TabPanel value="2">
                    <AttachmentGallery 
                        v-if="po"
                        v-model="po.attachment_url" 
                        bucket="po-attachments" 
                        :folder-id="poId" 
                        table-name="purchase_orders" 
                        column-name="attachment_url"
                        @uploaded="fetchData"
                        @deleted="fetchData"
                    />
                </TabPanel>
            </TabPanels>
        </Tabs>

        <!-- Timeline Section -->
        <div class="surface-card shadow-2 border-round overflow-hidden" style="height: 600px;">
            <TimelineSidebar 
                v-if="po" 
                :entity-id="po.id" 
                entity-type="purchase_order" 
            />
        </div>
    </div>

    <Dialog v-model:visible="showReceiptsDialog" :header="`Receipt History: ${selectedProductSku}`" modal :style="{ width: '50vw' }">
        <DataTable :value="selectedProductReceipts" :loading="receiptsLoading" size="small" stripedRows>
            <Column field="created_at" header="Date"><template #body="{ data }">{{ new Date(data.created_at).toLocaleString() }}</template></Column>
            <Column field="locations.name" header="Location" />
            <Column field="change_qoh" header="Qty" class="text-green-600 font-bold" />
            <Column field="notes" header="Note" />
        </DataTable>
    </Dialog>

    <ProductDemandDialog 
        v-model:visible="showDemandDialog" 
        :product-id="selectedProductId"
        :product-sku="selectedProductSku"
    />

    <AddProductDialog v-model:visible="showAddDialog" :order-id="poId" @product-selected="onProductSelected" />
</template>

<style scoped>
:deep(.received-complete .p-progressbar-value) {
    background: #22c55e !important;
}
:deep(.p-progressbar) {
    background: #f1f5f9;
    border-radius: 10px;
}
@media print {
    .layout-sidebar, .layout-topbar, .p-toast, .print\:hidden { display: none !important; }
    .print-container { width: 100%; margin: 0; padding: 0; }
    body { background-color: white; }
    .p-progressbar { 
        -webkit-print-color-adjust: exact; 
        print-color-adjust: exact;
    }
}
</style>