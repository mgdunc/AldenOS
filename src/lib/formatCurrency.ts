import { getCurrencyCode } from '@/config/app'
import { logger } from './logger'

export function formatCurrency(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '-'
  
  const num = typeof val === 'string' ? parseFloat(val) : val
  
  if (isNaN(num)) return '-'
  
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: getCurrencyCode() }).format(num)
  } catch (e) {
    logger.error('Error formatting currency', e as Error)
    return '-'
  }
}
