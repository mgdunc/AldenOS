import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFulfillmentStore } from './store'

describe('Fulfillment Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes with default state', () => {
    const store = useFulfillmentStore()
    expect(store.loading).toBe(false)
  })
})
