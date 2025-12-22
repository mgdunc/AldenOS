<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'

// PrimeVue
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Panel from 'primevue/panel'
import Timeline from 'primevue/timeline'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const id = route.params.id as string
const fulfillment = ref<any>(null)
const lines = ref<any[]>([])
const loading = ref(true)
const processing = ref(false)

// Timeline events for visual progress
const events = ref([
    { status: 'draft', icon: 'pi pi-file', color: '#64748b' },
    { status: 'picking', icon: 'pi pi-shopping-cart', color: '#f59e0b' },
    { status: 'packed', icon: 'pi pi-box', color: '#3b82f6' },
    { status: 'shipped', icon: 'pi pi-truck', color: '#22c55e' }
]);

const loadData = async () => {
    loading.value = true
    // 1. Fetch Header
    const { data: header, error: headErr } = await supabase
        .from('fulfillments')
        .select('*, sales_orders(order_number)')
        .eq('id', id)
        .single()
    
    // 2. Fetch Lines (Linked to Products)
    const { data: items, error: lineErr } = await supabase
        .from('fulfillment_lines')
        .select('*, sales_order_lines(products(sku, name)), locations(name)')
        .eq('fulfillment_id', id)

    if (headErr || lineErr) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load fulfillment.' })
        router.push('/fulfillments')
    } else {
        fulfillment.value = header
        lines.value = items || []
    }
    loading.value = false
}

// --- WORKFLOW ACTIONS ---

// 1. Start Picking
const markAsPicking = async () => {
    processing.value = true
    await supabase.from('fulfillments').update({ status: 'picking' }).eq('id', id)
    await loadData()
    processing.value = false
}

// 2. Mark Packed (Items are in the box)
const markAsPacked = async () => {
    processing.value = true
    const { error } = await supabase.from('fulfillments').update({ status: 'packed' }).eq('id', id)
    
    if (error) {
        console.error(error)
        toast.add({ severity: 'error', summary: 'Error', detail: error.message })
    } else {
        await loadData()
    }
    processing.value = false
}

// 3. SHIP IT (Calls the SQL Function we wrote)
const shipFulfillment = () => {
    confirm.require({
        message: 'This will deduct inventory and finalize the shipment. Continue?',
        header: 'Confirm Shipment',
        icon: 'pi pi-exclamation-triangle',
        accept: async () => {
            processing.value = true
            const { error } = await supabase.rpc('process_fulfillment_shipment', { 
                p_fulfillment_id: id,
                p_idempotency_key: self.crypto.randomUUID()
            })

            if (error) {
                console.error(error)
                toast.add({ severity: 'error', summary: 'Error', detail: error.message })
            } else {
                toast.add({ severity: 'success', summary: 'Shipped!', detail: 'Inventory deducted successfully.' })
                await loadData()
            }
            processing.value = false
        }
    })
}

// 4. CANCEL IT
const cancelFulfillment = () => {
    confirm.require({
        message: 'Cancel this fulfillment? Stock will be returned to the Sales Order allocation.',
        header: 'Confirm Cancellation',
        icon: 'pi pi-exclamation-triangle',
        acceptClass: 'p-button-danger',
        accept: async () => {
            processing.value = true
            const { error } = await supabase.rpc('cancel_fulfillment_and_return_stock', {
                p_fulfillment_id: id,
                p_idempotency_key: self.crypto.randomUUID()
            })

            if (error) {
                console.error(error)
                toast.add({ severity: 'error', summary: 'Error', detail: error.message })
            } else {
                toast.add({ severity: 'success', summary: 'Cancelled', detail: 'Fulfillment cancelled and stock returned.' })
                await loadData()
            }
            processing.value = false
        }
    })
}

// 5. UNSHIP IT (Revert to Packed)
const unshipFulfillment = () => {
    confirm.require({
        message: 'Cancel this shipment? Stock will be returned to the warehouse and re-allocated to the order.',
        header: 'Cancel Shipment',
        icon: 'pi pi-exclamation-triangle',
        acceptClass: 'p-button-danger',
        accept: async () => {
            processing.value = true
            const { error } = await supabase.rpc('revert_fulfillment_shipment', {
                p_fulfillment_id: id,
                p_idempotency_key: self.crypto.randomUUID()
            })

            if (error) {
                console.error(error)
                toast.add({ severity: 'error', summary: 'Error', detail: error.message })
            } else {
                toast.add({ severity: 'success', summary: 'Cancelled', detail: 'Shipment cancelled and stock returned.' })
                await loadData()
            }
            processing.value = false
        }
    })
}

