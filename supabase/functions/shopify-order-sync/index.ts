import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ShopifyClient } from '../_shared/shopify.ts'

serve(async (req) => {
  try {
    const { integration_id } = await req.json()

    if (!integration_id) {
      return new Response(JSON.stringify({ error: 'integration_id is required' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Logging helper
    const log = async (message: string, level: 'info' | 'error' | 'success' | 'warning' = 'info') => {
      console.log(`[SYNC ORDER] ${message}`)
      await supabase.from('integration_logs').insert({
        integration_id,
        event_type: 'order_sync',
        message,
        level
      })
    }

    // 1. Get Integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integration_id)
      .eq('provider', 'shopify')
      .single()

    if (integrationError || !integration) {
      await log(`Integration not found: ${integrationError?.message}`, 'error')
      return new Response(JSON.stringify({ error: 'Integration not found' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    if (!integration.is_active) {
      await log('Integration is not active', 'warning')
      return new Response(JSON.stringify({ error: 'Integration is not active' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // 2. Create Sync Job
    const { data: job, error: jobError } = await supabase
      .from('integration_sync_jobs')
      .insert({
        integration_id,
        integration_type: 'shopify',
        job_type: 'order_sync',
        status: 'running'
      })
      .select()
      .single()

    if (jobError || !job) {
      await log(`Failed to create sync job: ${jobError?.message}`, 'error')
      return new Response(JSON.stringify({ error: 'Failed to create sync job' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const jobId = job.id
    await log(`Started order sync job ${jobId}`, 'info')

    try {
      // 3. Initialize Shopify Client
      const { shop_url, access_token } = integration.settings
      if (!shop_url || !access_token) {
        throw new Error('Missing Shop URL or Access Token')
      }

      const shopify = new ShopifyClient({
        shopUrl: shop_url,
        accessToken: access_token
      })

      // 4. Fetch Orders from Shopify
      let processedCount = 0
      let importedCount = 0
      let skippedCount = 0
      const errors: string[] = []

      await log('Fetching orders from Shopify...', 'info')

      // Get orders from last 30 days, status=any (open, closed, cancelled)
      for await (const orders of shopify.getOrders(50, 'any')) {
        await log(`Processing batch of ${orders.length} orders`, 'info')

        for (const order of orders) {
          processedCount++

          try {
            // Check if order already exists
            const { data: existingOrder } = await supabase
              .from('sales_orders')
              .select('id')
              .eq('shopify_order_id', order.id)
              .single()

            if (existingOrder) {
              skippedCount++
              await log(`Order #${order.order_number} already exists, skipping`, 'info')
              continue
            }

            // Parse addresses
            const shippingAddress = order.shipping_address ? {
              name: `${order.shipping_address.first_name || ''} ${order.shipping_address.last_name || ''}`.trim(),
              company: order.shipping_address.company,
              street: order.shipping_address.address1,
              street2: order.shipping_address.address2,
              city: order.shipping_address.city,
              state: order.shipping_address.province,
              zip: order.shipping_address.zip,
              country: order.shipping_address.country,
              phone: order.shipping_address.phone
            } : null

            const billingAddress = order.billing_address ? {
              name: `${order.billing_address.first_name || ''} ${order.billing_address.last_name || ''}`.trim(),
              company: order.billing_address.company,
              street: order.billing_address.address1,
              street2: order.billing_address.address2,
              city: order.billing_address.city,
              state: order.billing_address.province,
              zip: order.billing_address.zip,
              country: order.billing_address.country,
              phone: order.billing_address.phone
            } : null

            // Create Sales Order
            const { data: newOrder, error: orderError } = await supabase
              .from('sales_orders')
              .insert({
                shopify_order_id: order.id,
                order_number: `SHOP-${order.order_number}`,
                customer_name: order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : null,
                customer_email: order.email,
                customer_phone: order.customer?.phone,
                shipping_address: shippingAddress,
                billing_address: billingAddress,
                status: order.fulfillment_status === 'fulfilled' ? 'fulfilled' : 'confirmed',
                total_amount: parseFloat(order.total_price),
                notes: `Imported from Shopify. Financial Status: ${order.financial_status}`
              })
              .select()
              .single()

            if (orderError) {
              errors.push(`Order #${order.order_number}: ${orderError.message}`)
              await log(`Failed to create order #${order.order_number}: ${orderError.message}`, 'error')
              continue
            }

            // Create Line Items
            const lineItems = order.line_items.map((item: any) => {
              // Try to find matching product by SKU
              return {
                sales_order_id: newOrder.id,
                product_id: null, // Will need to match by SKU separately
                quantity: item.quantity,
                unit_price: parseFloat(item.price),
                total_price: parseFloat(item.price) * item.quantity,
                notes: item.sku ? `SKU: ${item.sku}` : null
              }
            })

            if (lineItems.length > 0) {
              const { error: linesError } = await supabase
                .from('sales_order_lines')
                .insert(lineItems)

              if (linesError) {
                errors.push(`Order #${order.order_number} lines: ${linesError.message}`)
                await log(`Failed to create lines for order #${order.order_number}: ${linesError.message}`, 'warning')
              }
            }

            importedCount++
            await log(`Imported order #${order.order_number}`, 'success')

          } catch (err: any) {
            errors.push(`Order #${order.order_number}: ${err.message}`)
            await log(`Error processing order #${order.order_number}: ${err.message}`, 'error')
          }
        }

        // Update job progress
        await supabase.from('integration_sync_jobs').update({
          processed_items: processedCount,
          matched_items: importedCount
        }).eq('id', jobId)
      }

      // Update final job status
      await supabase.from('integration_sync_jobs').update({
        status: 'completed',
        processed_items: processedCount,
        matched_items: importedCount,
        updated_items: skippedCount,
        completed_at: new Date().toISOString(),
        error_message: errors.length > 0 ? errors.join('; ') : null
      }).eq('id', jobId)

      await log(`Order sync completed: ${importedCount} imported, ${skippedCount} skipped, ${processedCount} total`, 'success')

      return new Response(JSON.stringify({
        success: true,
        processed: processedCount,
        imported: importedCount,
        skipped: skippedCount,
        errors: errors.length
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })

    } catch (syncError: any) {
      console.error('[SYNC ORDER] Fatal error:', syncError)
      
      await supabase.from('integration_sync_jobs').update({
        status: 'failed',
        error_message: syncError.message,
        completed_at: new Date().toISOString()
      }).eq('id', jobId)

      await log(`Sync failed: ${syncError.message}`, 'error')

      return new Response(JSON.stringify({
        error: syncError.message,
        stack: syncError.stack
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      })
    }

  } catch (error: any) {
    console.error('[SYNC ORDER] Request error:', error)
    return new Response(JSON.stringify({
      error: error.message,
      stack: error.stack
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
