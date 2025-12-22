<script setup lang="ts">
/**
 * SalesOrderDetailView.vue
 * 
 * This component manages the detailed view of a sales order.
 * It handles:
 * - Displaying order details (customer, status, dates)
 * - Managing line items (add, edit, delete)
 * - Inventory allocation logic (checking stock, reserving items)
 * - Fulfillment processing (creating shipments)
 * - Address management
 */
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { formatCurrency } from '@/lib/formatCurrency'
import { formatDate } from '@/lib/formatDate'

// Custom Components
import AddProductDialog from '@/modules/inventory/components/AddProductDialog.vue' 
import ProductAllocationDialog from '@/modules/inventory/components/ProductAllocationDialog.vue'
import TimelineSidebar from '@/modules/core/components/TimelineSidebar.vue'

// PrimeVue Components
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Panel from 'primevue/panel'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message' 
import Calendar from 'primevue/calendar'
import Textarea from 'primevue/textarea'
import ProgressBar from 'primevue/progressbar'

import { getStatusSeverity } from '@/lib/statusHelpers'
import { useSalesOrder } from '@/modules/sales/composables/useSalesOrder'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const order = ref<any>(null)
const lines = ref<any[]>([])
const fulfillments = ref<any[]>([])
const incomingStock = ref<any>({}) 
const loading = ref(true)
const processing = ref(false) 
const orderId = route.params.id as string

// Use Composable
const { 
    hasAllocatedItems, 
    hasAllocatableStock, 
    isFullyAllocated, 
    calculatedTotal,
    canUnallocateLine,
    canAllocateLine
} = useSalesOrder(order, lines)

// Dialog States
const showNewLineDialog = ref(false) 
const showAllocationDialog = ref(false)
const selectedProductForAllocation = ref<any>(null)

// --- ALLOCATION LOGIC ---

// Opens the dialog to show detailed stock breakdown for a product
const openAllocationDetails = (product: any) => {
    selectedProductForAllocation.value = product
    showAllocationDialog.value = true
}

// Checks if all lines can be fully allocated from currently available stock
const isFullyAllocatable = computed(() => {
    return lines.value.every(l => l.available_now >= (l.quantity_ordered - (l.qty_shipped || 0) - (l.qty_in_fulfillment || 0)))
})

// Calculates the earliest possible dispatch date based on incoming POs for out-of-stock items
const suggestedDispatchDate = computed(() => {
    let latestDate: Date | null = null;
    lines.value.forEach(line => {
        if (line.available_now < line.quantity_ordered) {
            const incoming = incomingStock.value[line.product_id];
            if (incoming) {
                incoming.forEach((po: any) => {
                    if (po.date) {
                        const poDate = new Date(po.date);
                        if (!latestDate || poDate > latestDate) latestDate = poDate;
                    }
                });
            }
        }
    });
    return latestDate ? new Date(latestDate) : null;
})

const getFulfillmentSeverity = (status: string) => {
    switch (status?.toLowerCase()) {
        case 'shipped': return 'success';
        case 'packed': return 'primary'; 
        case 'picking': return 'warn';
        default: return 'secondary';
    }
}

const getStockSeverity = (val: number, ordered: number) => {
    if (val === 0) return 'danger'
    if (val < ordered) return 'warn'
    return 'success'
}

const hasFulfillments = computed(() => fulfillments.value.length > 0)

// --- DATA FETCHING ---

/**
 * Fetches all necessary data for the order view.
 * Strategies:
 * 1. Parallel fetching of Order Header and Fulfillments for speed.
 * 2. Sequential fetching of Lines to get Product IDs.
 * 3. Bulk fetching of Stock and Incoming POs using Product IDs to minimize DB calls.
 */