onMounted(() => {
    loadData()
})
</script>

<template>
    <div v-if="loading" class="flex justify-content-center p-6"><i class="pi pi-spin pi-spinner text-4xl text-500"></i></div>

    <div v-else-if="fulfillment" class="flex flex-column gap-4">
        
        <div class="surface-card p-4 shadow-2 border-round flex flex-wrap justify-content-between align-items-center gap-3">
            <div>
                <div class="text-500 text-sm mb-1">Order #{{ fulfillment.sales_orders?.order_number }}</div>
                <h1 class="text-3xl font-bold m-0">{{ fulfillment.fulfillment_number || 'New Fulfillment' }}</h1>
            </div>
            
            <div class="flex gap-2">
                <Button 
                    v-if="!['shipped', 'cancelled'].includes(fulfillment.status)" 
                    label="Cancel" 
                    icon="pi pi-times" 
                    severity="danger" 
                    outlined
                    @click="cancelFulfillment" 
                    :loading="processing" 
                />

                <Button 
                    v-if="fulfillment.status === 'draft'" 
                    label="Start Picking" 
                    icon="pi pi-play" 
                    @click="markAsPicking" 
                    :loading="processing" 
                />
                
                <Button 
                    v-if="fulfillment.status === 'picking'" 
                    label="Mark Packed" 
                    icon="pi pi-box" 
                    severity="info"
                    @click="markAsPacked" 
                    :loading="processing" 
                />

                <Button 
                    v-if="fulfillment.status === 'packed'" 
                    label="Ship Fulfillment" 
                    icon="pi pi-truck" 
                    severity="success"
                    @click="shipFulfillment" 
                    :loading="processing" 
                />

                <Button 
                    v-if="fulfillment.status === 'shipped'" 
                    label="Cancel Shipment" 
                    icon="pi pi-ban" 
                    severity="danger"
                    outlined
                    @click="unshipFulfillment" 
                    :loading="processing" 
                />

                 <Tag v-if="fulfillment.status === 'shipped'" severity="success" value="SHIPPED" icon="pi pi-check" class="text-lg p-2"/>
                 <Tag v-if="fulfillment.status === 'cancelled'" severity="danger" value="CANCELLED" icon="pi pi-times" class="text-lg p-2"/>
            </div>
        </div>

        <div class="surface-card p-4 shadow-2 border-round">
            <Timeline :value="events" layout="horizontal" align="top">
                <template #marker="slotProps">
                    <span 
                        class="flex w-2rem h-2rem align-items-center justify-content-center border-circle z-1 shadow-1" 
                        :style="{ backgroundColor: slotProps.item.status === fulfillment.status ? slotProps.item.color : '#e2e8f0', color: slotProps.item.status === fulfillment.status ? '#fff' : '#94a3b8' }"
                    >
                        <i :class="slotProps.item.icon"></i>
                    </span>
                </template>
                <template #content="slotProps">
                    <div class="text-sm text-700 mt-1 capitalize">{{ slotProps.item.status }}</div>
                </template>
            </Timeline>
        </div>

        <Panel header="Items to Pack" class="h-full">
            <DataTable :value="lines" stripedRows>
                <Column field="sales_order_lines.products.sku" header="SKU" style="width: 10rem" class="font-bold"/>
                <Column field="sales_order_lines.products.name" header="Product" />
                <Column field="locations.name" header="Location" style="width: 10rem">
                    <template #body="{ data }">
                        <Tag :value="data.locations?.name || 'Unassigned'" severity="info" icon="pi pi-map-marker" />
                    </template>
                </Column>
                <Column field="quantity" header="Qty" style="width: 6rem" class="text-center text-lg font-bold" />
                <Column header="Check" style="width: 4rem" v-if="fulfillment.status !== 'shipped'">
                    <template #body>
                        <i class="pi pi-square text-400 text-xl"></i>
                    </template>
                </Column>
            </DataTable>
        </Panel>

    </div>
</template>