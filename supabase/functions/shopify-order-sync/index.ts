// deno-lint-ignore-file no-explicit-any
/**
 * Shopify Order Sync - Single Store Edition
 * 
 * Simplified sync that uses environment variables for Shopify credentials.
 * No multi-store integration lookup required.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { ShopifyClient } from '../_shared/shopify.ts'
import { getSupabaseEnv } from '../_shared/env.ts'
import { getShopifyConfig } from '../_shared/shopify-config.ts'
import { createLogger } from '../_shared/logger.ts'

const logger = createLogger('shopify-order-sync')

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getSupabaseEnv()
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Parse request body
    let queueId: string | undefined
    let page_info: string | undefined
    
    try {
      const body = await req.json().catch(() => ({}))
      queueId = body.queueId
      page_info = body.page_info
      logger.setContext({ queueId })
    } catch (_e) {
      // Empty body is fine
    }

    await logger.info('Order sync started')

    // Get Shopify config (env vars or database)
    const shopifyConfig = await getShopifyConfig()
    const shopify = new ShopifyClient(shopifyConfig)

    // Update queue status if provided
    if (queueId) {
      await supabase.from('sync_queue').update({
        status: 'processing',
        started_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString()
      }).eq('id', queueId)
    }

    // Fetch orders from Shopify
    const { orders, nextPageInfo } = await shopify.getOrdersPage(50, page_info, 'any')
    await logger.debug(`Fetched ${orders.length} orders from Shopify`)

    let createdCount = 0
    let updatedCount = 0
    let errorCount = 0

    // Process each order
    for (const order of orders) {
      try {
        // Check if order already exists
        const { data: existingOrder } = await supabase
          .from('sales_orders')
          .select('id, status')
          .eq('shopify_order_id', order.id)
          .maybeSingle()

        if (existingOrder) {
          // Update existing order
          const { error: updateError } = await supabase
            .from('sales_orders')
            .update({
              status: mapShopifyStatus(order, existingOrder.status),
              total_amount: parseFloat(order.total_price) || 0,
              customer_name: order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : null,
              // Shipping address
              shipping_name: order.shipping_address?.name || null,
              shipping_company: order.shipping_address?.company || null,
              shipping_address1: order.shipping_address?.address1 || null,
              shipping_address2: order.shipping_address?.address2 || null,
              shipping_city: order.shipping_address?.city || null,
              shipping_province: order.shipping_address?.province || null,
              shipping_zip: order.shipping_address?.zip || null,
              shipping_country: order.shipping_address?.country || null,
              shipping_phone: order.shipping_address?.phone || null,
              // Billing address
              billing_name: order.billing_address?.name || null,
              billing_company: order.billing_address?.company || null,
              billing_address1: order.billing_address?.address1 || null,
              billing_address2: order.billing_address?.address2 || null,
              billing_city: order.billing_address?.city || null,
              billing_province: order.billing_address?.province || null,
              billing_zip: order.billing_address?.zip || null,
              billing_country: order.billing_address?.country || null,
              billing_phone: order.billing_address?.phone || null,
            })
            .eq('id', existingOrder.id)

          if (updateError) {
            await logger.error(`Failed to update order #${order.name}`, updateError)
            errorCount++
          } else {
            updatedCount++
            await logger.info(`Updated order ${order.name}`, { 
              orderId: existingOrder.id,
              shopifyOrderId: order.id,
              shopifyOrderNumber: order.name
            })
            
            // Update line items
            await syncLineItems(supabase, existingOrder.id, order.line_items)
          }
        } else {
          // Create new order
          const { data: newOrder, error: createError } = await supabase
            .from('sales_orders')
            .insert({
              shopify_order_id: order.id,
              shopify_order_number: order.name,
              source: 'shopify',
              status: 'new',
              total_amount: parseFloat(order.total_price) || 0,
              customer_name: order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : null,
              // Shipping address
              shipping_name: order.shipping_address?.name || null,
              shipping_company: order.shipping_address?.company || null,
              shipping_address1: order.shipping_address?.address1 || null,
              shipping_address2: order.shipping_address?.address2 || null,
              shipping_city: order.shipping_address?.city || null,
              shipping_province: order.shipping_address?.province || null,
              shipping_zip: order.shipping_address?.zip || null,
              shipping_country: order.shipping_address?.country || null,
              shipping_phone: order.shipping_address?.phone || null,
              // Billing address
              billing_name: order.billing_address?.name || null,
              billing_company: order.billing_address?.company || null,
              billing_address1: order.billing_address?.address1 || null,
              billing_address2: order.billing_address?.address2 || null,
              billing_city: order.billing_address?.city || null,
              billing_province: order.billing_address?.province || null,
              billing_zip: order.billing_address?.zip || null,
              billing_country: order.billing_address?.country || null,
              billing_phone: order.billing_address?.phone || null,
            })
            .select('id')
            .single()

          if (createError) {
            await logger.error(`Failed to create order #${order.name}`, createError)
            errorCount++
          } else {
            createdCount++
            await logger.info(`Created order ${order.name}`, { 
              orderId: newOrder?.id,
              shopifyOrderId: order.id,
              shopifyOrderNumber: order.name
            })
            
            // Create line items
            if (newOrder) {
              await syncLineItems(supabase, newOrder.id, order.line_items)
            }
          }
        }
      } catch (orderError: any) {
        await logger.error(`Error processing order #${order.name}`, orderError)
        errorCount++
      }
    }

    // Handle pagination - queue next page if exists
    if (nextPageInfo && queueId) {
      // Queue continuation
      await supabase.from('sync_queue').update({
        metadata: { page_info: nextPageInfo },
        status: 'pending'
      }).eq('id', queueId)
      
      await logger.info('Queued next page', { nextPageInfo })
    } else if (queueId) {
      // Mark complete
      await supabase.from('sync_queue').update({
        status: 'completed',
        completed_at: new Date().toISOString()
      }).eq('id', queueId)
    }

    await logger.info('Order sync completed', { createdCount, updatedCount, errorCount })

    return new Response(
      JSON.stringify({ 
        success: true, 
        created: createdCount, 
        updated: updatedCount, 
        errors: errorCount,
        hasMore: !!nextPageInfo
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    await logger.error('Order sync failed', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Maps Shopify order status to internal status
 */
