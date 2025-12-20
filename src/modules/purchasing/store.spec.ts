import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePurchasingStore } from './store'

describe('Purchasing Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes with default state', () => {
    const store = usePurchasingStore()
    expect(store.loading).toBe(false)
  })
})
