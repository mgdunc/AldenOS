export interface ShopifyIntegrationSettings {
  shop_url: string
  access_token: string
  webhook_secret?: string
  webhooks?: ShopifyWebhook[]
}

export interface ShopifyIntegration {
  id: string
  provider: 'shopify'
  name: string
  settings: ShopifyIntegrationSettings
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ShopifySyncJob {
  id: string
  integration_id: string
  integration_type: 'shopify'
  job_type: 'product_sync' | 'order_sync'
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  total_items?: number
  processed_items?: number
  matched_items?: number
  updated_items?: number
  error_message?: string
  metadata?: Record<string, any>
  started_at?: string
  completed_at?: string
  created_at: string
}

export interface ShopifyIntegrationLog {
  id: string
  integration_id: string
  event_type: string
  message: string
  level: 'info' | 'success' | 'warning' | 'error'
  metadata?: Record<string, any>
  created_at: string
}

export interface ShopifyUnmatchedProduct {
  id: string
  integration_id: string
  external_product_id: string
  external_variant_id: string
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
