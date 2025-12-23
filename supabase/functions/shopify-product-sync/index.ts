// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// Force deploy update: 2025-12-22b
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { ShopifyClient } from "../_shared/shopify.ts"

console.log("Shopify Product Sync Function Started")

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // 1. Setup Supabase Client
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  let sync_id: string | undefined
  let jobId: string | undefined
  let integrationId: string | undefined
  let page_info: string | undefined

  try {
    const body = await req.json().catch(() => ({}))
    sync_id = body.sync_id
    jobId = body.jobId
    integrationId = body.integrationId
    page_info = body.page_info
    
    console.log(`[SYNC] Received request - integrationId: ${integrationId}, jobId: ${jobId}, page_info: ${page_info ? 'present' : 'none'}`)
    console.log(`[SYNC] Full body:`, JSON.stringify(body))
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { 
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }

  // Validate integrationId before starting background task
  if (!integrationId) {
    console.error('[SYNC] ERROR: integrationId is missing from request')
    return new Response(
      JSON.stringify({ error: "Integration ID is required" }),
      { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    )
  }

  // Define the background task
  const runSync = async () => {
    try {
      // 2. Get Integration Settings
      if (!integrationId) {
        throw new Error("Integration ID is required")
      }

      const { data: integration, error: dbError } = await supabase
        .from('integrations')
        .select('id, settings')
        .eq('id', integrationId)
        .single()

      if (dbError || !integration || !integration.settings) {
        throw new Error("Shopify integration not configured")
      }

      // Helper to log events
      const log = async (message: string, level = 'info', details = {}) => {
        await supabase.from('integration_logs').insert({
          integration_id: integration.id,
          level,
          event_type: 'product_sync',
          message,
          details: { ...details, sync_id, jobId }
        })
      }

      // Only set to running if this is the first page
      if (jobId && !page_info) {
        await supabase.from('integration_sync_jobs').update({
          status: 'running',
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq('id', jobId)
        console.log(`[SYNC] Job ${jobId} marked as running`)
      }

      if (sync_id && !page_info) await log("Starting product sync...", "info")

      const { shop_url, access_token } = integration.settings
      if (!shop_url || !access_token) {
        throw new Error("Missing Shop URL or Access Token")
      }

      // Initialize Shopify Client
      const shopify = new ShopifyClient({
        shopUrl: shop_url,
        accessToken: access_token
      })

      // 3. Get Total Count (Only on first page)
      if (!page_info) {
        try {
            const count = await shopify.getProductsCount()
            if (jobId) {
            await supabase.from('integration_sync_jobs').update({
                total_items: count
            }).eq('id', jobId)
            }
            await log(`Found ${count} products to sync.`, "info")
        } catch (e: any) {
            await log(`Failed to get product count: ${e.message}`, "warning")
        }
      }

      // 4. Fetch Products from Shopify (Single Page)
      let processedCount = 0
      let matchedCount = 0
      let updatedCount = 0

      // Check for cancellation before processing
      if (jobId) {
        const { data: job } = await supabase.from('integration_sync_jobs').select('status, processed_items').eq('id', jobId).single()
        if (job?.status === 'cancelled') {
            await log("Sync cancelled by user.", "warning")
            return
        }
        // Initialize processedCount from DB if continuing
        // Actually, we will just add to it.
      }

      // Fetch ONE page
      console.log(`[SYNC] Fetching page with limit 50, page_info: ${page_info || 'none'}`)
      const { products, nextPageInfo } = await shopify.getProductsPage(50, page_info)
      
      console.log(`[SYNC] Fetched ${products.length} products, nextPageInfo: ${nextPageInfo ? 'present' : 'none'}`)
      await log(`Fetched batch of ${products.length} products from Shopify.`, "info")

      if (products.length > 0) {
        // Process Batch
        const unmatchedBatch: any[] = []
        const integrationUpserts: any[] = []
        const productUpdates: Promise<any>[] = []

        // 1. Collect all SKUs in this batch
        const skusInBatch = new Set<string>()
        for (const sp of products) {
            for (const variant of sp.variants) {
                if (variant.sku) skusInBatch.add(variant.sku)
            }
        }

        // 2. Fetch existing products in one go
        const { data: existingProducts } = await supabase
            .from('products')
            .select('id, sku, image_url')
            .in('sku', Array.from(skusInBatch))
        
        const productMap = new Map<string, any>()
        if (existingProducts) {
            existingProducts.forEach((p: any) => productMap.set(p.sku, p))
        }

        // 3. Process products using the map
        for (const sp of products) {
          for (const variant of sp.variants) {
            if (!variant.sku) continue

            const existingProduct = productMap.get(variant.sku)

            if (existingProduct) {
              matchedCount++
              
              // Update image if missing
              if (!existingProduct.image_url && (sp.image?.src || sp.images?.[0]?.src)) {
                  const imageUrl = sp.image?.src || sp.images?.[0]?.src
                  productUpdates.push(
                      supabase.from('products').update({ image_url: imageUrl }).eq('id', existingProduct.id)
                  )
              }

              // Prepare integration link
              integrationUpserts.push({
                    product_id: existingProduct.id,
                    integration_id: integration.id,
                    external_product_id: sp.id.toString(),
                    external_variant_id: variant.id.toString()
              })

              updatedCount++
              
              // Remove from unmatched if it was there previously
              // This is a "soft delete" - we'll delete any existing unmatched record for this variant
              await supabase
                .from('integration_unmatched_products')
                .delete()
                .eq('integration_id', integration.id)
                .eq('external_variant_id', variant.id.toString())
                
            } else {
                // Add to unmatched batch
                unmatchedBatch.push({
                    integration_id: integration.id,
                    external_product_id: sp.id.toString(),
                    external_variant_id: variant.id.toString(),
                    sku: variant.sku,
                    name: sp.title,
                    variant_name: variant.title === 'Default Title' ? sp.title : `${sp.title} - ${variant.title}`,
                    price: variant.price,
                    cost: variant.inventory_item_id ? 0 : 0,
                    data: {
                        inventory_item_id: variant.inventory_item_id,
                        weight: variant.weight,
                        weight_unit: variant.weight_unit,
                        // images: sp.images, // Removed to reduce payload size
                        image_url: sp.image?.src || sp.images?.[0]?.src
                    }
                })
            }
          }
          processedCount++
        }

        // 4. Execute Bulk Operations
        if (integrationUpserts.length > 0) {
            console.log(`[SYNC] Upserting ${integrationUpserts.length} product integration links`)
            const { error: linkError } = await supabase
                .from('product_integrations')
                .upsert(integrationUpserts, { onConflict: 'product_id, integration_id' })
            
            if (linkError) {
                console.error('[SYNC] Error linking products:', linkError)
                await log(`Error linking products: ${linkError.message}`, "error")
            } else {
                await log(`Linked ${integrationUpserts.length} products`, "info")
            }
        }

        if (unmatchedBatch.length > 0) {
            console.log(`[SYNC] Upserting ${unmatchedBatch.length} unmatched products`)
            const { error: unmatchedError } = await supabase
                .from('integration_unmatched_products')
                .upsert(unmatchedBatch, { onConflict: 'integration_id, external_variant_id' })
            
            if (unmatchedError) {
                console.error('[SYNC] Error inserting unmatched products:', unmatchedError)
                await log(`Error recording unmatched products: ${unmatchedError.message}`, "error")
            } else {
                await log(`Recorded ${unmatchedBatch.length} unmatched products`, "info")
            }
        }

        if (productUpdates.length > 0) {
            console.log(`[SYNC] Updating ${productUpdates.length} product images`)
            await Promise.all(productUpdates)
            await log(`Updated ${productUpdates.length} product images`, "info")
        }

        await log(`Batch summary: ${matchedCount} matched, ${unmatchedBatch.length} unmatched`, "info")

        // Update Progress (Incrementally)
        if (jobId) {
            const { data: currentJob } = await supabase.from('integration_sync_jobs').select('processed_items').eq('id', jobId).single()
            const newTotal = (currentJob?.processed_items || 0) + processedCount
            
            console.log(`[SYNC] Updating progress: ${newTotal} total processed`)
            await supabase.from('integration_sync_jobs').update({
                processed_items: newTotal,
                updated_at: new Date().toISOString()
            }).eq('id', jobId)
        }
      }

      // 5. Check for Next Page
      if (nextPageInfo) {
          console.log(`[SYNC] More pages available, triggering next batch`)
          await log(`Batch complete. Processed ${processedCount}. Starting next batch...`, "info")
          
          // Invoke Function Again (Recursive)
          const functionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/shopify-product-sync`
          const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
          
          if (!serviceRoleKey) {
            console.error('[SYNC] ERROR: SUPABASE_SERVICE_ROLE_KEY not available')
            throw new Error('Service role key not available for recursive call')
          }
          
          try {
            console.log(`[SYNC] Calling ${functionUrl} for next page with service key`)
            const res = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sync_id,
                    jobId,
                    integrationId,
                    page_info: nextPageInfo
                })
            })
            if (!res.ok) {
                const text = await res.text()
                console.error(`[SYNC] Failed to trigger next batch: ${res.status} ${text}`)
                throw new Error(`Failed to trigger next batch: ${res.status} ${text}`)
            }
            console.log(`[SYNC] Successfully triggered next batch`)
            await log(`Triggered next batch successfully.`, "info")
          } catch (e: any) {
             console.error("[SYNC] Failed to trigger next batch", e)
             await log(`Error triggering next batch: ${e.message}`, "error")
             throw e // Re-throw to mark job as failed
          }

      } else {
          // No more pages - Complete!
          console.log(`[SYNC] No more pages, marking job as completed`)
          if (jobId) {
            await supabase.from('integration_sync_jobs').update({
              status: 'completed',
              completed_at: new Date().toISOString()
            }).eq('id', jobId)
          }
          await log(`Sync Complete.`, "success")
      }

    } catch (error: any) {
      console.error('[SYNC] Error in sync process:', error)
      
      // Try to update job status if we have an ID
      if (jobId) {
           console.log(`[SYNC] Marking job ${jobId} as failed`)
           await supabase.from('integration_sync_jobs').update({
              status: 'failed',
              error_message: error.message,
              completed_at: new Date().toISOString()
           }).eq('id', jobId)
           
           // Also log to integration_logs
           await supabase.from('integration_logs').insert({
              level: 'error',
              event_type: 'product_sync',
              message: `Sync Failed: ${error.message}`,
              details: { sync_id, jobId, error: error.message, stack: error.stack }
           })
      }
    }
  }

  // Start the background task
  // @ts-ignore
  EdgeRuntime.waitUntil(runSync())

  // Return immediately
  return new Response(
    JSON.stringify({ message: "Sync started in background" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
})
