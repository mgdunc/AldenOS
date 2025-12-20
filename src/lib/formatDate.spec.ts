import { describe, it, expect } from 'vitest'
import { formatDate, formatDateTime } from './formatDate'

describe('formatDate', () => {
  it('formats date string correctly', () => {
    const date = '2023-12-25T12:00:00Z'
    const result = formatDate(date)
    expect(result).not.toBe('-')
    // Check for month/day/year parts generally
    expect(result).toMatch(/\d{1,2}|Dec|2023/)
  })

  it('returns - for empty input', () => {
    expect(formatDate('')).toBe('-')
  })
})

describe('formatDateTime', () => {
  it('formats date time string correctly', () => {
    const date = '2023-12-25T12:00:00Z'
    const result = formatDateTime(date)
    expect(result).not.toBe('-')
    expect(result).toContain(':') // Should have time
  })
})
