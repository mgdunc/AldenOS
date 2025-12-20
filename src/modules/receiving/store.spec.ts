import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useReceivingStore } from './store'

describe('Receiving Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes with default state', () => {
    const store = useReceivingStore()
    expect(store.loading).toBe(false)
  })
})
