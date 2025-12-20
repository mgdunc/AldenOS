export const getStatusSeverity = (status: string | null | undefined) => {
    if (!status) return 'info';
    switch (status.toLowerCase()) {
        case 'shipped':
        case 'completed':
        case 'received':
        case 'active':
        case 'partially_shipped': 
        case 'placed': 
        case 'po_received':
        case 'purchase':
            return 'success';

        case 'picking': 
        case 'packed':
            return 'primary';
            
        case 'reserved':
        case 'requires_items': 
        case 'clearance':
        case 'adjustment':
            return 'warn';
            
        case 'draft': 
        case 'inactive':
            return 'secondary';
            
        case 'cancelled': 
        case 'archived':
        case 'sale':
            return 'danger';
            
        default: return 'info';
    }
}