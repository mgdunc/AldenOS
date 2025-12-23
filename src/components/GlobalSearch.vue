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

// Helper functions for styling
const getIconBg = (type: string) => {
  const bgMap: Record<string, string> = {
    product: 'bg-blue-50',
    sales_order: 'bg-green-50',
    purchase_order: 'bg-purple-50',
    customer: 'bg-orange-50',
    supplier: 'bg-teal-50',
    fulfillment: 'bg-cyan-50'
  }
  return bgMap[type] || 'bg-gray-50'
}

const getIconColor = (type: string) => {
  const colorMap: Record<string, string> = {
    product: '#3b82f6',
    sales_order: '#22c55e',
    purchase_order: '#a855f7',
    customer: '#f97316',
    supplier: '#14b8a6',
    fulfillment: '#06b6d4'
  }
  return colorMap[type] || '#6b7280'
}

const getBadgeSeverity = (type: string) => {
  const severityMap: Record<string, string> = {
    product: 'info',
    sales_order: 'success',
    purchase_order: 'secondary',
    customer: 'warn',
    supplier: 'info',
    fulfillment: 'info'
  }
  return severityMap[type] || 'secondary'
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
    :closable="false"
    :style="{ width: '800px', maxWidth: '90vw' }"
    :pt="{
      root: { class: 'search-dialog' },
      mask: { class: 'backdrop-blur-sm' }
    }"
    @hide="handleClose"
  >
    <template #container>
      <div class="surface-card border-round shadow-6 overflow-hidden">
        <!-- Search Input Header -->
        <div class="flex align-items-center gap-3 p-4 border-bottom-1 surface-border bg-gray-50">
          <i class="pi pi-search text-xl text-500"></i>
          <InputText
            v-model="searchQuery"
            placeholder="Search products, orders, customers, suppliers..."
            class="flex-1 border-none shadow-none text-lg"
            :pt="{ root: { class: 'p-0 bg-transparent' } }"
            autofocus
          />
          <div class="flex gap-2">
            <kbd class="text-xs text-500 surface-100 border-1 surface-border px-2 py-1 border-round font-semibold">ESC</kbd>
          </div>
        </div>

        <!-- Results Container -->
        <div class="search-results" style="min-height: 250px; max-height: 60vh; overflow-y: auto;">
          <!-- Loading State -->
          <div v-if="loading" class="flex flex-column align-items-center justify-content-center py-8 gap-3">
            <ProgressSpinner style="width: 40px; height: 40px" strokeWidth="3" />
            <span class="text-500 text-sm">Searching...</span>
          </div>

          <!-- No Results -->
          <div v-else-if="searchQuery.length >= 2 && results.length === 0" class="flex flex-column align-items-center justify-content-center py-8 gap-3">
            <div class="flex align-items-center justify-content-center bg-gray-100 border-round-xl" style="width: 64px; height: 64px;">
              <i class="pi pi-inbox text-4xl text-400"></i>
            </div>
            <div class="text-center">
              <div class="font-semibold text-700 mb-1">No results found</div>
              <div class="text-sm text-500">Try searching for a different term</div>
            </div>
          </div>

          <!-- Results List -->
          <div v-else-if="results.length > 0" class="p-2">
            <div
              v-for="result in results"
              :key="`${result.type}-${result.id}`"
              class="result-item flex align-items-center gap-3 p-3 cursor-pointer border-round-lg transition-all transition-duration-150"
              @click="selectResult(result)"
            >
              <!-- Icon -->
              <div class="flex align-items-center justify-content-center border-round" 
                   style="min-width: 40px; height: 40px;"
                   :class="getIconBg(result.type)">
                <i :class="`pi ${getIcon(result.type)} text-lg`" :style="{ color: getIconColor(result.type) }"></i>
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <div class="flex align-items-center gap-2 mb-1">
                  <span class="font-semibold text-900 white-space-nowrap overflow-hidden text-overflow-ellipsis">{{ result.title }}</span>
                  <Badge :value="getTypeLabel(result.type)" :severity="getBadgeSeverity(result.type)" size="small" class="text-xs" />
                </div>
                <div v-if="result.subtitle" class="text-sm text-600 white-space-nowrap overflow-hidden text-overflow-ellipsis">{{ result.subtitle }}</div>
                <div v-if="result.meta" class="text-xs text-500 mt-1">{{ result.meta }}</div>
              </div>

              <!-- Arrow -->
              <i class="pi pi-arrow-right text-400 text-sm"></i>
            </div>
          </div>

          <!-- Empty State (No Query) -->
          <div v-else class="flex flex-column align-items-center justify-content-center py-8 gap-4">
            <div class="flex align-items-center justify-content-center bg-primary-50 border-round-xl" style="width: 64px; height: 64px;">
              <i class="pi pi-search text-4xl text-primary"></i>
            </div>
            <div class="text-center">
              <div class="font-semibold text-700 mb-2">Quick Search</div>
              <div class="text-sm text-500 mb-3">Search across all your inventory, orders, and contacts</div>
              <div class="flex gap-2 justify-content-center flex-wrap">
                <span class="text-xs text-500 surface-100 px-3 py-2 border-round">Products</span>
                <span class="text-xs text-500 surface-100 px-3 py-2 border-round">Sales Orders</span>
                <span class="text-xs text-500 surface-100 px-3 py-2 border-round">Purchase Orders</span>
                <span class="text-xs text-500 surface-100 px-3 py-2 border-round">Customers</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer Tips -->
        <div v-if="results.length > 0" class="flex align-items-center justify-content-between px-4 py-3 border-top-1 surface-border bg-gray-50">
          <div class="flex gap-3 text-xs text-500">
            <span><kbd class="text-xs surface-100 border-1 surface-border px-2 py-1 border-round">↑↓</kbd> Navigate</span>
            <span><kbd class="text-xs surface-100 border-1 surface-border px-2 py-1 border-round">Enter</kbd> Select</span>
          </div>
          <span class="text-xs text-500">{{ results.length }} result{{ results.length === 1 ? '' : 's' }}</span>
        </div>
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.search-dialog {
  margin-top: 10vh !important;
}

@media (max-width: 768px) {
  .search-dialog {
    margin-top: 5vh !important;
  }
}

kbd {
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Courier New', monospace;
  font-size: 0.75rem;
  font-weight: 600;
}

.result-item {
  transition: all 0.15s ease;
}

.result-item:hover {
  background: var(--surface-100);
  transform: translateX(4px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.search-results::-webkit-scrollbar {
  width: 8px;
}

.search-results::-webkit-scrollbar-track {
  background: transparent;
}

.search-results::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 4px;
}

.search-results::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

.backdrop-blur-sm {
  backdrop-filter: blur(4px);
  background: rgba(0, 0, 0, 0.3);
}
</style>
