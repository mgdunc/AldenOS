import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { supabase } from '@/lib/supabase'

export function usePurchaseOrder(poId: string) {
    const router = useRouter()
    const toast = useToast()

    const po = ref<any>(null)
    const lines = ref<any[]>([])
    const receipts = ref<any[]>([])
    const suppliers = ref<any[]>([])
    const allocations = ref<any>({})
    const loading = ref(true)
    const processing = ref(false)

    const isDraft = computed(() => po.value?.status === 'draft')
    const isPlaced = computed(() => po.value?.status === 'placed' || po.value?.status === 'partial_received')

    const totalAmount = computed(() => {
        return lines.value.reduce((sum, line) => sum + (line.quantity_ordered * line.unit_cost), 0)
    })

    const fetchData = async () => {
        loading.value = true
        // Fetch PO Header
        const { data: header, error: headErr } = await supabase.from('purchase_orders').select('*').eq('id', poId).single()
        
        if (headErr) {
            toast.add({ severity: 'error', summary: 'Error', detail: 'PO not found' })
            router.push('/purchases')
            loading.value = false
            return
        }

        // Fetch PO Lines with Product Info (including cost_price)
        const { data: items } = await supabase.from('purchase_order_lines')
            .select('*, products(id, sku, name, cost_price)')
            .eq('purchase_order_id', poId)
            .order('created_at')

        // Fetch Receipts
        const { data: receiptData } = await supabase
            .from('inventory_receipts')
            .select('*, inventory_receipt_lines(product_id, quantity_received)')
            .eq('purchase_order_id', poId)
            .order('received_at', { ascending: false })
        
        const { data: supps } = await supabase.from('suppliers').select('id, name').order('name')

        po.value = header
        lines.value = items || []
        receipts.value = receiptData || []
        suppliers.value = supps || []

        if (lines.value.length > 0) {
            const productIds = lines.value.map(l => l.product_id)
            
            // Fetch Demand from Sales Orders
            const { data: demand } = await supabase
                .from('sales_order_lines')
                .select('product_id, quantity_ordered, quantity_fulfilled, sales_orders!inner(status)')
                .in('product_id', productIds)
                .in('sales_orders.status', ['requires_items', 'awaiting_stock', 'partially_shipped', 'confirmed'])

            const map: any = {}
            demand?.forEach((d: any) => {
                const qtyNeeded = (d.quantity_ordered || 0) - (d.quantity_fulfilled || 0)
                if (qtyNeeded > 0) {
                    map[d.product_id] = (map[d.product_id] || 0) + qtyNeeded
                }
            })
            allocations.value = map
        }
        loading.value = false
    }

    const updateHeaderTotal = async () => {
        await supabase.from('purchase_orders').update({ total_amount: totalAmount.value }).eq('id', poId)
    }

    const onProductSelected = async (prod: any) => {
        const { data: existing } = await supabase
            .from('purchase_order_lines')
            .select('*')
            .eq('purchase_order_id', poId)
            .eq('product_id', prod.id)
            .maybeSingle()

        if (existing) {
            await supabase
                .from('purchase_order_lines')
                .update({ quantity_ordered: existing.quantity_ordered + 1 })
                .eq('id', existing.id)
        } else {
            await supabase.from('purchase_order_lines').insert({
                purchase_order_id: poId,
                product_id: prod.id,
                quantity_ordered: 1,
                unit_cost: prod.cost_price || 0 
            })
        }
        await fetchData()
        await updateHeaderTotal()
    }

    const updateSupplier = async () => {
        if (!po.value.supplier_id) return
        const selected = suppliers.value.find(s => s.id === po.value.supplier_id)
        await supabase.from('purchase_orders')
            .update({ 
                supplier_id: po.value.supplier_id, 
                supplier_name: selected?.name 
            })
            .eq('id', poId) 
        toast.add({ severity: 'success', summary: 'Updated', detail: 'Supplier updated.' })
    }

    const updateExpectedDate = async () => {
        await supabase.from('purchase_orders').update({ expected_date: po.value.expected_date }).eq('id', poId)
        toast.add({ severity: 'success', summary: 'Saved', detail: 'Expected date updated.' })
    }

    const updateStatus = async (status: string) => {
        processing.value = true
        try {
            // If placing order, ensure all lines are saved first to prevent race conditions with blur events
            if (status === 'placed') {
                const updates = lines.value.map(line => 
                    supabase.from('purchase_order_lines')
                        .update({ 
                            quantity_ordered: line.quantity_ordered, 
                            unit_cost: line.unit_cost 
                        })
                        .eq('id', line.id)
                )
                await Promise.all(updates)
                await updateHeaderTotal()
            }

            const { error } = await supabase.from('purchase_orders').update({ status }).eq('id', poId)
            if (error) throw error
            await fetchData()
        } catch (e: any) {
            toast.add({ severity: 'error', summary: 'Error', detail: e.message })
        } finally {
            processing.value = false
        }
    }

    const receiveAll = async () => {
        processing.value = true
        const { error } = await supabase.rpc('receive_purchase_order_all', { p_po_id: poId })
        if (error) toast.add({ severity: 'error', summary: 'Error', detail: error.message })
        else { 
            toast.add({ severity: 'success', summary: 'Received', detail: 'Stock updated.' })
            await fetchData() 
        }
        processing.value = false
    }

    const updateLine = async (line: any) => {
        await supabase.from('purchase_order_lines').update({ quantity_ordered: line.quantity_ordered, unit_cost: line.unit_cost }).eq('id', line.id)
        await updateHeaderTotal()
    }

    const deleteLine = async (id: string) => {
        await supabase.from('purchase_order_lines').delete().eq('id', id)
        await fetchData()
        await updateHeaderTotal()
    }

    return {
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
    }
}
