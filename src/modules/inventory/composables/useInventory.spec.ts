import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useInventory } from '@/modules/inventory/composables/useInventory'
import { useInventoryStore } from '@/modules/inventory/store'
import { supabase } from '@/lib/supabase'
import { createPinia, setActivePinia } from 'pinia'

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

// Mock toast
vi.mock('primevue/usetoast', () => ({
  useToast: () => ({
    add: vi.fn()
  })
}))

describe('useInventory', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('loadProducts', () => {
    it('should load products successfully', async () => {
      const mockProducts = [
        { id: '1', sku: 'TEST-001', name: 'Test Product', available_stock: 10 }
      ]

      const mockFrom = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockProducts, error: null })
      }

      vi.mocked(supabase.from).mockReturnValue(mockFrom as any)

      const { loadProducts } = useInventory()
      const result = await loadProducts()

      expect(supabase.from).toHaveBeenCalledWith('products')
      expect(result).toHaveLength(1)
      expect(result[0]?.sku).toBe('TEST-001')
    })

    it('should handle errors gracefully', async () => {
      const mockFrom = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ 
          data: null, 
          error: { message: 'Database error' } 
        })
      }

      vi.mocked(supabase.from).mockReturnValue(mockFrom as any)

      const { loadProducts } = useInventory()
      const result = await loadProducts()

      expect(result).toEqual([])
    })

    it('should apply search filter', async () => {
      const mockFrom = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        or: vi.fn().mockResolvedValue({ data: [], error: null })
      }

      vi.mocked(supabase.from).mockReturnValue(mockFrom as any)

      const { loadProducts } = useInventory()
      await loadProducts({ search: 'test' })

      expect(mockFrom.or).toHaveBeenCalled()
    })
  })

  describe('createProduct', () => {
    it('should create a product', async () => {
      const newProduct = { sku: 'NEW-001', name: 'New Product' }
      const mockCreated = { id: '1', ...newProduct }

      const mockFrom = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockCreated, error: null })
      }

      vi.mocked(supabase.from).mockReturnValue(mockFrom as any)

      const { createProduct } = useInventory()
      const result = await createProduct(newProduct)

      expect(result).toEqual(mockCreated)
      expect(mockFrom.insert).toHaveBeenCalledWith(newProduct)
    })
  })

  describe('adjustStock', () => {
    it('should adjust stock via RPC', async () => {
      const adjustment = {
        product_id: '1',
        location_id: '1',
        quantity_change: 10,
        reason: 'adjustment'
      }

      const mockRpc = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(supabase).rpc = mockRpc

      const { adjustStock } = useInventory()
      const result = await adjustStock(adjustment)

      expect(result).toBe(true)
      expect(mockRpc).toHaveBeenCalledWith('adjust_inventory', expect.any(Object))
    })
  })
})

describe('useInventoryStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should initialize with empty state', () => {
    const store = useInventoryStore()

    expect(store.products).toEqual([])
    expect(store.currentProduct).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('should compute stats correctly', () => {
    const store = useInventoryStore()
    
    store.setProducts([
      { id: '1', sku: 'A', name: 'A', is_active: true, available_stock: 10, cost: 5 } as any,
      { id: '2', sku: 'B', name: 'B', is_active: true, available_stock: 0, cost: 10 } as any,
      { id: '3', sku: 'C', name: 'C', is_active: false, available_stock: 5, cost: 3 } as any
    ])

    expect(store.stats.total_products).toBe(3)
    expect(store.stats.active_products).toBe(2)
    expect(store.stats.out_of_stock_products).toBe(1)
    expect(store.stats.total_inventory_value).toBe(65) // (10*5) + (0*10) + (5*3)
  })

  it('should filter products by search', () => {
    const store = useInventoryStore()
    
    store.setProducts([
      { id: '1', sku: 'TEST-001', name: 'Test Product' } as any,
      { id: '2', sku: 'PROD-002', name: 'Another Product' } as any
    ])

    store.setFilters({ search: 'test' })

    expect(store.filteredProducts).toHaveLength(1)
    expect(store.filteredProducts[0]?.sku).toBe('TEST-001')
  })

  it('should add product', () => {
    const store = useInventoryStore()
    const newProduct = { id: '1', sku: 'NEW', name: 'New' } as any

    store.addProduct(newProduct)

    expect(store.products).toHaveLength(1)
    expect(store.products[0]).toEqual(newProduct)
  })

  it('should update product', () => {
    const store = useInventoryStore()
    store.setProducts([
      { id: '1', sku: 'OLD', name: 'Old Name' } as any
    ])

    store.updateProduct('1', { name: 'New Name' })

    expect(store.products[0]?.name).toBe('New Name')
  })

  it('should remove product', () => {
    const store = useInventoryStore()
    store.setProducts([
      { id: '1', sku: 'A', name: 'A' } as any,
      { id: '2', sku: 'B', name: 'B' } as any
    ])

    store.removeProduct('1')

    expect(store.products).toHaveLength(1)
    expect(store.products[0]?.id).toBe('2')
  })
})
