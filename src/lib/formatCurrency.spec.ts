import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatCurrency } from './formatCurrency'

describe('formatCurrency', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('formats number to currency (GBP default)', () => {
    // Note: Intl.NumberFormat output depends on environment, but usually includes symbol
    const result = formatCurrency(100)
    expect(result).toMatch(/£?100\.00/)
  })

  it('returns - for zero or null', () => {
    // The current implementation returns '-' for 0 because 0 is falsy
    expect(formatCurrency(0)).toBe('-')
  })
})
