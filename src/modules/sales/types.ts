export interface SalesOrder {
  id: string
  order_number: string
  customer_id?: string
  customer_name?: string
  customer_email?: string
  customer_phone?: string
  customer?: Customer
  status: SalesOrderStatus
  billing_address?: Address
  shipping_address?: Address
  shipping_method?: string
  tracking_number?: string
  dispatch_date?: string
  total_amount: number
  notes?: string
  shopify_order_id?: number
  created_at: string
  updated_at: string
  created_by?: string
}

export type SalesOrderStatus =
  | 'draft'
  | 'confirmed'
  | 'picking'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'fulfilled'

export interface SalesOrderLine {
  id: string
  sales_order_id: string
  product_id: string
  product?: {
    id: string
    sku: string
    name: string
  }
  quantity_ordered: number
  quantity_fulfilled: number
  unit_price: number
  total_price: number
  notes?: string
  created_at: string
  updated_at: string
}

export interface SalesOrderWithLines extends SalesOrder {
  lines: SalesOrderLine[]
}

export interface Address {
  name?: string
  company?: string
  street?: string
  street2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  phone?: string
  email?: string
}

export interface Fulfillment {
  id: string
  fulfillment_number: string
  sales_order_id: string
  sales_order?: SalesOrder
  status: FulfillmentStatus
  location_id?: string
  location?: {
    id: string
    name: string
  }
  picked_by?: string
  packed_by?: string
  shipped_by?: string
  picked_at?: string
  packed_at?: string
  shipped_at?: string
  tracking_number?: string
  shipping_carrier?: string
  notes?: string
  created_at: string
  updated_at: string
}

export type FulfillmentStatus =
  | 'draft'
  | 'picking'
  | 'picked'
  | 'packing'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'cancelled'

export interface FulfillmentLine {
  id: string
  fulfillment_id: string
  sales_order_line_id: string
  product_id: string
  product?: {
    id: string
    sku: string
    name: string
  }
  location_id?: string
  location?: {
    id: string
    name: string
  }
  quantity_to_fulfill: number
  quantity_picked: number
  quantity_packed: number
  notes?: string
  created_at: string
  updated_at: string
}

export interface FulfillmentWithLines extends Fulfillment {
  lines: FulfillmentLine[]
}

export interface Customer {
  id: string
  name: string
  email?: string
  phone?: string
  company?: string
  billing_address?: Address
  shipping_address?: Address
  notes?: string
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  name: string
  email?: string
  phone?: string
  company?: string
  billing_address?: Address
  shipping_address?: Address
  notes?: string
  created_at: string
  updated_at: string
}

export interface SalesOrderFilters {
  search?: string
  status?: SalesOrderStatus | SalesOrderStatus[]
  customer?: string
  date_from?: string
  date_to?: string
}

export interface SalesStats {
  total_orders: number
  draft_orders: number
  confirmed_orders: number
  fulfilled_orders: number
  cancelled_orders: number
  total_revenue: number
  pending_fulfillments: number
}
