import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSalesStore = defineStore('sales', () => {
  const loading = ref(false)
  
  // Placeholder for sales state
  // const orders = ref([])

  return {
    loading
  }
})