const fetchOrderData = async () => {
    loading.value = true
    try {
        // 1. Fetch Order Header & Fulfillments in parallel
        const [orderRes, fulfillRes] = await Promise.all([
            supabase.from('sales_orders').select('*, billing_address, shipping_address').eq('id', orderId).single(),
            supabase.from('fulfillments').select('*').eq('sales_order_id', orderId).order('created_at', { ascending: false })
        ])

        if (orderRes.error) {
            toast.add({ severity: 'error', summary: 'Error', detail: 'Order not found.' })
            router.push('/sales'); 
            loading.value = false;
            return;
        }

        order.value = orderRes.data
        fulfillments.value = fulfillRes.data || [] 

        // 2. Fetch Lines 
        const linesRes = await supabase
            .from('sales_order_lines')
            .select(`*, products (id, sku, name, list_price)`)
            .eq('sales_order_id', orderId)
            .order('created_at', { ascending: true })
        
        const rawLines = linesRes.data || []

        // 3. Extract IDs to make the stock query efficient
        // We only want stock for the products actually in this order
        const productIds = rawLines.map(l => l.product_id).filter(id => id)

        // 4. Fetch Stock from the VIEW (Architecture Alignment)
        let availMap: Record<string, number> = {}
        let fulfillMap: Record<string, any> = {}

        if (productIds.length > 0) {
            // A. Get Available Stock
            const { data: stockData } = await supabase
                .from('product_inventory_view') 
                .select('product_id, available') 
                .in('product_id', productIds)

            stockData?.forEach(row => {
                availMap[row.product_id] = row.available
            })

            // B. Get Fulfillment Quantities
            const { data: fulfillQty } = await supabase
                .rpc('get_line_fulfillment_qty', { p_order_id: orderId })
            
            fulfillQty?.forEach((row: any) => {
                fulfillMap[row.line_id] = row
            })
        }
        
        // 5. Map Data
        lines.value = rawLines.map(l => ({ 
            ...l, 
            available_now: (availMap[l.product_id] ?? 0),
            qty_allocated: l.quantity_allocated || 0,
            qty_in_fulfillment: (fulfillMap[l.id]?.qty_in_fulfillment ?? 0),
            qty_shipped: (fulfillMap[l.id]?.qty_shipped ?? 0),
            line_total: (l.quantity_ordered * l.unit_price) 
        }))

        // 6. Fetch Incoming POs (Optimized)
        if (productIds.length > 0) {
            const { data: incoming } = await supabase
                .from('purchase_order_lines')
                .select('product_id, quantity_ordered, purchase_orders!inner(po_number, expected_date, status)')
                .in('product_id', productIds)
                .eq('purchase_orders.status', 'placed')

            // 7. Map Incoming
            let incomingMap: Record<string, any[]> = {}
            incoming?.forEach((row: any) => {
                if (!incomingMap[row.product_id]) incomingMap[row.product_id] = []
                incomingMap[row.product_id]!.push({
                    po: row.purchase_orders.po_number,
                    date: row.purchase_orders.expected_date,
                    qty: row.quantity_ordered
                })
            })
            incomingStock.value = incomingMap
        }
    } catch (e) {
        console.error(e)
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load order data' })
    } finally {
        loading.value = false
    }
}

// --- ACTIONS ---

const updateOrder = async () => {
    const { error } = await supabase.from('sales_orders').update({ 
        billing_address: order.value.billing_address,
        shipping_address: order.value.shipping_address
    }).eq('id', orderId)
    
    if (error) toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save address.' })
    else toast.add({ severity: 'success', summary: 'Saved', detail: 'Address updated.' })
}

const saveDispatchDate = async () => {
    const { error } = await supabase.from('sales_orders').update({ dispatch_date: order.value.dispatch_date }).eq('id', orderId)
    if (!error) toast.add({ severity: 'success', summary: 'Saved', detail: 'Dispatch date updated.' })
}

const applySuggestedDate = () => {
    if (suggestedDispatchDate.value) {
        order.value.dispatch_date = suggestedDispatchDate.value
        saveDispatchDate()
    }
}

