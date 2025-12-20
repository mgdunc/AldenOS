import { defineStore } from 'pinia'
import { ref } from 'vue'

export const usePurchasingStore = defineStore('purchasing', () => {
  const loading = ref(false)
  
  // Placeholder for purchasing state
  // const purchaseOrders = ref([])

  return {
    loading
  }
})
