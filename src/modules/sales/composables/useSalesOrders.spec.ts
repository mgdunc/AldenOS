import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSalesOrders } from '@/modules/sales/composables/useSalesOrders'
import { useSalesStore } from '@/modules/sales/store'
import { supabase } from '@/lib/supabase'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}))

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({
    add: vi.fn()
  })
}))

describe('useSalesOrders', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('loadOrders', () => {
    it('should load sales orders', async () => {
      const mockOrders = [
        { 
          id: '1', 
          order_number: 'SO-001', 
          customer_id: '1',
          total: 100,
          status: 'draft'
        }
      ]

      const mockFrom = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockOrders, error: null })
      }

      vi.mocked(supabase.from).mockReturnValue(mockFrom as any)

      const { loadOrders } = useSalesOrders()
      const result = await loadOrders()

      expect(result).toHaveLength(1)
      expect(result[0].order_number).toBe('SO-001')
    })

    it('should filter by status', async () => {
      const mockFrom = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null })
      }

      vi.mocked(supabase.from).mockReturnValue(mockFrom as any)

      const { loadOrders } = useSalesOrders()
      await loadOrders({ status: 'confirmed' })

      expect(mockFrom.eq).toHaveBeenCalledWith('status', 'confirmed')
    })
  })

  describe('confirmOrder', () => {
    it('should confirm order via RPC', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(supabase).rpc = mockRpc

      const { confirmOrder } = useSalesOrders()
      const result = await confirmOrder('order-123')

      expect(result).toBe(true)
      expect(mockRpc).toHaveBeenCalledWith('confirm_sales_order', {
        p_order_id: 'order-123'
      })
    })

    it('should handle confirmation errors', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ 
        error: { message: 'Insufficient inventory' } 
      })
      vi.mocked(supabase).rpc = mockRpc

      const { confirmOrder } = useSalesOrders()
      const result = await confirmOrder('order-123')

      expect(result).toBe(false)
    })
  })

  describe('createFulfillment', () => {
    it('should create fulfillment record', async () => {
      const fulfillment = {
        order_id: '1',
        tracking_number: 'TRACK123',
        shipped_date: new Date().toISOString()
      }

      const mockFrom = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: fulfillment, error: null })
      }

      vi.mocked(supabase.from).mockReturnValue(mockFrom as any)

      const { createFulfillment } = useSalesOrders()
      const result = await createFulfillment(fulfillment)

      expect(result).toEqual(fulfillment)
    })
  })
})

describe('useSalesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should compute sales stats', () => {
    const store = useSalesStore()
    
    store.setOrders([
      { id: '1', status: 'draft', total: 100 } as any,
      { id: '2', status: 'confirmed', total: 200 } as any,
      { id: '3', status: 'fulfilled', total: 300 } as any,
      { id: '4', status: 'cancelled', total: 50 } as any
    ])

    expect(store.stats.total_orders).toBe(4)
    expect(store.stats.draft_count).toBe(1)
    expect(store.stats.confirmed_count).toBe(1)
    expect(store.stats.fulfilled_count).toBe(1)
    expect(store.stats.total_revenue).toBe(600) // excludes cancelled
  })

  it('should get order by ID', () => {
    const store = useSalesStore()
    const order = { id: '1', order_number: 'SO-001' } as any
    
    store.setOrders([order])
    
    expect(store.getOrderById('1')).toEqual(order)
    expect(store.getOrderById('999')).toBeUndefined()
  })
})
