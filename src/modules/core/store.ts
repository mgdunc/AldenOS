import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useCoreStore = defineStore('core', () => {
  const loading = ref(false)
  const sidebarVisible = ref(true)

  function toggleSidebar() {
    sidebarVisible.value = !sidebarVisible.value
  }

  return {
    loading,
    sidebarVisible,
    toggleSidebar
  }
})
