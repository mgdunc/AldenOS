import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

console.log("Shopify Product Sync Function Started")

serve(async (req) => {
  // 1. Setup Supabase Client
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  let sync_id: string | undefined
  let jobId: string | undefined
  let integrationId: string | undefined

  try {
    const body = await req.json().catch(() => ({}))
    sync_id = body.sync_id
    jobId = body.jobId
    integrationId = body.integrationId
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 })
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

      if (jobId) {
        await supabase.from('integration_sync_jobs').update({
          status: 'running',
          updated_at: new Date().toISOString()
        }).eq('id', jobId)
      }

      if (sync_id) await log("Starting product sync...", "info")

      let { shop_url, access_token } = integration.settings
      if (!shop_url || !access_token) {
        throw new Error("Missing Shop URL or Access Token")
      }

      // Clean URL
      shop_url = shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '')
      
      const headers = {
        'X-Shopify-Access-Token': access_token,
        'Content-Type': 'application/json'
      }

      // Helper for rate limits
      const fetchShopify = async (url: string) => {
          let retries = 5
          while (retries > 0) {
              try {
                const res = await fetch(url, { headers })
                if (res.status === 429) {
                    const retryAfter = res.headers.get('Retry-After')
                    const wait = retryAfter ? parseFloat(retryAfter) * 1000 : 2000
                    await log(`Rate limit hit. Waiting ${wait}ms`, 'warning')
                    await new Promise(resolve => setTimeout(resolve, wait + 1000))
                    retries--
                    continue
                }
                return res
              } catch (e) {
                 // Network error, wait and retry
                 await log(`Network error: ${e.message}. Retrying...`, 'warning')
                 await new Promise(resolve => setTimeout(resolve, 2000))
                 retries--
              }
          }
          throw new Error("Shopify API Request Failed (Max Retries)")
      }

      // 3. Get Total Count
      const countUrl = `https://${shop_url}/admin/api/2023-04/products/count.json`
      const countRes = await fetchShopify(countUrl)
      if (countRes.ok) {
        const countJson = await countRes.json()
        if (jobId) {
          await supabase.from('integration_sync_jobs').update({
            total_items: countJson.count
          }).eq('id', jobId)
        }
        await log(`Found ${countJson.count} products to sync.`, "info")
      }

      // 4. Fetch Products from Shopify (Paginated)
      let nextUrl: string | null = `https://${shop_url}/admin/api/2023-04/products.json?limit=50`
      let processedCount = 0
      let matchedCount = 0
      let updatedCount = 0

      while (nextUrl) {
        // Check for cancellation
        if (jobId) {
          const { data: job } = await supabase.from('integration_sync_jobs').select('status').eq('id', jobId).single()
          if (job?.status === 'cancelled') {
            await log("Sync cancelled by user.", "warning")
            return
          }
        }

        const response = await fetchShopify(nextUrl)
        const responseText = await response.text()

        if (!response.ok) {
          throw new Error(`Shopify API Error (${response.status}): ${responseText}`)
        }

        let products = []
        try {
            const json = JSON.parse(responseText)
            products = json.products
        } catch (e) {
            throw new Error(`Failed to parse Shopify response: ${responseText.substring(0, 100)}...`)
        }

        // Process Batch
        const unmatchedBatch: any[] = []

        for (const sp of products) {
          for (const variant of sp.variants) {
            // Find product by SKU
            if (!variant.sku) {
                // Skip variants without SKU, or maybe log them?
                continue
            }

            const { data: existingProduct } = await supabase
              .from('products')
              .select('id, sku')
              .eq('sku', variant.sku)
              .single()

            if (existingProduct) {
              matchedCount++
              // Update product with Shopify ID
              // Also create entry in product_integrations if not exists
              const { error: linkError } = await supabase
                .from('product_integrations')
                .upsert({
                    product_id: existingProduct.id,
                    integration_id: integration.id,
                    external_product_id: sp.id.toString(),
                    external_variant_id: variant.id.toString()
                }, { onConflict: 'product_id, integration_id' })

              if (!linkError) updatedCount++
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
                    cost: variant.inventory_item_id ? 0 : 0, // Shopify API doesn't always return cost in this endpoint
                    data: {
                        inventory_item_id: variant.inventory_item_id,
                        weight: variant.weight,
                        weight_unit: variant.weight_unit,
                        images: sp.images
                    }
                })
            }
          }
          processedCount++
        }

        // Insert Unmatched Batch
        if (unmatchedBatch.length > 0) {
            const { error: unmatchedError } = await supabase
                .from('integration_unmatched_products')
                .upsert(unmatchedBatch, { onConflict: 'integration_id, external_variant_id' })
            
            if (unmatchedError) {
                console.error('Error inserting unmatched products:', unmatchedError)
            }
        }

        // Update Progress
        if (jobId) {
          await supabase.from('integration_sync_jobs').update({
            processed_items: processedCount,
            updated_at: new Date().toISOString()
          }).eq('id', jobId)
        }

        // Get Next Page
        const linkHeader = response.headers.get('Link')
        nextUrl = null
        if (linkHeader) {
          const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
          if (match) nextUrl = match[1]
        }
      }

      if (jobId) {
        await supabase.from('integration_sync_jobs').update({
          status: 'completed',
          completed_at: new Date().toISOString()
        }).eq('id', jobId)
      }

      await log(`Sync Complete. Processed ${processedCount}, Matched ${matchedCount}, Updated ${updatedCount}`, "success")

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
    { headers: { "Content-Type": "application/json" } }
  )
})
