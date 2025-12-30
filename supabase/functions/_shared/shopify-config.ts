/**
 * Shopify configuration
 * 
 * Priority:
 * 1. Environment variables (SHOPIFY_SHOP_URL, SHOPIFY_ACCESS_TOKEN)
 * 2. Database (integrations table)
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
 * Get Shopify config from database (integrations table)
 */
export async function getShopifyConfigFromDb(): Promise<ShopifyEnvConfig | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  if (!supabaseUrl || !supabaseKey) {
    return null
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  
  const { data, error } = await supabase
    .from('integrations')
    .select('settings')
    .eq('provider', 'shopify')
    .eq('enabled', true)
    .limit(1)
    .maybeSingle()

  if (error || !data?.settings?.shop_url || !data?.settings?.access_token) {
    return null
  }

  return {
    shopUrl: data.settings.shop_url,
    accessToken: data.settings.access_token
  }
}

/**
 * Get Shopify config (tries env vars first, then database)
 */
export async function getShopifyConfig(): Promise<ShopifyEnvConfig> {
  // Try environment variables first
  const envConfig = getShopifyConfigFromEnv()
  if (envConfig) {
    console.log('[ShopifyConfig] Using credentials from environment variables')
    return envConfig
  }

  // Fall back to database
  const dbConfig = await getShopifyConfigFromDb()
  if (dbConfig) {
    console.log('[ShopifyConfig] Using credentials from database')
    return dbConfig
  }

  throw new Error('Shopify is not configured. Please set SHOPIFY_SHOP_URL and SHOPIFY_ACCESS_TOKEN environment variables, or configure in Settings → Shopify.')
}

export function isShopifyConfigured(): boolean {
  const shopUrl = Deno.env.get('SHOPIFY_SHOP_URL')
  const accessToken = Deno.env.get('SHOPIFY_ACCESS_TOKEN')
  return Boolean(shopUrl && accessToken)
}
