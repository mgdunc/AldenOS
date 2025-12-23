// @ts-nocheck
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { 
  Fulfillment, 
  FulfillmentWithRelations, 
  FulfillmentStats,
  FulfillmentFilters 
} from './types'

export const useFulfillmentStore = defineStore('fulfillment', () => {
  const loading = ref(false)
  const fulfillments = ref<FulfillmentWithRelations[]>([])
  const currentFulfillment = ref<FulfillmentWithRelations | null>(null)

  // Computed Stats
  const stats = computed<FulfillmentStats>(() => {
    return {
      total_fulfillments: fulfillments.value.length,
      draft_count: fulfillments.value.filter(f => f.status === 'draft').length,
      picking_count: fulfillments.value.filter(f => f.status === 'picking').length,
      packed_count: fulfillments.value.filter(f => f.status === 'packed').length,
      shipped_count: fulfillments.value.filter(f => f.status === 'shipped').length,
      cancelled_count: fulfillments.value.filter(f => f.status === 'cancelled').length,
    }
  })

  // Filtered fulfillments
  const filteredFulfillments = computed(() => {
    return fulfillments.value
  })

  // Actions
  function setFulfillments(data: FulfillmentWithRelations[]) {
    fulfillments.value = data
  }

  function setCurrentFulfillment(data: FulfillmentWithRelations | null) {
    currentFulfillment.value = data
  }

  function addFulfillment(data: FulfillmentWithRelations) {
    fulfillments.value.unshift(data)
  }

  function updateFulfillment(id: string, updates: Partial<Fulfillment>) {
    const index = fulfillments.value.findIndex(f => f.id === id)
    if (index !== -1) {
      fulfillments.value[index] = { ...fulfillments.value[index], ...updates }
    }
    if (currentFulfillment.value?.id === id) {
      currentFulfillment.value = { ...currentFulfillment.value, ...updates }
    }
  }

  function removeFulfillment(id: string) {
    fulfillments.value = fulfillments.value.filter(f => f.id !== id)
  }

  function $reset() {
    loading.value = false
    fulfillments.value = []
    currentFulfillment.value = null
  }

  return {
    loading,
    fulfillments,
    currentFulfillment,
    stats,
    filteredFulfillments,
    setFulfillments,
    setCurrentFulfillment,
    addFulfillment,
    updateFulfillment,
    removeFulfillment,
    $reset
  }
})