function mapShopifyStatus(order: any, currentStatus: string): string {
  // Don't change status if already processed internally
  if (['confirmed', 'reserved', 'picking', 'packed', 'shipped', 'completed'].includes(currentStatus)) {
    return currentStatus
  }
  
  // Map based on Shopify fulfillment status
  if (order.fulfillment_status === 'fulfilled') {
    return 'shipped'
  }
  if (order.fulfillment_status === 'partial') {
    return 'partially_shipped'
  }
  if (order.cancelled_at) {
    return 'cancelled'
  }
  
  return currentStatus || 'new'
}

/**
 * Syncs line items for an order
 */
async function syncLineItems(supabase: any, orderId: string, lineItems: any[]) {
  if (!lineItems?.length) return

  // Delete existing line items and recreate (simpler than diffing)
  await supabase.from('sales_order_lines').delete().eq('sales_order_id', orderId)

  for (const item of lineItems) {
    // Try to match product by SKU
    let productId = null
    if (item.sku) {
      const { data: product } = await supabase
        .from('products')
        .select('id')
        .eq('sku', item.sku)
        .maybeSingle()
      if (product) productId = product.id
    }

    // Try by variant ID if no SKU match
    if (!productId && item.variant_id) {
      const { data: product } = await supabase
        .from('products')
        .select('id')
        .eq('shopify_variant_id', item.variant_id)
        .maybeSingle()
      if (product) productId = product.id
    }

    await supabase.from('sales_order_lines').insert({
      sales_order_id: orderId,
      product_id: productId,
      sku: item.sku || null,
      product_name: item.title || item.name || null,
      shopify_line_item_id: item.id?.toString() || null,
      shopify_variant_id: item.variant_id?.toString() || null,
      quantity_ordered: item.quantity,
      unit_price: parseFloat(item.price) || 0
    })
  }
}
