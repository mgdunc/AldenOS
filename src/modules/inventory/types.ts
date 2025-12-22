export interface Product {
  id: string
  sku: string
  name: string
  description?: string
  category?: string
  unit_of_measure?: string
  barcode?: string
  weight?: number
  weight_unit?: string
  list_price?: number
  cost_price?: number
  reorder_point?: number
  reorder_quantity?: number
  supplier_id?: string
  supplier_sku?: string
  is_active: boolean
  shopify_product_id?: number
  shopify_variant_id?: number
  shopify_inventory_item_id?: number
  created_at: string
  updated_at: string
}

export interface ProductWithStock extends Product {
  available_stock?: number
  reserved_stock?: number
  total_stock?: number
}

export interface Location {
  id: string
  name: string
  code?: string
  type: 'warehouse' | 'retail' | 'virtual' | 'other'
  is_sellable: boolean
  is_active: boolean
  address?: LocationAddress
  capacity?: number
  notes?: string
  created_at: string
  updated_at: string
}

export interface LocationAddress {
  street?: string
  street2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
}

export interface InventoryLevel {
  id: string
  product_id: string
  location_id: string
  quantity: number
  reserved_quantity: number
  available_quantity: number
  last_counted_at?: string
  created_at: string
  updated_at: string
}

export interface InventoryTransaction {
  id: string
  product_id: string
  location_id?: string
  quantity: number
  transaction_type: InventoryTransactionType
  reference_type?: string
  reference_id?: string
  notes?: string
  created_by?: string
  created_at: string
}

export type InventoryTransactionType =
  | 'adjustment'
  | 'purchase'
  | 'sale'
  | 'transfer'
  | 'return'
  | 'reserved'
  | 'unreserved'
  | 'picking'
  | 'shipped'
  | 'cancelled'
  | 'po_placed'
  | 'po_received'

export interface StockAdjustment {
  product_id: string
  location_id: string
  quantity_change: number
  reason: string
  notes?: string
}

export interface ProductImportRow {
  sku: string
  name: string
  description?: string
  category?: string
  barcode?: string
  list_price?: number
  cost_price?: number
  supplier_sku?: string
  weight?: number
  reorder_point?: number
  reorder_quantity?: number
}

export interface InventoryImportRow {
  sku: string
  location_code: string
  quantity: number
  notes?: string
}

export interface ProductFilters {
  search?: string
  category?: string
  supplier_id?: string
  is_active?: boolean
  has_stock?: boolean
  low_stock?: boolean
}

export interface InventoryStats {
  total_products: number
  active_products: number
  low_stock_products: number
  out_of_stock_products: number
  total_inventory_value: number
  total_locations: number
}
