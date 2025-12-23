export interface InventoryReceipt {
  id: string
  receipt_number: string
  purchase_order_id?: string
  received_at: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface InventoryReceiptLine {
  id: string
  receipt_id: string
  product_id: string
  location_id: string
  quantity: number
  created_at: string
}

export interface InventoryReceiptWithRelations extends InventoryReceipt {
  purchase_orders?: {
    id: string
    po_number: string
    status: string
    supplier_name?: string
  }
}

export interface InventoryReceiptLineWithRelations extends InventoryReceiptLine {
  products?: {
    sku: string
    name: string
  }
  locations?: {
    name: string
  }
}

export interface ReceivingStats {
  total_receipts: number
  this_month: number
  this_week: number
  total_quantity_received: number
}

export interface ReceivingFilters {
  purchase_order_id?: string
  date_from?: string
  date_to?: string
  search?: string
}
