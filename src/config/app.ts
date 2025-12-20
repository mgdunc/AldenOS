export function getCurrencyCode(): string {
  return localStorage.getItem('app_currency') || 'GBP'
}
