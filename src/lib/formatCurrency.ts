import { getCurrencyCode } from '@/config/app'

export function formatCurrency(val: number): string {
  if (!val) return '-'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: getCurrencyCode() }).format(val)
}
