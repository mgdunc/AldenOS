<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGlobalSearch } from '@/composables/useGlobalSearch'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import ProgressSpinner from 'primevue/progressspinner'
import Badge from 'primevue/badge'

const router = useRouter()
const { loading, results, search, clear, getIcon, getTypeLabel } = useGlobalSearch()

const visible = ref(false)
const searchQuery = ref('')

// Keyboard shortcut: Cmd+K or Ctrl+K
onMounted(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      visible.value = true
    }
  }
  
  window.addEventListener('keydown', handleKeyDown)
  
  return () => {
    window.removeEventListener('keydown', handleKeyDown)
  }
})

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>
watch(searchQuery, (newQuery) => {
  clearTimeout(searchTimeout)
  
  if (!newQuery || newQuery.length < 2) {
    clear()
    return
  }
  
  searchTimeout = setTimeout(() => {
    search(newQuery)
  }, 300)
})

const selectResult = (result: any) => {
  router.push(result.url)
  visible.value = false
  searchQuery.value = ''
  clear()
}

const handleClose = () => {
  searchQuery.value = ''
  clear()
}

// Expose method to open from parent
defineExpose({
  open: () => { visible.value = true }
})
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :draggable="false"
    :dismissableMask="true"
    :pt="{
      root: { class: 'w-full md:w-30rem' },
      header: { class: 'p-0' }
    }"
    @hide="handleClose"
  >
    <template #header>
      <div class="w-full p-3 border-bottom-1 surface-border">
        <span class="p-input-icon-left w-full">
          <i class="pi pi-search" />
          <InputText
            v-model="searchQuery"
            placeholder="Search products, orders, customers..."
            class="w-full"
            autofocus
          />
        </span>
        <div class="flex justify-content-between align-items-center mt-2">
          <span class="text-xs text-500">Type to search across all modules</span>
          <kbd class="text-xs surface-100 border-round px-2 py-1">⌘K</kbd>
        </div>
      </div>
    </template>

    <div class="py-2" style="min-height: 200px; max-height: 400px; overflow-y: auto;">
      <!-- Loading State -->
      <div v-if="loading" class="flex justify-content-center align-items-center py-6">
        <ProgressSpinner style="width: 30px; height: 30px" />
      </div>

      <!-- No Results -->
      <div v-else-if="searchQuery.length >= 2 && results.length === 0" class="text-center py-6">
        <i class="pi pi-inbox text-4xl text-300 mb-3"></i>
        <p class="text-500">No results found for "{{ searchQuery }}"</p>
      </div>

      <!-- Results -->
      <div v-else-if="results.length > 0" class="flex flex-column gap-1">
        <div
          v-for="result in results"
          :key="`${result.type}-${result.id}`"
          class="p-3 hover:surface-100 cursor-pointer border-round transition-colors"
          @click="selectResult(result)"
        >
          <div class="flex align-items-start gap-3">
            <i :class="`pi ${getIcon(result.type)} text-xl text-500`"></i>
            <div class="flex-1">
              <div class="flex align-items-center gap-2 mb-1">
                <span class="font-semibold">{{ result.title }}</span>
                <Badge :value="getTypeLabel(result.type)" severity="secondary" size="small" />
              </div>
              <div v-if="result.subtitle" class="text-sm text-500">{{ result.subtitle }}</div>
              <div v-if="result.meta" class="text-xs text-400 mt-1">{{ result.meta }}</div>
            </div>
            <i class="pi pi-arrow-right text-300"></i>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="text-center py-6">
        <i class="pi pi-search text-4xl text-300 mb-3"></i>
        <p class="text-500">Start typing to search...</p>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
kbd {
  font-family: 'Courier New', monospace;
  font-size: 0.75rem;
}
</style>
