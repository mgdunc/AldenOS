import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useInventoryStore } from './store'

describe('Inventory Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes with default state', () => {
    const store = useInventoryStore()
    expect(store.loading).toBe(false)
  })
})