const revertToDraft = () => {
    if (hasAllocatedItems.value || hasFulfillments.value) {
        toast.add({ severity: 'error', summary: 'Cannot Revert', detail: 'Order has allocated or fulfilled items.' });
        return;
    }
    
    confirm.require({
        message: 'Are you sure you want to revert this order to Draft status?',
        header: 'Revert to Draft',
        icon: 'pi pi-exclamation-triangle',
        acceptClass: 'p-button-danger',
        accept: async () => {
            processing.value = true;
            const { error } = await supabase.from('sales_orders').update({ status: 'draft' }).eq('id', orderId);
            processing.value = false;

            if (error) toast.add({ severity: 'error', summary: 'Error', detail: error.message });
            else {
                toast.add({ severity: 'success', summary: 'Reverted', detail: 'Order is now in Draft.' });
                await fetchOrderData();
            }
        }
    });
}

const cancelOrder = () => {
    if (hasAllocatedItems.value || hasFulfillments.value) {
        toast.add({ severity: 'error', summary: 'Cannot Cancel', detail: 'Order has allocated or fulfilled items. Please unallocate first.' });
        return;
    }
    
    confirm.require({
        message: 'Are you sure you want to permanently cancel this order?',
        header: 'Cancel Order',
        icon: 'pi pi-exclamation-triangle',
        acceptClass: 'p-button-danger',
        accept: async () => {
            processing.value = true;
            const { error } = await supabase.from('sales_orders').update({ status: 'cancelled' }).eq('id', orderId);
            processing.value = false;

            if (error) toast.add({ severity: 'error', summary: 'Error', detail: error.message });
            else {
                toast.add({ severity: 'success', summary: 'Cancelled', detail: 'Order cancelled.' });
                await fetchOrderData();
            }
        }
    });
}

const confirmOrder = async () => {
    if (lines.value.length === 0) return;
    processing.value = true;

    // Save all lines first to ensure latest edits are persisted
    const updates = lines.value.map(line => 
        supabase.from('sales_order_lines')
            .update({ quantity_ordered: line.quantity_ordered, unit_price: line.unit_price })
            .eq('id', line.id)
    );
    await Promise.all(updates);

    // We pass 'reserved' as intent, but the function decides based on availability
    // Uses an RPC to handle the complex logic of checking stock and updating status atomically
    const { error } = await supabase.rpc('allocate_inventory_and_confirm_order', { 
        p_order_id: orderId, 
        p_new_status: 'reserved',
        p_idempotency_key: self.crypto.randomUUID()
    });
    processing.value = false;
    if (error) toast.add({ severity: 'error', summary: 'Error', detail: error.message });
    else {
        toast.add({ severity: 'success', summary: 'Processed', detail: 'Inventory allocation updated.' });
        await fetchOrderData();
    }
};

const allocateStock = async () => {
    await confirmOrder();
}

/**
 * Creates a fulfillment record and updates inventory.
 * Logic:
 * 1. Calculates items that need shipping (Ordered - Shipped - In Fulfillment).
 * 2. Determines 'pickable' quantity based on Allocated + Free Stock.
 * 3. Calls RPC to create fulfillment and re-adjust allocations.
 */
const createFulfillment = async () => {
    processing.value = true;
    const itemsToShip = lines.value
        .map(l => ({ 
            sales_order_line_id: l.id, 
            quantity: l.quantity_ordered - (l.qty_shipped || 0) - (l.qty_in_fulfillment || 0), 
            // We can pick what is explicitly reserved for us, PLUS any free stock
            pickable: (l.qty_allocated || 0) + (l.available_now || 0)
        }))
        .filter(i => i.quantity > 0);

    if (itemsToShip.length === 0) {
        toast.add({ severity: 'info', summary: 'Info', detail: 'All items already fulfilled or in progress.' });
        processing.value = false;
        return;
    }

    try {
        const fulfillmentLines = itemsToShip.map(item => ({
            sales_order_line_id: item.sales_order_line_id,
            quantity: Math.min(item.quantity, item.pickable) 
        })).filter(l => l.quantity > 0);

        if (fulfillmentLines.length === 0) {
            toast.add({ severity: 'warn', summary: 'No Stock', detail: 'No items currently available to pick.' });
            return;
        }

        const { data: newId, error } = await supabase.rpc('create_fulfillment_and_reallocate', { 
            p_order_id: orderId, 
            p_items: fulfillmentLines,
            p_idempotency_key: self.crypto.randomUUID()
        });

        if (error) throw error;

        toast.add({ severity: 'success', summary: 'Created', detail: 'Fulfillment created successfully.' });
        await fetchOrderData();
    } catch (error: any) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message });
    } finally {
        processing.value = false;
    }
}

