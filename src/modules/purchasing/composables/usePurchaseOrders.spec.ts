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
      expect(result[0].po_number).toBe('PO-001')
    })
  })

  describe('submitPurchaseOrder', () => {
    it('should submit PO via RPC', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(supabase).rpc = mockRpc

      const { submitPurchaseOrder } = usePurchaseOrders()
      const result = await submitPurchaseOrder('po-123')

      expect(result).toBe(true)
      expect(mockRpc).toHaveBeenCalledWith('submit_purchase_order', {
        p_po_id: 'po-123'
      })
    })
  })

  describe('receiveItems', () => {
    it('should create receipt record', async () => {
      const receipt = {
        po_id: '1',
        received_by: 'user-1',
        items: [
          { product_id: 'p1', quantity_received: 10 }
        ]
      }

      const mockFrom = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: receipt, error: null })
      }

      vi.mocked(supabase.from).mockReturnValue(mockFrom as any)

      const { receiveItems } = usePurchaseOrders()
      const result = await receiveItems(receipt)

      expect(result).toBeTruthy()
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
    expect(store.stats.draft_count).toBe(1)
    expect(store.stats.submitted_count).toBe(1)
    expect(store.stats.total_value).toBe(600)
  })

  it('should filter by supplier', () => {
    const store = usePurchasingStore()
    
    store.setPurchaseOrders([
      { id: '1', supplier_id: 's1', po_number: 'PO-001' } as any,
      { id: '2', supplier_id: 's2', po_number: 'PO-002' } as any
    ])

    store.setFilters({ supplier_id: 's1' })

    expect(store.filteredPurchaseOrders).toHaveLength(1)
    expect(store.filteredPurchaseOrders[0].supplier_id).toBe('s1')
  })
})
