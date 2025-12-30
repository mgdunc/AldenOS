/**
 * Single-store Shopify configuration
 * Credentials are stored in environment variables for simplicity
 */

export interface ShopifyEnvConfig {
  shopUrl: string
  accessToken: string
}

export function getShopifyConfig(): ShopifyEnvConfig {
  const shopUrl = Deno.env.get('SHOPIFY_SHOP_URL')
  const accessToken = Deno.env.get('SHOPIFY_ACCESS_TOKEN')

  if (!shopUrl) {
    throw new Error('SHOPIFY_SHOP_URL environment variable is not set')
  }

  if (!accessToken) {
    throw new Error('SHOPIFY_ACCESS_TOKEN environment variable is not set')
  }

  return { shopUrl, accessToken }
}

export function isShopifyConfigured(): boolean {
  const shopUrl = Deno.env.get('SHOPIFY_SHOP_URL')
  const accessToken = Deno.env.get('SHOPIFY_ACCESS_TOKEN')
  return Boolean(shopUrl && accessToken)
}

