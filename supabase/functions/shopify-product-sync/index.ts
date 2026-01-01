// deno-lint-ignore-file no-explicit-any
/**
 * Shopify Product Sync - Ultra Simplified
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
      .insert({ sync_type: 'products' })
      .select()
      .single()

    if (syncError) throw syncError

    console.log(`[Product Sync] Started sync ${sync.id}`)

    // Get Shopify config from environment
    const shopifyConfig = await getShopifyConfig()
    const shopify = new ShopifyClient(shopifyConfig)

    let totalProcessed = 0
    let createdCount = 0
    let updatedCount = 0
    let errorCount = 0
    let pageInfo: string | undefined = undefined
    let pageNum = 1

    // Paginate through all products
    do {
      console.log(`[Product Sync] Fetching page ${pageNum}`)
      
      const { products, nextPageInfo } = await shopify.getProductsPage(50, pageInfo)
      
      console.log(`[Product Sync] Processing ${products.length} products from page ${pageNum}`)

      // Process each product
      for (const product of products) {
        try {
          // Process each variant as a separate product (WMS tracks at SKU level)
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
              shopify_product_id: Number(product.id),
              shopify_variant_id: Number(variant.id),
              shopify_inventory_item_id: variant.inventory_item_id ? Number(variant.inventory_item_id) : null,
              barcode: variant.barcode || null,
              list_price: parseFloat(variant.price) || 0,
              compare_at_price: variant.compare_at_price ? parseFloat(variant.compare_at_price) : null,
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
                console.error(`[Product Sync] Failed to update product ${sku}:`, error)
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
                console.error(`[Product Sync] Failed to create product ${sku}:`, error)
                errorCount++
              } else {
                createdCount++
              }
            }

            totalProcessed++
          }
        } catch (productError: any) {
          console.error(`[Product Sync] Error processing product ${product.title}:`, productError)
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

    console.log(`[Product Sync] Completed: ${createdCount} created, ${updatedCount} updated, ${errorCount} errors`)

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
    console.error('[Product Sync] Fatal error:', error)

    // Try to update sync status to failed
    try {
      const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getSupabaseEnv()
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      
      const { data: latestSync } = await supabase
        .from('shopify_syncs')
        .select('id')
        .eq('sync_type', 'products')
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
      console.error('[Product Sync] Failed to update sync status:', updateError)
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
