// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { getSupabaseEnv } from "../_shared/env.ts"
import { createLogger } from "../_shared/logger.ts"

const logger = createLogger('sync-queue-processor')
logger.debug("Sync Queue Processor Started")

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Validate and setup Supabase Client
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getSupabaseEnv()
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    // 1. Fetch pending queue items (priority order)
    const { data: queueItems, error: fetchError } = await supabase
      .from('sync_queue')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(5)

    if (fetchError) throw fetchError

    if (!queueItems || queueItems.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending syncs in queue' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    await logger.debug(`Found ${queueItems.length} pending sync(s)`)

    // 2. Process each queue item
    const results = []
    
    for (const item of queueItems) {
      await logger.debug(`Processing ${item.sync_type} for integration ${item.integration_id}`)
      
      // Mark as processing
      await supabase
        .from('sync_queue')
        .update({ 
          status: 'processing', 
          started_at: new Date().toISOString() 
        })
        .eq('id', item.id)

      // Determine which function to call
      let functionName = ''
      switch (item.sync_type) {
        case 'product_sync':
          functionName = 'shopify-product-sync'
          break
        case 'order_sync':
          functionName = 'shopify-order-sync'
          break
        default:
          await logger.error(`Unknown sync type: ${item.sync_type}`)
          await supabase
            .from('sync_queue')
            .update({ 
              status: 'failed', 
              error_message: `Unknown sync type: ${item.sync_type}`,
              completed_at: new Date().toISOString() 
            })
            .eq('id', item.id)
          continue
      }

      try {
        // Invoke the sync function
        const { data, error } = await supabase.functions.invoke(functionName, {
          body: { 
            integrationId: item.integration_id,
            queueId: item.id,
            metadata: item.metadata
          }
        })

        if (error) throw error

        // The sync function will handle updating the queue status when complete
        results.push({
          queue_id: item.id,
          sync_type: item.sync_type,
          status: 'initiated',
          message: data?.message || 'Sync started'
        })

      } catch (error: any) {
        await logger.error(`Error processing ${item.sync_type}`, error)
        
        // Check if we should retry
        const shouldRetry = item.retry_count < item.max_retries
        
        if (shouldRetry) {
          await supabase
            .from('sync_queue')
            .update({ 
              status: 'pending',
              retry_count: item.retry_count + 1,
              error_message: error.message
            })
            .eq('id', item.id)
          
          results.push({
            queue_id: item.id,
            sync_type: item.sync_type,
            status: 'retry_scheduled',
            retry_count: item.retry_count + 1
          })
        } else {
          await supabase
            .from('sync_queue')
            .update({ 
              status: 'failed',
              error_message: error.message,
              completed_at: new Date().toISOString()
            })
            .eq('id', item.id)
          
          results.push({
            queue_id: item.id,
            sync_type: item.sync_type,
            status: 'failed',
            error: error.message
          })
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        processed: results.length,
        results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error: any) {
    // This catch block ensures CORS headers are returned even on fatal errors
    await logger.error('Processor error', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Internal server error',
        errorType: 'fatal'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    )
  }
})
