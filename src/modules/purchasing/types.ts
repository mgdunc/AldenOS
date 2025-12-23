export interface PurchaseOrder {
  id: string
  po_number: string
  supplier_id: string
  supplier?: Supplier
  status: PurchaseOrderStatus
  expected_date?: string
  received_date?: string
  total_amount: number
  shipping_cost?: number
  tax_amount?: number
  notes?: string
  created_at: string
  updated_at: string
  created_by?: string
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'sent'
  | 'confirmed'
  | 'partial'
  | 'received'
  | 'cancelled'

export interface PurchaseOrderLine {
  id: string
  purchase_order_id: string
  product_id: string
  product?: {
    id: string
    sku: string
    name: string
  }
  quantity_ordered: number
  quantity_received: number
  unit_cost: number
  total_cost: number
  notes?: string
  created_at: string
  updated_at: string
}

export interface PurchaseOrderWithLines extends PurchaseOrder {
  lines: PurchaseOrderLine[]
}

export interface Supplier {
  id: string
  name: string
  code?: string
  email?: string
  phone?: string
  website?: string
  contact_person?: string
  address?: SupplierAddress
  payment_terms?: string
  lead_time_days?: number
  minimum_order?: number
  notes?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SupplierAddress {
  street?: string
  street2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
}

export interface InventoryReceipt {
  id: string
  receipt_number: string
  purchase_order_id?: string
  purchase_order?: PurchaseOrder
  supplier_id?: string
  supplier?: Supplier
  status: ReceiptStatus
  received_date: string
  received_by?: string
  notes?: string
  created_at: string
  updated_at: string
}

export type ReceiptStatus =
  | 'draft'
  | 'received'
  | 'inspecting'
  | 'completed'
  | 'cancelled'

export interface InventoryReceiptLine {
  id: string
  receipt_id: string
  purchase_order_line_id?: string
  product_id: string
  product?: {
    id: string
    sku: string
    name: string
  }
  location_id: string
  location?: {
    id: string
    name: string
  }
  quantity_expected: number
  quantity_received: number
  unit_cost?: number
  notes?: string
  created_at: string
  updated_at: string
}

export interface InventoryReceiptWithLines extends InventoryReceipt {
  lines: InventoryReceiptLine[]
}

export interface PurchaseOrderFilters {
  search?: string
  status?: PurchaseOrderStatus | PurchaseOrderStatus[]
  supplier_id?: string
  date_from?: string
  date_to?: string
}

export interface PurchasingStats {
  total_pos: number
  draft_pos: number
  pending_pos: number
  received_pos: number
  cancelled_pos: number
  total_spending: number
  active_suppliers: number
}
