import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ShopifyIntegration } from './types'

export const useShopifyStore = defineStore('shopify', () => {
  const integrations = ref<ShopifyIntegration[]>([])
  const selectedIntegration = ref<ShopifyIntegration | null>(null)
  const loading = ref(false)

  const activeIntegrations = computed(() => 
    integrations.value.filter(i => i.is_active)
  )

  const hasActiveIntegrations = computed(() => 
    activeIntegrations.value.length > 0
  )

  const setIntegrations = (newIntegrations: ShopifyIntegration[]) => {
    integrations.value = newIntegrations
  }

  const setSelectedIntegration = (integration: ShopifyIntegration | null) => {
    selectedIntegration.value = integration
  }

  const addIntegration = (integration: ShopifyIntegration) => {
    integrations.value.push(integration)
  }

  const updateIntegration = (id: string, updates: Partial<ShopifyIntegration>) => {
    const index = integrations.value.findIndex(i => i.id === id)
    if (index !== -1) {
      integrations.value[index] = { ...integrations.value[index], ...updates } as ShopifyIntegration
      if (selectedIntegration.value?.id === id) {
        selectedIntegration.value = integrations.value[index]
      }
    }
  }

  const removeIntegration = (id: string) => {
    integrations.value = integrations.value.filter(i => i.id !== id)
    if (selectedIntegration.value?.id === id) {
      selectedIntegration.value = integrations.value[0] || null
    }
  }

  const findIntegrationById = (id: string) => {
    return integrations.value.find(i => i.id === id)
  }

  return {
    integrations,
    selectedIntegration,
    loading,
    activeIntegrations,
    hasActiveIntegrations,
    setIntegrations,
    setSelectedIntegration,
    addIntegration,
    updateIntegration,
    removeIntegration,
    findIntegrationById
  }
})
