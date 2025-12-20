<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { formatDate } from '@/lib/formatDate'

// PrimeVue
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputNumber from 'primevue/inputnumber'
import Dropdown from 'primevue/dropdown'
import Panel from 'primevue/panel'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const poId = route.query.po_id as string
const po = ref<any>(null)
const lines = ref<any[]>([])
const locations = ref<any[]>([])
const loading = ref(true)
const processing = ref(false)
const notes = ref('')

const fetchData = async () => {
    if (!poId) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'No Purchase Order specified.' })
        router.push('/receipts')
        return
    }

    loading.value = true

    // 1. Fetch PO Header
    const { data: poData, error: poError } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('id', poId)
        .single()

    if (poError || !poData) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Purchase Order not found.' })
        router.push('/receipts')
        return
    }
    po.value = poData

    // 2. Fetch Locations
    const { data: locData } = await supabase.from('locations').select('id, name').order('name')
    locations.value = locData || []
    const defaultLocation = locations.value.find(l => l.name === 'Default' || l.name === 'Warehouse') || locations.value[0]

    // 3. Fetch PO Lines
    const { data: lineData } = await supabase
        .from('purchase_order_lines')
        .select(`*, products (sku, name)`)
        .eq('purchase_order_id', poId)

    // 4. Prepare Receipt Lines
    lines.value = (lineData || []).map(l => ({
        po_line_id: l.id,
        product_id: l.product_id,
        sku: l.products.sku,
        name: l.products.name,
        qty_ordered: l.quantity_ordered,
        qty_received_prev: l.quantity_received || 0,
        // Default to remaining quantity
        qty_to_receive: Math.max(0, l.quantity_ordered - (l.quantity_received || 0)),
        location_id: defaultLocation?.id
    }))

    loading.value = false
}

const processReceipt = async () => {
    const itemsToReceive = lines.value.filter(l => l.qty_to_receive > 0)
    
    if (itemsToReceive.length === 0) {
        toast.add({ severity: 'warn', summary: 'Empty', detail: 'No items to receive.' })
        return
    }

    if (!confirm(`Receive ${itemsToReceive.length} items? This will update inventory.`)) return

    processing.value = true

    try {
        // 1. Create Receipt Header
        const receiptNum = `REC-${po.value.po_number}-${Date.now().toString().slice(-4)}`
        const { data: receipt, error: rErr } = await supabase
            .from('inventory_receipts')
            .insert({
                purchase_order_id: poId,
                receipt_number: receiptNum,
                received_at: new Date(),
                notes: notes.value
                // received_by: user_id (handled by RLS or trigger usually, or we can skip)
            })
            .select()
            .single()

        if (rErr) throw rErr

        // 2. Create Receipt Lines & Update Inventory (Ideally this should be an RPC for safety)
        // For now, we'll do it in a loop or batch. 
        // Note: If you have an RPC 'process_receipt_items', use that. 
        // I will assume we need to do it manually here or call a generic RPC.
        
        // Let's try to use the client-side approach for now, but it's risky.
        // Better: Insert receipt lines, then have a DB trigger update stock? 
        // Or just do it manually.

        const receiptLinesPayload = itemsToReceive.map(l => ({
            receipt_id: receipt.id,
            product_id: l.product_id,
            location_id: l.location_id,
            quantity_received: l.qty_to_receive
        }))

        const { error: rlErr } = await supabase.from('inventory_receipt_lines').insert(receiptLinesPayload)
        if (rlErr) throw rlErr

        // 3. Update PO Lines & Physical Stock
        for (const item of itemsToReceive) {
            if (!item.location_id) {
                throw new Error(`No location selected for product ${item.sku}`);
            }

            // A. Update PO Line Received Qty
            await supabase.rpc('increment_po_line_received', { 
                p_line_id: item.po_line_id, 
                p_qty: item.qty_to_receive 
            })

            // B. Update Physical Stock (Products table + Ledger)
            const { error: stockErr } = await supabase.rpc('book_in_stock', {
                p_product_id: item.product_id,
                p_location_id: item.location_id,
                p_quantity: item.qty_to_receive,
                p_reference_id: receipt.id,
                p_notes: `Receipt ${receiptNum} (PO: ${po.value.po_number})`,
                p_idempotency_key: self.crypto.randomUUID()
            })
            
            if (stockErr) throw stockErr
        }

        // 4. Update PO Status
        // Check if fully received
        const allFullyReceived = lines.value.every(l => {
            const current = l.qty_to_receive // what we just added
            const prev = l.qty_received_prev
            const total = current + prev
            return total >= l.qty_ordered
        })
        
        const newStatus = allFullyReceived ? 'received' : 'partial_received'
        await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', poId)

        toast.add({ severity: 'success', summary: 'Success', detail: 'Receipt processed successfully.' })
        router.push(`/receipts/${receipt.id}`)

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
                <Button label="Confirm Receipt" icon="pi pi-check" severity="success" @click="processReceipt" :loading="processing" />
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
                                <Dropdown v-model="data.location_id" :options="locations" optionLabel="name" optionValue="id" class="w-full" />
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