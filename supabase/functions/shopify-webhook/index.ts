import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"
import { getSupabaseEnv } from "../_shared/env.ts"

console.log("Shopify Webhook Function Started")

serve(async (req) => {
  try {
    // 1. Validate and get environment variables
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getSupabaseEnv()
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 2. Get Headers
    const topic = req.headers.get('X-Shopify-Topic')
    const hmac = req.headers.get('X-Shopify-Hmac-Sha256')
    const shopDomain = req.headers.get('X-Shopify-Shop-Domain')

    if (!topic || !hmac) {
      return new Response("Missing Shopify Headers", { status: 400 })
    }

    // 3. Get Integration Settings
    // We need to find the integration that matches the shop domain
    const { data: integrations, error: dbError } = await supabase
      .from('integrations')
      .select('id, settings')
      .eq('provider', 'shopify')

    if (dbError || !integrations || integrations.length === 0) {
      console.error("No Shopify integrations found", dbError)
      return new Response("Integration not configured", { status: 500 })
    }

    // Find the matching integration
    const integration = integrations.find((i: any) => {
        const storedUrl = i.settings?.shop_url || ''
        // Normalize stored URL to compare with shopDomain
        const normalizedStored = storedUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
        return normalizedStored === shopDomain
    })

    if (!integration || !integration.settings) {
      console.error(`Integration not found for domain: ${shopDomain}`)
      return new Response("Integration not found", { status: 404 })
    }

    const settings = integration.settings as { webhook_secret?: string }
    const secret = settings.webhook_secret

    if (!secret) {
      console.error("Webhook secret not configured")
      return new Response("Webhook secret missing", { status: 500 })
    }

    // 4. Verify HMAC
    const body = await req.text()
    const verified = await verifyShopifyWebhook(body, hmac, secret)

    if (!verified) {
      console.error("HMAC verification failed")
      return new Response("Unauthorized", { status: 401 })
    }

    const payload = JSON.parse(body)

    // 5. Handle 'orders/create'
    if (topic === 'orders/create') {
      await handleOrderCreate(supabase, payload)
    }

    return new Response("OK", { status: 200 })

  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

// --- Helpers ---

async function verifyShopifyWebhook(body: string, hmac: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  )
  
  const bodyData = encoder.encode(body)
  // Shopify sends base64 encoded HMAC
  // We need to convert the hex output of our hash to base64 to compare, OR decode their base64 to bytes
  // Easier: Compute HMAC of body, convert to Base64, compare strings.
  
  const signature = await crypto.subtle.sign("HMAC", key, bodyData)
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
  
  return signatureBase64 === hmac
}

async function handleOrderCreate(supabase: any, order: any) {
  console.log(`Processing Order: ${order.name} (${order.id})`)

  // Check if order already exists (Idempotency)
  const { data: existing } = await supabase
    .from('sales_orders')
    .select('id')
    .eq('shopify_order_id', order.id)
    .single()

  if (existing) {
    console.log("Order already exists, skipping.")
    return
  }

  // 1. Create Sales Order
  // Map Status: Shopify (open, closed, cancelled) -> AldenOS (draft, confirmed, etc)
  // If financial_status is 'paid', we might set to 'confirmed'.
  let status = 'draft'
  if (order.financial_status === 'paid') {
    status = 'confirmed'
  }

  const { data: newOrder, error: orderError } = await supabase
    .from('sales_orders')
    .insert({
      order_number: order.name, // e.g. #1001
      customer_name: order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'Guest',
      status: status,
      total_amount: order.total_price,
      shopify_order_id: order.id,
      // billing_address: order.billing_address, // TODO: Map to our JSONB structure if needed
      // shipping_address: order.shipping_address
    })
    .select()
    .single()

  if (orderError) {
    throw new Error(`Failed to create order: ${orderError.message}`)
  }

  console.log(`Created Sales Order: ${newOrder.id}`)

  // 2. Process Line Items
  const lines = order.line_items
  for (const line of lines) {
    // Find Product by SKU
    if (!line.sku) {
      console.warn(`Line item ${line.title} has no SKU, skipping.`)
      continue
    }

    const { data: product } = await supabase
      .from('products')
      .select('id')
      .eq('sku', line.sku)
      .single()

    if (!product) {
      console.warn(`Product with SKU ${line.sku} not found in AldenOS.`)
      // Optionally create a placeholder product or log an error
      continue
    }

    // Insert Line
    const { error: lineError } = await supabase
      .from('sales_order_lines')
      .insert({
        sales_order_id: newOrder.id,
        product_id: product.id,
        quantity_ordered: line.quantity,
        unit_price: line.price,
        // quantity_fulfilled: 0
      })

    if (lineError) {
      console.error(`Failed to create line for ${line.sku}: ${lineError.message}`)
    } else {
      // 3. Create Stock Commitment (Ledger)
      // Only if order is confirmed/paid? Or even if draft?
      // Usually we commit stock when the order is placed (created).
      
      await supabase
        .from('stock_commitments')
        .insert({
          sales_order_id: newOrder.id,
          product_id: product.id,
          quantity: line.quantity,
          status: 'active'
        })
    }
  }
}
