<script setup lang="ts">
import { ref, onErrorCaptured, computed } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { logger } from '@/lib/logger'

interface ErrorInfo {
  message: string
  stack?: string
  timestamp: Date
}

const props = defineProps<{
  fallback?: string
  showDetails?: boolean
}>()

const error = ref<ErrorInfo | null>(null)
const errorCount = ref(0)

const hasError = computed(() => error.value !== null)

onErrorCaptured((err: any) => {
  logger.error('Error boundary caught', err as Error)
  
  error.value = {
    message: err.message || 'An unexpected error occurred',
    stack: err.stack,
    timestamp: new Date()
  }
  
  errorCount.value++
  
  // Prevent error from propagating
  return false
})

const retry = () => {
  error.value = null
  errorCount.value = 0
  // Trigger re-render of children
  window.location.reload()
}

const dismiss = () => {
  error.value = null
}
</script>

<template>
  <div class="error-boundary">
    <div v-if="hasError" class="error-container p-4">
      <Message severity="error" :closable="true" @close="dismiss">
        <div class="flex flex-column gap-3">
          <div class="flex align-items-center gap-2">
            <i class="pi pi-exclamation-circle text-2xl"></i>
            <div>
              <strong class="block mb-1">Something went wrong</strong>
              <span class="text-sm">{{ error?.message }}</span>
            </div>
          </div>

          <div v-if="showDetails && error?.stack" class="surface-50 border-round p-3">
            <p class="text-xs font-bold mb-2 text-500">Error Details:</p>
            <pre class="text-xs m-0 overflow-auto" style="max-height: 200px">{{ error.stack }}</pre>
          </div>

          <div class="flex gap-2">
            <Button 
              label="Retry" 
              icon="pi pi-refresh" 
              size="small" 
              @click="retry"
            />
            <Button 
              label="Dismiss" 
              icon="pi pi-times" 
              size="small" 
              severity="secondary"
              outlined
              @click="dismiss"
            />
          </div>

          <p v-if="errorCount > 1" class="text-xs text-500 m-0">
            This error has occurred {{ errorCount }} times
          </p>
        </div>
      </Message>
    </div>

    <div v-else>
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.error-container {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

pre {
  font-family: 'Courier New', monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
