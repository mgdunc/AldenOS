import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePurchaseOrders } from '@/modules/purchasing/composables/usePurchaseOrders'
import { usePurchasingStore } from '@/modules/purchasing/store'
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

describe('usePurchaseOrders', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('loadPurchaseOrders', () => {
    it('should load purchase orders', async () => {
      const mockPOs = [
        { 
          id: '1', 
          po_number: 'PO-001', 
          supplier_id: '1',
          total: 500,
          status: 'draft'
        }
      ]

      const mockFrom = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockPOs, error: null })
      }

      vi.mocked(supabase.from).mockReturnValue(mockFrom as any)

      const { loadPurchaseOrders } = usePurchaseOrders()
      const result = await loadPurchaseOrders()

      expect(result).toHaveLength(1)
      expect(result[0]?.po_number).toBe('PO-001')
    })
  })
})

describe('usePurchasingStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should compute purchasing stats', () => {
    const store = usePurchasingStore()
    
    store.setPurchaseOrders([
      { id: '1', status: 'draft', total: 100 } as any,
      { id: '2', status: 'submitted', total: 200 } as any,
      { id: '3', status: 'received', total: 300 } as any
    ])

    expect(store.stats.total_pos).toBe(3)
    expect(store.stats.draft_pos).toBe(1)
    expect(store.stats.pending_pos).toBe(1)
    expect(store.stats.total_spending).toBe(600)
  })

  it('should filter by supplier', () => {
    const store = usePurchasingStore()
    
    store.setPurchaseOrders([
      { id: '1', supplier_id: 's1', po_number: 'PO-001' } as any,
      { id: '2', supplier_id: 's2', po_number: 'PO-002' } as any
    ])

    store.setFilters({ supplier_id: 's1' })

    expect(store.filteredPurchaseOrders).toHaveLength(1)
    expect(store.filteredPurchaseOrders[0]?.supplier_id).toBe('s1')
  })
})
