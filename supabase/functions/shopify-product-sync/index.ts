// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { ShopifyClient } from "../_shared/shopify.ts"
import { getSupabaseEnv } from "../_shared/env.ts"
import { createLogger } from "../_shared/logger.ts"

const logger = createLogger('shopify-product-sync')
logger.debug("Shopify Product Sync Function Started")

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Wrap entire function in try-catch to ensure CORS headers are always returned
  try {
    // 1. Validate and setup Supabase Client
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getSupabaseEnv()
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  let sync_id: string | undefined
  let jobId: string | undefined
  let integrationId: string | undefined
  let page_info: string | undefined
  let queueId: string | undefined

  try {
    const body = await req.json().catch(() => ({}))
    sync_id = body.sync_id
    jobId = body.jobId
    integrationId = body.integrationId
    page_info = body.page_info
    queueId = body.queueId
    
    // Set context for all subsequent logs
    logger.setContext({ integrationId, queueId, jobId })
    
    await logger.debug(`Received request - integrationId: ${integrationId}, jobId: ${jobId}, queueId: ${queueId}, page_info: ${page_info ? 'present' : 'none'}`)
    await logger.info('Product sync started', { integrationId, queueId })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { 
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }

  // Validate integrationId before starting background task
  if (!integrationId) {
    await logger.error('ERROR: integrationId is missing from request')
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

      // Helper to classify errors as retryable or permanent
      const classifyError = (error: any): 'retryable' | 'permanent' | 'unknown' => {
        const message = error.message?.toLowerCase() || ''
        // Permanent errors - don't retry
        if (message.includes('invalid api key') || 
            message.includes('401') || 
            message.includes('403') ||
            message.includes('not found') ||
            message.includes('shop not found')) {
          return 'permanent'
        }
        // Retryable errors
        if (message.includes('rate limit') || 
            message.includes('429') ||
            message.includes('timeout') ||
            message.includes('network') ||
            message.includes('econnreset') ||
            message.includes('500') ||
            message.includes('502') ||
            message.includes('503') ||
            message.includes('504')) {
          return 'retryable'
        }
        return 'unknown'
      }

      // Helper to update heartbeat (keeps job alive)
      const updateHeartbeat = async () => {
        if (queueId) {
          await supabase.from('sync_queue').update({
            last_heartbeat: new Date().toISOString()
          }).eq('id', queueId)
        }
      }

      // Helper to save checkpoint for resumable syncs
      const saveCheckpoint = async (checkpoint: any) => {
        if (queueId) {
          await supabase.from('sync_queue').update({
            checkpoint,
            last_heartbeat: new Date().toISOString()
          }).eq('id', queueId)
        }
      }

      // Check for concurrent sync on same integration (concurrency lock)
      if (queueId) {
        const { data: existingSync } = await supabase
          .from('sync_queue')
          .select('id')
          .eq('integration_id', integrationId)
          .eq('sync_type', 'product_sync')
          .eq('status', 'processing')
          .neq('id', queueId)
          .maybeSingle()
        
        if (existingSync) {
          await logger.debug(`Another sync already processing for integration ${integrationId}`)
          return { success: false, error: 'Another sync is already in progress for this integration' }
        }
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

      // Create job record if this is the first page (no jobId provided)
      if (!jobId && !page_info) {
        const { data: newJob, error: jobError } = await supabase
          .from('integration_sync_jobs')
          .insert({
            integration_id: integration.id,
            integration_type: 'shopify',
            job_type: 'product_sync',
            status: 'pending',
            total_items: 0,
            processed_items: 0,
            queue_id: queueId || null
          })
          .select()
          .single()
        
        if (jobError) {
          await logger.error('Failed to create job', jobError)
          await log(`Failed to create sync job: ${jobError.message}`, "error")
        } else {
          jobId = newJob.id
          await logger.debug(`Created new job ${jobId}`)
        }
      }

      // Only set to running if this is the first page
      if (jobId && !page_info) {
        await supabase.from('integration_sync_jobs').update({
          status: 'running',
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq('id', jobId)
        await logger.debug(`Job ${jobId} marked as running`)
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
      const limit = 250
      await logger.debug(`Fetching page with limit ${limit}`, { page_info: page_info || 'none' })
      
      // Update heartbeat before fetching
      await updateHeartbeat()
      
      const { products, nextPageInfo } = await shopify.getProductsPage(limit, page_info)
      
      // Update heartbeat after fetching
      await updateHeartbeat()
      
      await logger.debug(`Fetched ${products.length} products`, { nextPageInfo: nextPageInfo ? 'present' : 'none' })
      await log(`Fetched batch of ${products.length} products from Shopify.`, "info")

      if (products.length > 0) {
        // Process Batch
        const unmatchedBatch: any[] = []
        const integrationUpserts: any[] = []

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

        // Track matched variant IDs for batch deletion of unmatched records
        const matchedVariantIds: string[] = []

        // 3. Process products using the map
        for (const sp of products) {
          for (const variant of sp.variants) {
            if (!variant.sku) continue

            const existingProduct = productMap.get(variant.sku)

            if (existingProduct) {
              matchedCount++

              // Prepare integration link
              integrationUpserts.push({
                    product_id: existingProduct.id,
                    integration_id: integration.id,
                    external_product_id: sp.id.toString(),
                    external_variant_id: variant.id.toString()
              })

              updatedCount++
              
              // Track this variant to remove from unmatched later
              matchedVariantIds.push(variant.id.toString())
                
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
        // First, batch delete matched variants from unmatched table
        if (matchedVariantIds.length > 0) {
            await logger.debug(`Removing ${matchedVariantIds.length} newly matched products from unmatched table`)
            await supabase
                .from('integration_unmatched_products')
                .delete()
                .eq('integration_id', integration.id)
                .in('external_variant_id', matchedVariantIds)
        }

        if (integrationUpserts.length > 0) {
            await logger.debug(`Upserting ${integrationUpserts.length} product integration links`)
            const { error: linkError } = await supabase
                .from('product_integrations')
                .upsert(integrationUpserts, { onConflict: 'product_id, integration_id' })
            
            if (linkError) {
                await logger.error('Error linking products', linkError)
                await log(`Error linking products: ${linkError.message}`, "error")
            } else {
                await log(`Linked ${integrationUpserts.length} products`, "info")
            }
        }

        if (unmatchedBatch.length > 0) {
            await logger.debug(`Upserting ${unmatchedBatch.length} unmatched products`)
            const { error: unmatchedError } = await supabase
                .from('integration_unmatched_products')
                .upsert(unmatchedBatch, { onConflict: 'integration_id, external_variant_id' })
            
            if (unmatchedError) {
                await logger.error('Error inserting unmatched products', unmatchedError)
                await log(`Error recording unmatched products: ${unmatchedError.message}`, "error")
            } else {
                await log(`Recorded ${unmatchedBatch.length} unmatched products`, "info")
            }
        }

        await log(`Batch summary: ${matchedCount} matched, ${unmatchedBatch.length} unmatched`, "info")

        // Update Progress (Incrementally)
        if (jobId) {
            const { data: currentJob } = await supabase.from('integration_sync_jobs').select('processed_items').eq('id', jobId).single()
            const newTotal = (currentJob?.processed_items || 0) + processedCount
            
            await logger.debug(`Updating progress: ${newTotal} total processed`)
            await supabase.from('integration_sync_jobs').update({
                processed_items: newTotal,
                updated_at: new Date().toISOString()
            }).eq('id', jobId)
        }
      }

      // 5. Check for Next Page
      if (nextPageInfo) {
          await logger.debug(`More pages available. Returning nextPageInfo to client.`)
          await log(`Batch complete. Processed ${processedCount}. Returning next page info to client...`, "info")
          return { success: true, nextPageInfo, jobId, message: `Processed ${processedCount} items. More pages available.` }
      } else {
          // No more pages - Complete!
          await logger.debug(`No more pages, marking job as completed`)
          if (jobId) {
            await supabase.from('integration_sync_jobs').update({
              status: 'completed',
              completed_at: new Date().toISOString()
            }).eq('id', jobId)
          }
          
          // Mark queue item as completed if queueId provided
          if (queueId) {
            await supabase.from('sync_queue').update({
              status: 'completed',
              completed_at: new Date().toISOString()
            }).eq('id', queueId)
          }
          
          await log(`Sync Complete.`, "success")
          await logger.info('Product sync complete', { processedCount, matchedCount: result?.matched || 0 })
          return { success: true, nextPageInfo: null, jobId, message: "Sync Complete" }
      }

    } catch (error: any) {
      await logger.error('Error in sync process', error)
      
      // Classify the error
      const classifyError = (err: any): 'retryable' | 'permanent' | 'unknown' => {
        const message = err.message?.toLowerCase() || ''
        if (message.includes('invalid api key') || message.includes('401') || message.includes('403') || message.includes('not found')) {
          return 'permanent'
        }
        if (message.includes('rate limit') || message.includes('429') || message.includes('timeout') || message.includes('network') || message.includes('5')) {
          return 'retryable'
        }
        return 'unknown'
      }
      const errorType = classifyError(error)
      
      // Try to update job status if we have an ID
      if (jobId) {
           await logger.debug(`Marking job ${jobId} as failed`, { errorType })
           await supabase.from('integration_sync_jobs').update({
              status: 'failed',
              error_message: error.message,
              completed_at: new Date().toISOString()
           }).eq('id', jobId)
           
           // Also log to integration_logs
           await supabase.from('integration_logs').insert({
              integration_id: integrationId,
              level: 'error',
              event_type: 'product_sync',
              message: `Sync Failed (${errorType}): ${error.message}`,
              details: { sync_id, jobId, error: error.message, errorType, stack: error.stack }
           })
      }
      
      // Mark queue item as failed if queueId provided, include error classification
      if (queueId) {
        // For retryable errors with retries left, set back to pending
        const { data: queueItem } = await supabase
          .from('sync_queue')
          .select('retry_count, max_retries, checkpoint')
          .eq('id', queueId)
          .single()
        
        const shouldRetry = errorType === 'retryable' && 
                           queueItem && 
                           queueItem.retry_count < queueItem.max_retries
        
        await supabase.from('sync_queue').update({
          status: shouldRetry ? 'pending' : 'failed',
          error_message: error.message,
          error_type: errorType,
          retry_count: (queueItem?.retry_count || 0) + (shouldRetry ? 1 : 0),
          completed_at: shouldRetry ? null : new Date().toISOString(),
          started_at: shouldRetry ? null : undefined,
          last_heartbeat: null
        }).eq('id', queueId)
        
        if (shouldRetry) {
          await logger.debug(`Retryable error, queued for retry`, { attempt: (queueItem?.retry_count || 0) + 1, maxRetries: queueItem?.max_retries })
        }
      }
      
      return { success: false, error: error.message, errorType }
    }
  }

  // Execute Sync Synchronously
  const result = await runSync()

  // Return result to client
  return new Response(
    JSON.stringify(result),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
  } catch (fatalError: any) {
    // This catch block ensures CORS headers are returned even on fatal errors
    await logger.error('Fatal error', fatalError)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: fatalError.message || 'Internal server error',
        errorType: 'fatal'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    )
  }
})
