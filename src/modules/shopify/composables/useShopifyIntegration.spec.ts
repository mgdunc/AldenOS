import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useShopifyIntegration } from './useShopifyIntegration'

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            then: vi.fn()
          })),
          single: vi.fn(() => ({ data: null, error: null }))
        }))
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => ({ data: null, error: null }))
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => ({ data: null, error: null }))
          }))
        }))
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({ error: null }))
      }))
    })),
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: null, error: null }))
    }
  }
}))

// Mock Pinia store
vi.mock('../store', () => ({
  useShopifyStore: vi.fn(() => ({
    setIntegrations: vi.fn(),
    setSelectedIntegration: vi.fn(),
    addIntegration: vi.fn(),
    updateIntegration: vi.fn(),
    removeIntegration: vi.fn(),
    selectedIntegration: null,
    loading: false
  }))
}))

// Mock toast
vi.mock('primevue/usetoast', () => ({
  useToast: vi.fn(() => ({
    add: vi.fn()
  }))
}))

describe('useShopifyIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates shop URL correctly', () => {
    const { validateShopUrl } = useShopifyIntegration()

    expect(validateShopUrl('test.myshopify.com')).toBe(true)
    expect(validateShopUrl('https://test.myshopify.com')).toBe(true)
    expect(validateShopUrl('test.myshopify.com/')).toBe(true)
    
    expect(validateShopUrl('')).toBe(false)
    expect(validateShopUrl('test.com')).toBe(false)
    expect(validateShopUrl('myshopify.com')).toBe(false)
    expect(validateShopUrl('test')).toBe(false)
  })

  it('initializes with correct loading state', () => {
    const { loading, saving } = useShopifyIntegration()

    expect(loading.value).toBe(false)
    expect(saving.value).toBe(false)
  })
})
