// deno-lint-ignore-file no-explicit-any
/**
 * Shopify Order Sync - Ultra Simplified
 * 
 * Direct sync with real-time progress updates via shopify_syncs table.
 * No queue system - frontend calls this directly.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { ShopifyClient } from '../_shared/shopify.ts'
import { getSupabaseEnv } from '../_shared/env.ts'
import { getShopifyConfig } from '../_shared/shopify-config.ts'

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getSupabaseEnv()
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    // Create sync record
    const { data: sync, error: syncError } = await supabase
      .from('shopify_syncs')
      .insert({ sync_type: 'orders' })
      .select()
      .single()

    if (syncError) throw syncError

    console.log(`[Order Sync] Started sync ${sync.id}`)

    // Get Shopify config from environment
    const shopifyConfig = await getShopifyConfig()
    const shopify = new ShopifyClient(shopifyConfig)

    let totalProcessed = 0
    let createdCount = 0
    let updatedCount = 0
    let errorCount = 0
    let pageInfo: string | undefined = undefined
    let pageNum = 1

    // Paginate through all orders
    do {
      console.log(`[Order Sync] Fetching page ${pageNum}`)
      
      const { orders, nextPageInfo } = await shopify.getOrdersPage(50, pageInfo, 'any')
      
      console.log(`[Order Sync] Processing ${orders.length} orders from page ${pageNum}`)

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
                order_date: order.created_at,
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
              console.error(`[Order Sync] Failed to update order #${order.name}:`, updateError)
              errorCount++
            } else {
              updatedCount++
              console.log(`[Order Sync] Updated order ${order.name}`)
              
              // Update line items
              await syncLineItems(supabase, existingOrder.id, order.line_items)
            }
          } else {
            // Create new order
            const { data: newOrder, error: createError } = await supabase
              .from('sales_orders')
              .insert({
                shopify_order_id: Number(order.id),
                shopify_order_number: order.name,
                source: 'shopify',
                status: 'new',
                order_date: order.created_at,
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
              console.error(`[Order Sync] Failed to create order #${order.name}:`, createError)
              errorCount++
            } else {
              createdCount++
              console.log(`[Order Sync] Created order ${order.name}`)
              
              // Create line items
              if (newOrder) {
                await syncLineItems(supabase, newOrder.id, order.line_items)
              }
            }
          }

          totalProcessed++
        } catch (orderError: any) {
          console.error(`[Order Sync] Error processing order #${order.name}:`, orderError)
          errorCount++
        }
      }

      // Update progress every page
      const progressPct = Math.min(100, Math.round((pageNum / 10) * 100)) // Rough estimate
      await supabase
        .from('shopify_syncs')
        .update({
          processed_items: totalProcessed,
          created_count: createdCount,
          updated_count: updatedCount,
          error_count: errorCount,
          current_page: pageNum,
          progress_pct: progressPct
        })
        .eq('id', sync.id)

      pageInfo = nextPageInfo
      pageNum++
      
    } while (pageInfo)

    // Mark sync as completed
    await supabase
      .from('shopify_syncs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_items: totalProcessed,
        processed_items: totalProcessed,
        progress_pct: 100
      })
      .eq('id', sync.id)

    console.log(`[Order Sync] Completed: ${createdCount} created, ${updatedCount} updated, ${errorCount} errors`)

    return new Response(
      JSON.stringify({ 
        success: true,
        sync_id: sync.id,
        total: totalProcessed,
        created: createdCount, 
        updated: updatedCount, 
        errors: errorCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('[Order Sync] Fatal error:', error)

    // Try to update sync status to failed
    try {
      const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getSupabaseEnv()
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      
      const { data: latestSync } = await supabase
        .from('shopify_syncs')
        .select('id')
        .eq('sync_type', 'orders')
        .eq('status', 'running')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestSync) {
        await supabase
          .from('shopify_syncs')
          .update({
            status: 'failed',
            error_message: error.message,
            completed_at: new Date().toISOString()
          })
          .eq('id', latestSync.id)
      }
    } catch (updateError) {
      console.error('[Order Sync] Failed to update sync status:', updateError)
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
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
    // Try to match product by SKU (case-insensitive with trim)
    let productId = null
    if (item.sku) {
      const { data: product } = await supabase
        .from('products')
        .select('id')
        .ilike('sku', item.sku.trim())
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
