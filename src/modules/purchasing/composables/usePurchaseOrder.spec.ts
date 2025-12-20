import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePurchaseOrder } from './usePurchaseOrder'
import { supabase } from '@/lib/supabase'

// Mock Vue Router
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush })
}))

// Mock PrimeVue Toast
const mockAdd = vi.fn()
vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: mockAdd })
}))

// Mock Supabase
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockOrder = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect
    }))
  }
}))

describe('usePurchaseOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default chain setup
    mockSelect.mockReturnValue({
      eq: mockEq,
      order: mockOrder
    })
    mockEq.mockReturnValue({
      single: mockSingle,
      order: mockOrder,
      eq: mockEq
    })
    mockOrder.mockReturnValue({
        data: [], error: null
    })
  })

  it('initializes with default values', () => {
    const { isDraft, totalAmount } = usePurchaseOrder('123')
    expect(isDraft.value).toBe(false)
    expect(totalAmount.value).toBe(0)
  })

  it('fetches data successfully', async () => {
    const { fetchData, isDraft } = usePurchaseOrder('123')

    // Mock Header Response
    mockSingle.mockResolvedValueOnce({
      data: { id: '123', status: 'draft' },
      error: null
    })

    await fetchData()
    
    expect(isDraft.value).toBe(true)
  })
  
  it('redirects on error', async () => {
      const { fetchData } = usePurchaseOrder('123')
      
      mockSingle.mockResolvedValueOnce({
          data: null,
          error: { message: 'Not found' }
      })
      
      await fetchData()
      
      expect(mockPush).toHaveBeenCalledWith('/purchases')
      expect(mockAdd).toHaveBeenCalled()
  })
})
