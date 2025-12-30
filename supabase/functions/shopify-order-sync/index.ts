// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { ShopifyClient } from '../_shared/shopify.ts'
import { getSupabaseEnv } from '../_shared/env.ts'
import { createLogger } from '../_shared/logger.ts'

const logger = createLogger('shopify-order-sync')
logger.debug("Shopify Order Sync Function Started")

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

    let jobId: string | undefined
    let integrationId: string | undefined
    let page_info: string | undefined
    let queueId: string | undefined

    try {
      const body = await req.json().catch(() => ({}))
      jobId = body.jobId
      integrationId = body.integrationId || body.integration_id
      page_info = body.page_info
      queueId = body.queueId
      
      // Set context for all subsequent logs
      logger.setContext({ integrationId, queueId, jobId })
      
      logger.debug(`Received request - integrationId: ${integrationId}, jobId: ${jobId}, queueId: ${queueId}, page_info: ${page_info ? 'present' : 'none'}`)
      await logger.info('Order sync started', { integrationId, queueId })
    } catch (_e: any) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), { 
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // Validate integrationId
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

  // Run the sync
  const runSync = async () => {
    try {
      if (!integrationId) {
        throw new Error("Integration ID is required")
      }

      // Helper to update heartbeat
      const updateHeartbeat = async () => {
        if (queueId) {
          await supabase.from('sync_queue').update({
            last_heartbeat: new Date().toISOString()
          }).eq('id', queueId)
        }
      }

      // Check for concurrent sync
      if (queueId) {
        const { data: existingSync } = await supabase
          .from('sync_queue')
          .select('id')
          .eq('integration_id', integrationId)
          .eq('sync_type', 'order_sync')
          .eq('status', 'processing')
          .neq('id', queueId)
          .maybeSingle()
        
        if (existingSync) {
          logger.debug(` Another sync already processing for integration ${integrationId}`)
          return { success: false, error: 'Another sync is already in progress for this integration' }
        }
      }

      // Get Integration Settings
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
          event_type: 'order_sync',
          message,
          details: { ...details, jobId }
        })
      }

      // Create job record if this is the first page
      if (!jobId && !page_info) {
        const { data: newJob, error: jobError } = await supabase
          .from('integration_sync_jobs')
          .insert({
            integration_id: integration.id,
            integration_type: 'shopify',
            job_type: 'order_sync',
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
          logger.debug(` Created new job ${jobId}`)
        }
      }

      // Set to running if first page
      if (jobId && !page_info) {
        await supabase.from('integration_sync_jobs').update({
          status: 'running',
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq('id', jobId)
        logger.debug(` Job ${jobId} marked as running`)
        await log("Starting order sync...", "info")
      }

      const { shop_url, access_token } = integration.settings
      if (!shop_url || !access_token) {
        throw new Error("Missing Shop URL or Access Token")
      }

      // Initialize Shopify Client
      const shopify = new ShopifyClient({
        shopUrl: shop_url,
        accessToken: access_token
      })

      // Get Total Count (Only on first page)
      if (!page_info) {
        try {
          const count = await shopify.getOrdersCount('any')
          if (jobId) {
            await supabase.from('integration_sync_jobs').update({
              total_items: count,
              updated_at: new Date().toISOString()
            }).eq('id', jobId)
          }
          logger.debug(` Total orders: ${count}`)
        } catch (e) {
          logger.warn(' Could not get total count:', e)
        }
      }

      // Fetch one page of orders
      logger.debug(` Fetching orders page...`)
      await updateHeartbeat()
      
      const { orders, nextPageInfo } = await shopify.getOrdersPage(50, page_info, 'any')
      logger.debug(` Fetched ${orders.length} orders`)

      let processedCount = 0
      let matchedCount = 0
      let createdCount = 0
      let skippedCount = 0
      let errorCount = 0

      // Process each order
      for (const order of orders) {
        try {
          // Check if order already exists in our system
          const { data: existingOrder } = await supabase
            .from('sales_orders')
            .select('id, status, shopify_order_id')
            .eq('shopify_order_id', order.id)
            .maybeSingle()

          if (existingOrder) {
            // Order exists - skip
            matchedCount++
            skippedCount++
            logger.debug(` Order #${order.order_number} already exists as ${existingOrder.id}`)
          } else {
            // Create new order
            // Find or create customer
            let customerId = null
            if (order.customer) {
              const customerEmail = order.customer.email
              const customerName = `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim()
              
              if (customerEmail) {
                // Try to find existing customer
                const { data: existingCustomer } = await supabase
                  .from('customers')
                  .select('id')
                  .eq('email', customerEmail)
                  .maybeSingle()
                
                if (existingCustomer) {
                  customerId = existingCustomer.id
                } else {
                  // Create new customer
                  const { data: newCustomer } = await supabase
                    .from('customers')
                    .insert({
                      name: customerName || 'Unknown',
                      email: customerEmail,
                      phone: order.customer.phone || null,
                      shopify_customer_id: order.customer.id
                    })
                    .select('id')
                    .single()
                  
                  if (newCustomer) {
                    customerId = newCustomer.id
                  }
                }
              }
            }

            // Map Shopify status to our status
            let status = 'draft'
            if (order.cancelled_at) {
              status = 'cancelled'
            } else if (order.fulfillment_status === 'fulfilled') {
              status = 'completed'
            } else if (order.fulfillment_status === 'partial') {
              status = 'partially_shipped'
            } else if (order.financial_status === 'paid' || order.financial_status === 'partially_paid') {
              status = 'confirmed'
            }

            // Create the sales order
            const { data: newOrder, error: orderError } = await supabase
              .from('sales_orders')
              .insert({
                shopify_order_id: order.id,
                customer_name: order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : null,
                customer_id: customerId,
                status: status,
                total_amount: parseFloat(order.total_price) || 0,
                shipping_address: order.shipping_address ? {
                  name: order.shipping_address.name,
                  address1: order.shipping_address.address1,
                  address2: order.shipping_address.address2,
                  city: order.shipping_address.city,
                  province: order.shipping_address.province,
                  country: order.shipping_address.country,
                  zip: order.shipping_address.zip,
                  phone: order.shipping_address.phone
                } : null,
                billing_address: order.billing_address ? {
                  name: order.billing_address.name,
                  address1: order.billing_address.address1,
                  address2: order.billing_address.address2,
                  city: order.billing_address.city,
                  province: order.billing_address.province,
                  country: order.billing_address.country,
                  zip: order.billing_address.zip,
                  phone: order.billing_address.phone
                } : null
              })
              .select('id')
              .single()

            if (orderError) {
              console.error(`[ORDER_SYNC] Failed to create order #${order.order_number}:`, orderError)
              errorCount++
              processedCount++
              continue
            }

            // Create line items
            if (newOrder && order.line_items) {
              for (const lineItem of order.line_items) {
                // Try to match product by SKU or Shopify variant ID
                let productId = null
                
                if (lineItem.sku) {
                  const { data: product } = await supabase
                    .from('products')
                    .select('id')
                    .eq('sku', lineItem.sku)
                    .maybeSingle()
                  
                  if (product) {
                    productId = product.id
                  }
                }

                // If no match by SKU, try by shopify_variant_id
                if (!productId && lineItem.variant_id) {
                  const { data: product } = await supabase
                    .from('products')
                    .select('id')
                    .eq('shopify_variant_id', lineItem.variant_id)
                    .maybeSingle()
                  
                  if (product) {
                    productId = product.id
                  }
                }

                if (productId) {
                  const { error: lineError } = await supabase
                    .from('sales_order_lines')
                    .insert({
                      sales_order_id: newOrder.id,
                      product_id: productId,
                      quantity_ordered: lineItem.quantity,
                      unit_price: parseFloat(lineItem.price) || 0
                    })
                  
                  if (lineError) {
                    console.error(`[ORDER_SYNC] Failed to create line item for order #${order.order_number}:`, lineError)
                  } else {
                    logger.debug(` Created line item: ${lineItem.title} (qty: ${lineItem.quantity})`)
                  }
                } else {
                  // Log unmatched line item
                  console.warn(`[ORDER_SYNC] Could not match product for line item: ${lineItem.title} (SKU: ${lineItem.sku}, Variant: ${lineItem.variant_id})`)
                }
              }
            }

            createdCount++
            logger.debug(` Created order #${order.order_number} as ${newOrder?.id}`)
          }

          processedCount++

          // Update heartbeat periodically
          if (processedCount % 10 === 0) {
            await updateHeartbeat()
          }
        } catch (e: any) {
          console.error(`[ORDER_SYNC] Error processing order ${order.id}:`, e)
          errorCount++
          processedCount++
        }
      }

      // Update job progress
      if (jobId) {
        // Get current progress
        const { data: currentJob } = await supabase
          .from('integration_sync_jobs')
          .select('processed_items, matched_items, updated_items, error_count')
          .eq('id', jobId)
          .single()

        const currentProcessed = currentJob?.processed_items || 0
        const currentMatched = currentJob?.matched_items || 0
        const currentErrors = currentJob?.error_count || 0

        await supabase.from('integration_sync_jobs').update({
          processed_items: currentProcessed + processedCount,
          matched_items: currentMatched + matchedCount,
          updated_items: (currentJob?.updated_items || 0) + skippedCount,
          error_count: currentErrors + errorCount,
          updated_at: new Date().toISOString()
        }).eq('id', jobId)
      }

      // Determine if there are more pages
      if (!nextPageInfo) {
        // No more pages - mark job as complete
        if (jobId) {
          await supabase.from('integration_sync_jobs').update({
            status: 'completed',
            completed_at: new Date().toISOString()
          }).eq('id', jobId)
        }
        
        // Update queue status
        if (queueId) {
          await supabase.from('sync_queue').update({
            status: 'completed',
            completed_at: new Date().toISOString()
          }).eq('id', queueId)
        }

        await log(`Order sync completed. Created: ${createdCount}, Matched: ${matchedCount}, Errors: ${errorCount}`, "success")
        await logger.info(`Sync complete!`, { createdCount, matchedCount, errorCount, processedCount })
        
        return { 
          success: true, 
          message: `Processed ${processedCount} orders. Created: ${createdCount}, Skipped: ${skippedCount}`,
          jobId 
        }
      } else {
        logger.debug(` More pages available, returning nextPageInfo`)
        return { 
          success: true, 
          nextPageInfo, 
          jobId,
          message: `Processed ${processedCount} orders this page`
        }
      }

    } catch (error: any) {
      await logger.error(`Fatal sync error`, error, { jobId, queueId })
      
      // Update job status to failed
      if (jobId) {
        await supabase.from('integration_sync_jobs').update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        }).eq('id', jobId)
      }

      // Update queue status
      if (queueId) {
        await supabase.from('sync_queue').update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        }).eq('id', queueId)
      }

      return { success: false, error: error.message }
    }
  }

  // Run the sync
  const result = await runSync()

  // Always return 200 to ensure response body is accessible
  // Include error information in the response body instead
  const status = result.success ? 200 : 200 // Always 200 so client can read response body
  const responseBody = result.success 
    ? result 
    : { 
        success: false, 
        error: result.error || 'Unknown error',
        errorType: result.errorType || 'unknown'
      }

  return new Response(
    JSON.stringify(responseBody),
    { 
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
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
