import { computed, type Ref } from 'vue'

export function useSalesOrder(order: Ref<any>, lines: Ref<any[]>) {
    
    // 1. Check if the order is in a state that allows fulfillment
    const canFulfill = computed(() => {
        if (!order.value) return false;
        return ['reserved', 'partially_shipped', 'picking', 'confirmed', 'requires_items', 'awaiting_stock'].includes(order.value.status);
    });

    // 2. Check if we have ANY allocated items (to show "Fulfill" vs "Part-Ship")
    const hasAllocatedItems = computed(() => {
        return lines.value.some(l => (l.qty_allocated || 0) > 0);
    });

    // 3. Check if we have stock available to allocate (to show "Allocate" button)
    const hasAllocatableStock = computed(() => {
        return lines.value.some(l => {
            // Outstanding = Ordered - Allocated - Shipped
            // (Allocated includes InFulfillment, so we don't subtract InFulfillment again)
            const outstanding = l.quantity_ordered - (l.qty_allocated || 0) - (l.qty_shipped || 0);
            return outstanding > 0 && l.available_now > 0;
        });
    });

    // 4. Check if the order is 100% allocated (to show "Fulfill Order" vs "Part-Ship")
    const isFullyAllocated = computed(() => {
        if (lines.value.length === 0) return false;
        return lines.value.every(l => {
            const outstanding = l.quantity_ordered - (l.qty_shipped || 0);
            // Allocated includes InFulfillment. 
            // So if Allocated >= Outstanding (Ordered - Shipped), we are fully allocated.
            return (l.qty_allocated || 0) >= outstanding;
        });
    });

    // 5. Calculate Total Value
    const calculatedTotal = computed(() => {
        return lines.value.reduce((sum, line) => sum + (line.quantity_ordered * line.unit_price), 0);
    });

    // 6. Suggest Dispatch Date based on Incoming POs
    const suggestedDispatchDate = computed(() => {
        // This requires 'incomingStock' which might be passed in or handled separately.
        // For now, we'll keep the complex date logic in the view or extend this composable later.
        return null; 
    });

    // Helper: Can we unallocate this specific line?
    // Logic: We can only unallocate stock that is reserved but NOT yet in a fulfillment (picking/packed/shipped)
    const canUnallocateLine = (line: any) => {
        return (line.qty_allocated - (line.qty_in_fulfillment || 0)) > 0;
    };

    // Helper: Can we allocate more stock to this line?
    // Logic: Need > 0 AND Stock Available > 0
    const canAllocateLine = (line: any) => {
        if (!order.value || order.value.status === 'draft') return false;
        const outstanding = line.quantity_ordered - (line.qty_shipped || 0) - (line.qty_in_fulfillment || 0) - (line.qty_allocated || 0);
        return outstanding > 0 && line.available_now > 0;
    };

    return {
        canFulfill,
        hasAllocatedItems,
        hasAllocatableStock,
        isFullyAllocated,
        calculatedTotal,
        canUnallocateLine,
        canAllocateLine
    };
}
