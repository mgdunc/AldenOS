// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from "../_shared/cors.ts"
import { getSupabaseEnv } from '../_shared/env.ts'
import { getShopifyConfig } from '../_shared/shopify-config.ts'

console.log("Shopify Test Connection Function Started")

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body (may be empty)
    let bodyShopUrl: string | undefined
    let bodyAccessToken: string | undefined
    
    try {
      const body = await req.json()
      bodyShopUrl = body.shop_url
      bodyAccessToken = body.access_token
    } catch {
      // Empty body is OK - we'll read from database
    }

    // Get config - either from request body or database/env
    let shop_url: string
    let access_token: string

    if (bodyShopUrl && bodyAccessToken) {
      // Use provided credentials (for testing before saving)
      shop_url = bodyShopUrl
      access_token = bodyAccessToken
    } else {
      // Read from database or environment
      const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getSupabaseEnv()
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      
      const config = await getShopifyConfig(supabase)
      shop_url = config.shopUrl
      access_token = config.accessToken
    }

    if (!shop_url || !access_token) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "No Shopify credentials configured. Please add them in Settings." 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      )
    }

    // Normalize shop URL
    const cleanUrl = shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '')
    
    // Test connection by fetching shop info
    const shopifyUrl = `https://${cleanUrl}/admin/api/2023-04/shop.json`
    
    const response = await fetch(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': access_token,
        'Content-Type': 'application/json',
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Shopify API Error: ${response.status} - ${errorText}`)
      
      let errorMessage = 'Connection failed'
      if (response.status === 401) {
        errorMessage = 'Invalid access token'
      } else if (response.status === 403) {
        errorMessage = 'Access token lacks required permissions'
      } else if (response.status === 404) {
        errorMessage = 'Store not found. Check your shop URL.'
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          details: errorText
        }),
        { 
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      )
    }

    const data = await response.json()

    return new Response(
      JSON.stringify({ 
        success: true, 
        shop: {
          name: data.shop?.name,
          email: data.shop?.email,
          domain: data.shop?.domain,
          myshopify_domain: data.shop?.myshopify_domain
        }
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    )

  } catch (error: any) {
    console.error('Test connection error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Unknown error occurred' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    )
  }
})
