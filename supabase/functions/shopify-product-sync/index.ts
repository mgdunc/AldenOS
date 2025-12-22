import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { ShopifyClient } from "../_shared/shopify.ts"

console.log("Shopify Product Sync Function Started")

serve(async (req) => {
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
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { 
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
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
          updated_at: new Date().toISOString()
        }).eq('id', jobId)
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
        } catch (e) {
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
      const { products, nextPageInfo } = await shopify.getProductsPage(250, page_info)
      
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
            const { error: linkError } = await supabase
                .from('product_integrations')
                .upsert(integrationUpserts, { onConflict: 'product_id, integration_id' })
            
            if (linkError) console.error('Error linking products:', linkError)
        }

        if (unmatchedBatch.length > 0) {
            const { error: unmatchedError } = await supabase
                .from('integration_unmatched_products')
                .upsert(unmatchedBatch, { onConflict: 'integration_id, external_variant_id' })
            
            if (unmatchedError) {
                console.error('Error inserting unmatched products:', unmatchedError)
            }
        }

        if (productUpdates.length > 0) {
            await Promise.all(productUpdates)
        }

        // Update Progress (Incrementally)
        if (jobId) {
            // We need to increment the processed_items count. 
            // Since we can't do "processed_items = processed_items + X" easily via JS client without RPC,
            // we'll just read it first (we did above, but let's be safe) or use an RPC if available.
            // For now, let's just read-modify-write, assuming single-threaded execution per job.
            const { data: currentJob } = await supabase.from('integration_sync_jobs').select('processed_items').eq('id', jobId).single()
            const newTotal = (currentJob?.processed_items || 0) + processedCount
            
            await supabase.from('integration_sync_jobs').update({
                processed_items: newTotal,
                updated_at: new Date().toISOString()
            }).eq('id', jobId)
        }
      }

      // 5. Check for Next Page
      if (nextPageInfo) {
          await log(`Batch complete. Processed ${processedCount}. Starting next batch...`, "info")
          
          // Invoke Function Again (Recursive)
          const functionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/shopify-product-sync`
          
          // We don't await this fetch because we want to return the current response and let the next one run independently
          // BUT, EdgeRuntime.waitUntil keeps the current execution alive.
          // Actually, we SHOULD await it if we want to chain them sequentially to avoid hitting rate limits too hard.
          // But if we await, we might hit the execution time limit of THIS function.
          // So we fire and forget.
          
          fetch(functionUrl, {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                  sync_id,
                  jobId,
                  integrationId,
                  page_info: nextPageInfo
              })
          }).catch(e => console.error("Failed to trigger next batch", e))

      } else {
          // No more pages - Complete!
          if (jobId) {
            await supabase.from('integration_sync_jobs').update({
              status: 'completed',
              completed_at: new Date().toISOString()
            }).eq('id', jobId)
          }
          await log(`Sync Complete.`, "success")
      }

    } catch (error: any) {
      console.error(error)
      
      // Try to update job status if we have an ID
      if (jobId) {
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
              details: { sync_id, jobId, error: error.message }
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
