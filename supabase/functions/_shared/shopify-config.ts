/**
 * Shopify configuration
 * 
 * Priority:
 * 1. Database (shopify_credentials table)
 * 2. Environment variables (SHOPIFY_SHOP_URL, SHOPIFY_ACCESS_TOKEN)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface ShopifyEnvConfig {
  shopUrl: string
  accessToken: string
}

/**
 * Get Shopify config from environment variables
 */
export function getShopifyConfigFromEnv(): ShopifyEnvConfig | null {
  const shopUrl = Deno.env.get('SHOPIFY_SHOP_URL')
  const accessToken = Deno.env.get('SHOPIFY_ACCESS_TOKEN')

  if (shopUrl && accessToken) {
    return { shopUrl, accessToken }
  }
  return null
}

/**
 * Get Shopify config from database (shopify_credentials table)
 */
export async function getShopifyConfigFromDb(): Promise<ShopifyEnvConfig | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  if (!supabaseUrl || !supabaseKey) {
    console.log('[ShopifyConfig] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return null
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  
  const { data, error } = await supabase
    .from('shopify_credentials')
    .select('shop_url, access_token')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[ShopifyConfig] Database error:', error)
    return null
  }

  if (!data) {
    console.log('[ShopifyConfig] No active Shopify credentials found in database')
    return null
  }

  console.log('[ShopifyConfig] Found credentials in database')

  return {
    shopUrl: data.shop_url,
    accessToken: data.access_token
  }
}

/**
 * Get Shopify config (tries database first, then env vars)
 */
export async function getShopifyConfig(): Promise<ShopifyEnvConfig> {
  // Try database first
  const dbConfig = await getShopifyConfigFromDb()
  if (dbConfig) {
    console.log('[ShopifyConfig] Using credentials from database')
    return dbConfig
  }

  // Fall back to environment variables
  const envConfig = getShopifyConfigFromEnv()
  if (envConfig) {
    console.log('[ShopifyConfig] Using credentials from environment variables')
    return envConfig
  }

  throw new Error('Shopify is not configured. Please add credentials in Settings or set environment variables (SHOPIFY_SHOP_URL, SHOPIFY_ACCESS_TOKEN).')
}

export function isShopifyConfigured(): boolean {
  const shopUrl = Deno.env.get('SHOPIFY_SHOP_URL')
  const accessToken = Deno.env.get('SHOPIFY_ACCESS_TOKEN')
  return Boolean(shopUrl && accessToken)
}
}
