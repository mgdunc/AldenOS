import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useReceivingStore = defineStore('receiving', () => {
  const loading = ref(false)
  
  // Placeholder for receiving state
  // const receipts = ref([])

  return {
    loading
  }
})
