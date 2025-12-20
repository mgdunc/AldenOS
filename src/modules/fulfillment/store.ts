import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useFulfillmentStore = defineStore('fulfillment', () => {
  const loading = ref(false)
  
  // Placeholder for fulfillment state
  // const fulfillments = ref([])

  return {
    loading
  }
})
