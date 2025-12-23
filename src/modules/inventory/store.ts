// @ts-nocheck
import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'
import { useRealtime } from '@/composables/useRealtime'
import type { ProductWithStock, Location, ProductFilters, InventoryStats } from './types'

export const useInventoryStore = defineStore('inventory', () => {
  const loading = ref(false)
  const products = ref<ProductWithStock[]>([])
  const currentProduct = ref<ProductWithStock | null>(null)
  const locations = ref<Location[]>([])
  const filters = ref<ProductFilters>({})
  
  // Realtime
  const { subscribe, unsubscribe, connected: realtimeConnected } = useRealtime()
  const realtimeEnabled = ref(false)

  // Computed stats
  const stats = computed<InventoryStats>(() => {
    return {
      total_products: products.value.length,
      active_products: products.value.filter(p => p.is_active).length,
      low_stock_count: products.value.filter(p => 
        p.available_stock > 0 && p.available_stock <= (p.reorder_point || 0)
      ).length,
      out_of_stock_count: products.value.filter(p => p.available_stock === 0).length,
      total_value: products.value.reduce((sum, p) => 
        sum + (p.available_stock * (p.cost || 0)), 0
      )
    }
  })

  // Filtered products based on current filters
  const filteredProducts = computed(() => {
    let result = products.value

    if (filters.value.search) {
      const search = filters.value.search.toLowerCase()
      result = result.filter(p =>
        p.sku?.toLowerCase().includes(search) ||
        p.name.toLowerCase().includes(search) ||
        p.barcode?.toLowerCase().includes(search)
      )
    }

    if (filters.value.category) {
      result = result.filter(p => p.category === filters.value.category)
    }

    if (filters.value.supplier_id) {
      result = result.filter(p => p.supplier_id === filters.value.supplier_id)
    }

    if (filters.value.is_active !== undefined) {
      result = result.filter(p => p.is_active === filters.value.is_active)
    }

    return result
  })

  // Actions
  const setProducts = (newProducts: ProductWithStock[]) => {
    products.value = newProducts
  }

  const setCurrentProduct = (product: ProductWithStock | null) => {
    currentProduct.value = product
  }

  const addProduct = (product: ProductWithStock) => {
    products.value.unshift(product)
  }

  const updateProduct = (id: string, updates: Partial<ProductWithStock>) => {
    const index = products.value.findIndex(p => p.id === id)
    if (index !== -1) {
      products.value[index] = { ...products.value[index], ...updates }
    }
    if (currentProduct.value?.id === id) {
      currentProduct.value = { ...currentProduct.value, ...updates }
    }
  }

  const removeProduct = (id: string) => {
    products.value = products.value.filter(p => p.id !== id)
    if (currentProduct.value?.id === id) {
      currentProduct.value = null
    }
  }

  const setLocations = (newLocations: Location[]) => {
    locations.value = newLocations
  }

  const setFilters = (newFilters: ProductFilters) => {
    filters.value = newFilters
  }

  const clearFilters = () => {
    filters.value = {}
  }

  // Realtime Subscription
  const enableRealtime = () => {
    if (realtimeEnabled.value) return

    subscribe('inventory-products', {
      table: 'products',
      event: '*',
      callback: (payload) => {
        if (payload.eventType === 'INSERT') {
          const newProduct = payload.new as ProductWithStock
          products.value.unshift(newProduct)
        } else if (payload.eventType === 'UPDATE') {
          updateProduct(payload.new.id, payload.new)
        } else if (payload.eventType === 'DELETE') {
          removeProduct(payload.old.id)
        }
      }
    })

    realtimeEnabled.value = true
  }

  const disableRealtime = () => {
    if (!realtimeEnabled.value) return
    unsubscribe()
    realtimeEnabled.value = false
  }

  // Cleanup on store unmount
  onUnmounted(() => {
    disableRealtime()
  })

  return {
    loading,
    products,
    currentProduct,
    locations,
    filters,
    stats,
    filteredProducts,
    realtimeConnected,
    realtimeEnabled,
    setProducts,
    setCurrentProduct,
    addProduct,
    updateProduct,
    removeProduct,
    setLocations,
    setFilters,
    clearFilters,
    enableRealtime,
    disableRealtime
  }
})