const allocateLine = async (line: any) => {
    processing.value = true;
    const { data, error } = await supabase.rpc('allocate_line_item', { 
        p_line_id: line.id,
        p_idempotency_key: self.crypto.randomUUID()
    });
    processing.value = false;
    
    if (error) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message });
    } else if (data.success) {
        await fetchOrderData();
    } else {
        toast.add({ severity: 'warn', summary: 'Info', detail: data.message });
    }
}

const revertLine = (line: any) => {
    confirm.require({
        message: 'Unallocate stock for this line?',
        header: 'Unallocate Line',
        icon: 'pi pi-info-circle',
        acceptClass: 'p-button-warning',
        accept: async () => {
            processing.value = true;
            const { data, error } = await supabase.rpc('revert_line_allocation', { 
                p_line_id: line.id,
                p_idempotency_key: self.crypto.randomUUID()
            });
            processing.value = false;

            if (error) {
                toast.add({ severity: 'error', summary: 'Error', detail: error.message });
            } else if (!data.success) {
                toast.add({ severity: 'error', summary: 'Failed', detail: data.message });
            } else {
                await fetchOrderData();
            }
        }
    });
}

const updateLineItem = async (line: any) => {
    const fulfilledQty = (line.qty_shipped || 0) + (line.qty_in_fulfillment || 0);
    if (line.quantity_ordered < fulfilledQty) {
        toast.add({ severity: 'warn', summary: 'Invalid Quantity', detail: `Cannot reduce below fulfilled qty (${fulfilledQty}).` });
        await fetchOrderData(); 
        return;
    }
    await supabase.from('sales_order_lines').update({ quantity_ordered: line.quantity_ordered, unit_price: line.unit_price }).eq('id', line.id);
}

const deleteLine = (lineId: string) => {
    const line = lines.value.find(l => l.id === lineId);
    const fulfilledQty = (line?.qty_shipped || 0) + (line?.qty_in_fulfillment || 0);
    if (line && fulfilledQty > 0) {
        toast.add({ severity: 'error', summary: 'Cannot Delete', detail: 'Line has fulfilled items.' });
        return;
    }
    
    confirm.require({
        message: 'Are you sure you want to delete this line item?',
        header: 'Delete Line',
        icon: 'pi pi-trash',
        acceptClass: 'p-button-danger',
        accept: async () => {
            await supabase.from('sales_order_lines').delete().eq('id', lineId)
            await fetchOrderData();
        }
    });
}

const onProductSelected = async (product: any) => {
    const { data: existing } = await supabase.from('sales_order_lines').select('*').eq('sales_order_id', orderId).eq('product_id', product.id).maybeSingle()
    if (existing) {
        await supabase.from('sales_order_lines').update({ quantity_ordered: existing.quantity_ordered + 1 }).eq('id', existing.id);
    } else {
        await supabase.from('sales_order_lines').insert({ sales_order_id: orderId, product_id: product.id, quantity_ordered: 1, unit_price: product.list_price || 0 })
    }
    await fetchOrderData()
}

