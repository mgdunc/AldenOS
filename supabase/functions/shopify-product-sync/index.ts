// deno-lint-ignore-file no-explicit-any
/**
 * Shopify Product Sync - Single Store Edition
 * 
 * Simplified sync that uses environment variables for Shopify credentials.
 * Syncs products directly to the products table using shopify_product_id/shopify_variant_id.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { ShopifyClient } from '../_shared/shopify.ts'
import { getSupabaseEnv } from '../_shared/env.ts'
import { getShopifyConfig } from '../_shared/shopify-config.ts'
import { createLogger } from '../_shared/logger.ts'

const logger = createLogger('shopify-product-sync')

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

    await logger.info('Product sync started')

    // Get Shopify config from environment
    const shopifyConfig = getShopifyConfig()
    const shopify = new ShopifyClient(shopifyConfig)

    // Update queue status if provided
    if (queueId) {
      await supabase.from('sync_queue').update({
        status: 'processing',
        started_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString()
      }).eq('id', queueId)
    }

    // Fetch products from Shopify
    const { products, nextPageInfo } = await shopify.getProductsPage(50, page_info)
    await logger.debug(`Fetched ${products.length} products from Shopify`)

    let createdCount = 0
    let updatedCount = 0
    let errorCount = 0

    // Process each product
    for (const product of products) {
      try {
        // Process each variant as a separate product (WMS typically tracks at variant/SKU level)
        for (const variant of product.variants || []) {
          const sku = variant.sku || `SHOPIFY-${variant.id}`
          
          // Check if product exists by SKU or Shopify variant ID
          const { data: existingProduct } = await supabase
            .from('products')
            .select('id')
            .or(`sku.eq.${sku},shopify_variant_id.eq.${variant.id}`)
            .maybeSingle()

          const productData = {
            sku,
            name: product.variants.length > 1 
              ? `${product.title} - ${variant.title}` 
              : product.title,
            description: product.body_html?.replace(/<[^>]*>/g, '') || null,
            shopify_product_id: product.id.toString(),
            shopify_variant_id: variant.id.toString(),
            barcode: variant.barcode || null,
            list_price: parseFloat(variant.price) || 0,
            compare_at_price: variant.compare_at_price ? parseFloat(variant.compare_at_price) : null,
            cost_price: variant.inventory_item?.cost ? parseFloat(variant.inventory_item.cost) : null,
            vendor: product.vendor || null,
            product_type: product.product_type || null,
            image_url: product.image?.src || product.images?.[0]?.src || null,
            status: product.status === 'active' ? 'active' : 'inactive',
            weight: variant.weight || null,
            weight_unit: variant.weight_unit || null,
          }

          if (existingProduct) {
            // Update existing product
            const { error } = await supabase
              .from('products')
              .update(productData)
              .eq('id', existingProduct.id)

            if (error) {
              await logger.error(`Failed to update product ${sku}`, error)
              errorCount++
            } else {
              updatedCount++
            }
          } else {
            // Create new product
            const { error } = await supabase
              .from('products')
              .insert(productData)

            if (error) {
              await logger.error(`Failed to create product ${sku}`, error)
              errorCount++
            } else {
              createdCount++
            }
          }
        }
      } catch (productError: any) {
        await logger.error(`Error processing product ${product.title}`, productError)
        errorCount++
      }
    }

    // Handle pagination
    if (nextPageInfo && queueId) {
      await supabase.from('sync_queue').update({
        metadata: { page_info: nextPageInfo },
        status: 'pending'
      }).eq('id', queueId)
      
      await logger.info('Queued next page', { nextPageInfo })
    } else if (queueId) {
      await supabase.from('sync_queue').update({
        status: 'completed',
        completed_at: new Date().toISOString()
      }).eq('id', queueId)
    }

    await logger.info('Product sync completed', { createdCount, updatedCount, errorCount })

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
    await logger.error('Product sync failed', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
