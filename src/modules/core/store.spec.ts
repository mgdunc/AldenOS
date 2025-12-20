import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCoreStore } from './store'

describe('Core Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('toggles sidebar visibility', () => {
    const store = useCoreStore()
    expect(store.sidebarVisible).toBe(true)
    
    store.toggleSidebar()
    expect(store.sidebarVisible).toBe(false)
    
    store.toggleSidebar()
    expect(store.sidebarVisible).toBe(true)
  })
})
