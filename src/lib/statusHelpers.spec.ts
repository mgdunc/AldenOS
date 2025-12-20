import { describe, it, expect } from 'vitest'
import { getStatusSeverity } from './statusHelpers'

describe('getStatusSeverity', () => {
  it('returns success for positive statuses', () => {
    expect(getStatusSeverity('shipped')).toBe('success')
    expect(getStatusSeverity('completed')).toBe('success')
    expect(getStatusSeverity('active')).toBe('success')
  })

  it('returns danger for negative statuses', () => {
    expect(getStatusSeverity('cancelled')).toBe('danger')
    expect(getStatusSeverity('sale')).toBe('danger')
  })

  it('returns warn for attention statuses', () => {
    expect(getStatusSeverity('reserved')).toBe('warn')
    expect(getStatusSeverity('requires_items')).toBe('warn')
  })

  it('returns info for unknown', () => {
    expect(getStatusSeverity('unknown_status')).toBe('info')
    expect(getStatusSeverity(null)).toBe('info')
  })
})
