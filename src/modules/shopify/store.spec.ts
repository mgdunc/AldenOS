import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useShopifyStore } from './store'
import type { ShopifyIntegration } from './types'

describe('Shopify Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes with default state', () => {
    const store = useShopifyStore()
    expect(store.integrations).toEqual([])
    expect(store.selectedIntegration).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('computes active integrations correctly', () => {
    const store = useShopifyStore()
    
    const mockIntegrations: ShopifyIntegration[] = [
      {
        id: '1',
        provider: 'shopify',
        name: 'Store 1',
        settings: { shop_url: 'store1.myshopify.com', access_token: 'token1' },
        is_active: true,
        created_at: '2025-01-01',
        updated_at: '2025-01-01'
      },
      {
        id: '2',
        provider: 'shopify',
        name: 'Store 2',
        settings: { shop_url: 'store2.myshopify.com', access_token: 'token2' },
        is_active: false,
        created_at: '2025-01-01',
        updated_at: '2025-01-01'
      }
    ]

    store.setIntegrations(mockIntegrations)
    
    expect(store.activeIntegrations).toHaveLength(1)
    expect(store.activeIntegrations[0]!.id).toBe('1')
    expect(store.hasActiveIntegrations).toBe(true)
  })

  it('adds an integration', () => {
    const store = useShopifyStore()
    
    const newIntegration: ShopifyIntegration = {
      id: '1',
      provider: 'shopify',
      name: 'Test Store',
      settings: { shop_url: 'test.myshopify.com', access_token: 'test_token' },
      is_active: true,
      created_at: '2025-01-01',
      updated_at: '2025-01-01'
    }

    store.addIntegration(newIntegration)
    
    expect(store.integrations).toHaveLength(1)
    expect(store.integrations[0]!.id).toBe('1')
  })

  it('updates an integration', () => {
    const store = useShopifyStore()
    
    const integration: ShopifyIntegration = {
      id: '1',
      provider: 'shopify',
      name: 'Test Store',
      settings: { shop_url: 'test.myshopify.com', access_token: 'test_token' },
      is_active: true,
      created_at: '2025-01-01',
      updated_at: '2025-01-01'
    }

    store.addIntegration(integration)
    store.updateIntegration('1', { name: 'Updated Store' })
    
    expect(store.integrations[0]!.name).toBe('Updated Store')
  })

  it('removes an integration', () => {
    const store = useShopifyStore()
    
    const integration: ShopifyIntegration = {
      id: '1',
      provider: 'shopify',
      name: 'Test Store',
      settings: { shop_url: 'test.myshopify.com', access_token: 'test_token' },
      is_active: true,
      created_at: '2025-01-01',
      updated_at: '2025-01-01'
    }

    store.addIntegration(integration)
    store.setSelectedIntegration(integration)
    store.removeIntegration('1')
    
    expect(store.integrations).toHaveLength(0)
    expect(store.selectedIntegration).toBeNull()
  })

  it('finds integration by ID', () => {
    const store = useShopifyStore()
    
    const integration: ShopifyIntegration = {
      id: '1',
      provider: 'shopify',
      name: 'Test Store',
      settings: { shop_url: 'test.myshopify.com', access_token: 'test_token' },
      is_active: true,
      created_at: '2025-01-01',
      updated_at: '2025-01-01'
    }

    store.addIntegration(integration)
    
    const found = store.findIntegrationById('1')
    expect(found).toEqual(integration)
    
    const notFound = store.findIntegrationById('999')
    expect(notFound).toBeUndefined()
  })
})