// Generates the data for the multi-colored progress bar
// Visualizes: Shipped (Green) -> In Fulfillment (Blue) -> Allocated (Orange)
const getProgressSegments = (line: any) => {
    const total = line.quantity_ordered;
    if (total === 0) return [];

    const shipped = line.qty_shipped || 0;
    const fulfilling = line.qty_in_fulfillment || 0;
    // Ensure we don't show negative allocated if data is weird
    const allocated = Math.max(0, (line.qty_allocated || 0) - fulfilling); 
    
    const segments = [];
    
    if (shipped > 0) segments.push({ width: (shipped/total)*100, color: 'bg-green-500', tooltip: `Shipped: ${shipped}` });
    if (fulfilling > 0) segments.push({ width: (fulfilling/total)*100, color: 'bg-blue-500', tooltip: `In Fulfillment: ${fulfilling}` });
    if (allocated > 0) segments.push({ width: (allocated/total)*100, color: 'bg-orange-500', tooltip: `Allocated: ${allocated}` });
    
    return segments;
}

const getOutstandingQty = (line: any) => {
    return line.quantity_ordered - (line.qty_allocated || 0) - (line.qty_shipped || 0);
}

onMounted(() => fetchOrderData())
</script>

<template>
    <div v-if="loading" class="flex justify-content-center p-6"><i class="pi pi-spin pi-spinner text-4xl text-500"></i></div>

    <div v-else-if="order" class="flex flex-column gap-4 max-w-7xl mx-auto w-full">
        
        <!-- Header Section -->
        <div class="surface-card p-4 shadow-2 border-round sticky top-0 z-5">
            <div class="flex flex-column md:flex-row justify-content-between align-items-start md:align-items-center gap-3 mb-4">
                <div class="flex align-items-center gap-3">
                    <h1 class="text-3xl font-bold m-0 text-900">{{ order.order_number }}</h1>
                    <Tag :value="order.status?.toUpperCase().replace('_', ' ')" :severity="getStatusSeverity(order.status)" class="text-sm font-bold px-3 py-1" />
                </div>
                <div class="flex flex-wrap gap-2 w-full md:w-auto">
                    <Button 
                        v-if="!['cancelled', 'completed'].includes(order.status) && !hasAllocatedItems && !hasFulfillments" 
                        label="Cancel" 
                        icon="pi pi-times" 
                        severity="danger" 
                        outlined 
                        :loading="processing" 
                        @click="cancelOrder" 
                        class="flex-1 md:flex-none"
                    />
                    
                    <template v-if="order.status === 'draft'">
                        <Button 
                            v-if="lines.length > 0"
                            label="Confirm Order" 
                            :severity="isFullyAllocatable ? 'success' : 'warning'" 
                            :loading="processing" 
                            @click="confirmOrder" 
                            class="flex-1 md:flex-none"
                        />
                    </template>

                    <template v-if="['confirmed', 'requires_items', 'awaiting_stock'].includes(order.status)">
                        <Button 
                            v-if="!hasAllocatedItems && !hasFulfillments"
                            label="Revert to Draft" 
                            icon="pi pi-undo" 
                            severity="secondary" 
                            outlined 
                            :loading="processing" 
                            @click="revertToDraft" 
                            class="flex-1 md:flex-none"
                        />
                    </template>

                    <template v-if="['confirmed', 'requires_items', 'awaiting_stock'].includes(order.status)">
                        <Button 
                            v-if="hasAllocatableStock"
                            label="Allocate Stock" 
                            icon="pi pi-refresh" 
                            severity="warning" 
                            :loading="processing" 
                            @click="allocateStock" 
                            class="flex-1 md:flex-none"
                        />
                    </template>

                    <template v-if="['reserved', 'awaiting_stock', 'partially_shipped', 'picking', 'confirmed', 'requires_items'].includes(order.status)">
                        <Button 
                            v-if="hasAllocatedItems"
                            :label="isFullyAllocated ? 'Fulfill Order' : 'Part-Ship'" 
                            icon="pi pi-box" 
                            severity="success" 
                            @click="createFulfillment" 
                            :loading="processing" 
                            class="flex-1 md:flex-none"
                        />
                    </template>
                </div>
            </div>

            <div class="grid">
                <div class="col-12 md:col-4">
                    <div class="surface-50 p-3 border-round h-full">
                        <span class="text-500 text-sm font-medium block mb-2">Customer</span>
                        <div class="text-xl font-bold text-900">{{ order.customer_name }}</div>
                    </div>
                </div>
                <div class="col-12 md:col-4">
                    <div class="surface-50 p-3 border-round h-full">
                        <span class="text-500 text-sm font-medium block mb-2">Expected Dispatch</span>
                        <div class="flex gap-2 align-items-center">
                            <Calendar v-model="order.dispatch_date" dateFormat="yy-mm-dd" showIcon @date-select="saveDispatchDate" class="w-full" />
                            <Button v-if="suggestedDispatchDate" icon="pi pi-sync" severity="warning" text v-tooltip.top="'Sync with PO'" @click="applySuggestedDate" />
                        </div>
                    </div>
                </div>
                <div class="col-12 md:col-4">
                    <div class="surface-50 p-3 border-round h-full flex flex-column justify-content-between">
                        <span class="text-500 text-sm font-medium block">Total Amount</span>
                        <div class="text-3xl font-bold text-primary text-right">{{ formatCurrency(calculatedTotal) }}</div>
                    </div>
                </div>
            </div>
            
            <!-- Address Section -->
            <div class="grid mt-2">
                <div class="col-12 md:col-6">
                    <div class="surface-50 p-3 border-round h-full">
                        <span class="text-500 text-sm font-medium block mb-2">Billing Address</span>
                        <Textarea v-model="order.billing_address" rows="3" class="w-full text-sm" autoResize @blur="updateOrder" placeholder="Enter billing address..." />
                    </div>
                </div>
                <div class="col-12 md:col-6">
                    <div class="surface-50 p-3 border-round h-full">
                        <span class="text-500 text-sm font-medium block mb-2">Shipping Address</span>
                        <Textarea v-model="order.shipping_address" rows="3" class="w-full text-sm" autoResize @blur="updateOrder" placeholder="Enter shipping address..." />
                    </div>
                </div>
            </div>
        </div>
        
        <Panel header="Line Items">
            <template #icons>
                <Button 
                    v-if="order.status === 'draft'" 
                    label="Add Item" 
                    icon="pi pi-plus" 
                    severity="success" 
                    size="small" 
                    @click="showNewLineDialog = true" 
                />
            </template>
            <DataTable :value="lines" stripedRows showGridlines scrollable>
                <Column field="products.sku" header="SKU" style="min-width: 7rem">
                    <template #body="{ data }">
                        <router-link v-if="data.products" :to="`/product/${data.products.id}`" class="text-primary font-bold no-underline hover:underline">
                            {{ data.products.sku }}
                        </router-link>
                    </template>
                </Column>
                <Column field="products.name" header="Product" style="min-width: 10rem" />
                <Column field="available_now" header="Stock" style="min-width: 7rem">
                     <template #body="{ data }">
                        <div class="flex align-items-center gap-2">
                            <Tag :value="data.available_now" :severity="getStockSeverity(data.available_now, data.quantity_ordered)" />
                            <Button icon="pi pi-info-circle" text rounded size="small" @click="openAllocationDetails(data.products)" />
                        </div>
                     </template>
                </Column>
                
                <!-- New Combined Progress Column -->
                <Column v-if="order.status !== 'draft'" header="Fulfillment Status" style="min-width: 12rem">
                    <template #body="{ data }">
                        <div class="flex flex-column gap-1">
                            <!-- Progress Bar -->
                            <div class="w-full h-1rem surface-200 border-round overflow-hidden flex relative" v-tooltip.top="'Green: Shipped | Blue: In Progress | Orange: Allocated'">
                                <div v-for="(seg, i) in getProgressSegments(data)" :key="i" 
                                     :class="seg.color" 
                                     :style="{ width: seg.width + '%' }"
                                     :title="seg.tooltip"
                                ></div>
                            </div>
                            <!-- Text Summary -->
                            <div class="flex justify-content-between text-xs text-600">
                                <span>Ord: {{ data.quantity_ordered }}</span>
                                <span v-if="getOutstandingQty(data) > 0" class="text-red-500 font-bold">Need: {{ getOutstandingQty(data) }}</span>
                                <span v-else class="text-green-600 font-bold">Covered</span>
                            </div>
                            <!-- Incoming POs -->
                            <div v-if="incomingStock[data.product_id]" class="mt-1">
                                <span class="text-xs text-500 mr-1">Incoming:</span>
                                <Tag v-for="po in incomingStock[data.product_id]" :key="po.po" severity="info" class="text-xs py-0 px-1 mr-1">{{ po.po }}</Tag>
                            </div>
                        </div>
                    </template>
                </Column>

                <Column v-if="order.status !== 'draft'" header="Actions" style="min-width: 6rem">
                    <template #body="{ data }">
                        <div class="flex gap-1">
                            <Button 
                                v-if="canAllocateLine(data)" 
                                icon="pi pi-check-circle" 
                                size="small"  
                                severity="success" 
                                text 
                                v-tooltip.top="'Allocate Stock'"
                                @click="allocateLine(data)" 
                                :loading="processing"
                            />
                            <Button 
                                v-if="canUnallocateLine(data)" 
                                icon="pi pi-undo" 
                                size="small" 
                                severity="warning" 
                                text 
                                v-tooltip.top="'Unallocate'"
                                @click="revertLine(data)" 
                                :loading="processing"
                            />
                        </div>
                    </template>
                </Column>
                <Column field="quantity_ordered" header="Qty" style="min-width: 5rem">
                    <template #body="{ data }">
                        <InputNumber v-if="order.status === 'draft'" v-model="data.quantity_ordered" :min="1" @blur="updateLineItem(data)" inputClass="w-3rem text-center font-bold" showButtons buttonLayout="horizontal" :step="1" decrementButtonClass="p-button-secondary p-button-text" incrementButtonClass="p-button-secondary p-button-text" />
                        <span v-else class="text-xl font-bold">{{ data.quantity_ordered }}</span>
                    </template>
                </Column>
                <Column field="unit_price" header="Price" style="min-width: 6rem">
                    <template #body="{ data }">
                        <InputNumber v-if="order.status === 'draft'" v-model="data.unit_price" mode="currency" currency="GBP" locale="en-GB" @blur="updateLineItem(data)" class="w-full" />
                        <span v-else>{{ formatCurrency(data.unit_price) }}</span>
                    </template>
                </Column>
                <Column header="Total" style="min-width: 6rem" class="text-right">
                    <template #body="{ data }"><span class="font-bold text-lg">{{ formatCurrency(data.quantity_ordered * data.unit_price) }}</span></template>
                </Column>
                <Column header="" style="width: 3rem"><template #body="{ data }"><Button icon="pi pi-trash" severity="danger" text @click="deleteLine(data.id)" /></template></Column>

                <template #footer>
                    <div class="flex justify-content-end pr-6">
                        <div class="flex flex-column gap-2 w-15rem">
                            <div class="flex justify-content-between text-500">
                                <span>Subtotal:</span>
                                <span>{{ formatCurrency(calculatedTotal) }}</span>
                            </div>
                            <div class="flex justify-content-between text-500">
                                <span>Tax (0%):</span>
                                <span>$0.00</span>
                            </div>
                            <div class="flex justify-content-between font-bold text-xl text-900 border-top-1 surface-border pt-2">
                                <span>Total:</span>
                                <span class="text-primary">{{ formatCurrency(calculatedTotal) }}</span>
                            </div>
                        </div>
                    </div>
                </template>
            </DataTable>
        </Panel>

        <!-- Timeline Section -->
        <div class="surface-card shadow-2 border-round overflow-hidden" style="height: 600px;">
            <TimelineSidebar 
                v-if="order" 
                :entity-id="order.id" 
                entity-type="sales_order" 
            />
        </div>
    </div>

    <ProductAllocationDialog v-model:visible="showAllocationDialog" :product-id="selectedProductForAllocation?.id" :product-sku="selectedProductForAllocation?.sku" />
    <AddProductDialog v-model:visible="showNewLineDialog" :order-id="orderId" @product-selected="onProductSelected"/>
</template>