import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useProductStock } from './useProductStock'
import { supabase } from '@/lib/supabase'

// Mock Supabase
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockOrder = vi.fn()
const mockIn = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect
    }))
  }
}))

describe('useProductStock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default chain setup
    mockSelect.mockReturnValue({
      eq: mockEq
    })
    mockEq.mockReturnValue({
      single: mockSingle,
      eq: mockEq, // Allow chaining .eq().eq()
      order: mockOrder,
      in: mockIn
    })
    mockOrder.mockReturnValue({
        data: [], error: null
    })
    mockIn.mockReturnValue({
        data: [], error: null
    })
  })

  it('initializes with default values', () => {
    const { qoh, available, reserved } = useProductStock()
    expect(qoh.value).toBe(0)
    expect(available.value).toBe(0)
    expect(reserved.value).toBe(0)
  })

  it('fetches stock data and updates refs', async () => {
    const { fetchStockData, qoh, available, reserved } = useProductStock()

    // Mock the View Response
    mockSingle.mockResolvedValueOnce({
      data: {
        id: '123',
        qoh: 100,
        reserved: 20,
        available: 80,
        on_order: 50,
        backlog: 0,
        net_required: 0
      },
      error: null
    })

    await fetchStockData('123')

    expect(qoh.value).toBe(100)
    expect(reserved.value).toBe(20)
    expect(available.value).toBe(80)
  })

  it('computes reservedLines correctly', () => {
    const { allOrderLines, reservedLines } = useProductStock()

    allOrderLines.value = [
      { id: 1, sales_orders: { status: 'reserved' } },
      { id: 2, sales_orders: { status: 'picking' } },
      { id: 3, sales_orders: { status: 'draft' } } // Should be excluded
    ]

    expect(reservedLines.value).toHaveLength(2)
    expect(reservedLines.value.map(l => l.id)).toEqual([1, 2])
  })

  it('computes backlogLines correctly', () => {
    const { allOrderLines, backlogLines } = useProductStock()

    allOrderLines.value = [
      { id: 1, sales_orders: { status: 'awaiting_stock' } },
      { id: 2, sales_orders: { status: 'requires_items' } },
      { id: 3, sales_orders: { status: 'shipped' } } // Should be excluded
    ]

    expect(backlogLines.value).toHaveLength(2)
    expect(backlogLines.value.map(l => l.id)).toEqual([1, 2])
  })
})
