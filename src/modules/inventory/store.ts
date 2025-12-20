import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useInventoryStore = defineStore('inventory', () => {
  const loading = ref(false)
  
  // Placeholder for inventory state
  // const products = ref([])

  return {
    loading
  }
})
