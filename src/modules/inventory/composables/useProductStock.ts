import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'

export function useProductStock() {
    const loading = ref(false)
    const error = ref<string | null>(null)

    // Data Refs
    const product = ref<any>(null)
    const allOrderLines = ref<any[]>([]) 
    const incomingLines = ref<any[]>([]) 

    // Key Figures (Now sourced directly from SQL View)
    const qoh = ref(0)
    const reserved = ref(0)
    const available = ref(0)
    const onOrder = ref(0)
    const backlog = ref(0)
    const netRequired = ref(0)

    // Computed Lists (Still needed for the "View Details" dialogs)
    const reservedLines = computed(() => 
        allOrderLines.value.filter(l => ['reserved', 'picking', 'packed', 'partially_shipped'].includes(l.sales_orders?.status))
    )

    const backlogLines = computed(() => 
        allOrderLines.value.filter(l => ['requires_items', 'awaiting_stock'].includes(l.sales_orders?.status))
    )

    const fetchStockData = async (productId: string) => {
        if (!productId) return
        loading.value = true
        error.value = null

        try {
            // 1. Fetch Totals from SQL View (Single Source of Truth)
            // We use the VIEW here, so the numbers match the Products List exactly.
            const { data: viewData, error: viewErr } = await supabase
                .from('product_inventory_view')
                .select('*')
                .eq('id', productId)
                .single()

            if (viewErr) throw viewErr
            product.value = viewData

            // Assign DB values directly to our refs
            qoh.value = viewData.qoh
            reserved.value = viewData.reserved
            available.value = viewData.available
            onOrder.value = viewData.on_order
            backlog.value = viewData.backlog
            netRequired.value = viewData.net_required

            // 2. Fetch Details (For Dialogs)
            // We still need these lists so the user can click "View Backlog" and see WHO is waiting.
            const allocQuery = supabase
                .from('sales_order_lines')
                .select(`id, quantity_ordered, quantity_fulfilled, sales_orders!inner (id, order_number, customer_name, status)`)
                .eq('product_id', productId)
                .in('sales_orders.status', ['reserved', 'requires_items', 'picking', 'partially_shipped', 'awaiting_stock'])

            const poQuery = supabase
                .from('purchase_order_lines')
                .select(`id, quantity_ordered, quantity_received, purchase_orders!inner (id, po_number, status, expected_date)`)
                .eq('product_id', productId)
                .in('purchase_orders.status', ['placed', 'partial_received'])

            const [allocRes, poRes] = await Promise.all([allocQuery, poQuery])
            
            if (allocRes.error) console.error('Error fetching allocations:', allocRes.error)
            if (poRes.error) console.error('Error fetching POs:', poRes.error)

            allOrderLines.value = allocRes.data || []
            incomingLines.value = poRes.data || []

        } catch (e: any) {
            console.error('Stock fetch error:', e)
            error.value = e.message
        } finally {
            loading.value = false
        }
    }

    return {
        loading,
        error,
        product,
        
        // Lists
        allOrderLines,
        incomingLines,
        reservedLines,
        backlogLines,

        // Figures
        qoh,
        reserved,
        available,
        onOrder,
        backlog,
        netRequired,

        fetchStockData
    }
}