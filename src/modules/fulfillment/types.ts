export interface Fulfillment {
  id: string
  fulfillment_number: string
  sales_order_id: string
  status: 'draft' | 'picking' | 'packed' | 'shipped' | 'cancelled'
  tracking_number?: string
  shipped_at?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface FulfillmentLine {
  id: string
  fulfillment_id: string
  sales_order_line_id: string
  product_id: string
  location_id: string
  quantity: number
  created_at: string
}

export interface FulfillmentWithRelations extends Fulfillment {
  sales_orders?: {
    order_number: string
    customer_name?: string
  }
}

export interface FulfillmentLineWithRelations extends FulfillmentLine {
  sales_order_lines?: {
    products?: {
      sku: string
      name: string
    }
  }
  locations?: {
    name: string
  }
}

export interface FulfillmentStats {
  total_fulfillments: number
  draft_count: number
  picking_count: number
  packed_count: number
  shipped_count: number
  cancelled_count: number
}

export interface FulfillmentFilters {
  status?: string
  sales_order_id?: string
  search?: string
}
