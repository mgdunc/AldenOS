/**
 * Simplified Shopify types for single-store integration
 */

export interface ShopifySync {
  id: string
  sync_type: 'products' | 'orders'
  status: 'running' | 'completed' | 'failed'
  total_items: number
  processed_items: number
  created_count: number
  updated_count: number
  error_count: number
  current_page: number
  progress_pct: number
  started_at: string
  completed_at: string | null
  error_message: string | null
  metadata?: Record<string, any>
}

// Shopify API types
export interface ShopifyProduct {
  title: string
  variant_title?: string
  sku?: string
  barcode?: string
  price?: number
  inventory_quantity?: number
  raw_data?: Record<string, any>
  created_at: string
}

export interface ShopifyWebhook {
  id: string
  topic: string
  address: string
  created_at: string
}

export type ShopifyWebhookTopic = 
  | 'orders/create'
  | 'orders/updated'
  | 'orders/cancelled'
  | 'orders/paid'
  | 'orders/fulfilled'
  | 'inventory_levels/update'
  | 'products/create'
  | 'products/update'
  | 'products/delete'

export interface ShopifyWebhookPayload {
  topic: ShopifyWebhookTopic
  address: string
}

export interface ShopifyProduct {
  id: number
  title: string
  variants: ShopifyVariant[]
  status: string
  created_at: string
  updated_at: string
  }

export interface ShopifyVariant {
  id: number
  product_id: number
  title: string
  sku?: string
  barcode?: string
  price: string
  inventory_quantity: number
  inventory_item_id: number
  weight?: number
  weight_unit?: string
}

export interface ShopifyOrder {
  id: number
  order_number: number
  email?: string
  created_at: string
  updated_at: string
  total_price: string
  subtotal_price: string
  total_tax: string
  currency: string
  financial_status: string
  fulfillment_status?: string
  line_items: ShopifyLineItem[]
  shipping_address?: ShopifyAddress
  billing_address?: ShopifyAddress
  customer?: ShopifyCustomer
}

export interface ShopifyLineItem {
  id: number
  variant_id?: number
  title: string
  quantity: number
  sku?: string
  price: string
  total_discount: string
  fulfillment_status?: string
}

export interface ShopifyAddress {
  first_name?: string
  last_name?: string
  company?: string
  address1?: string
  address2?: string
  city?: string
  province?: string
  country?: string
  zip?: string
  phone?: string
}

export interface ShopifyCustomer {
  id: number
  email?: string
  first_name?: string
  last_name?: string
  phone?: string
}
