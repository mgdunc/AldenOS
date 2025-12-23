<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'

const props = defineProps<{
  integrationId: string
}>()

const loading = ref(false)
const functionsStatus = ref<any[]>([])
const lastError = ref<string | null>(null)

const checkFunctions = async () => {
  loading.value = true
  lastError.value = null

  try {
    // Test product sync function
    const productTest = await supabase.functions.invoke('shopify-product-sync', {
      body: { integrationId: props.integrationId, test: true }
    })

    functionsStatus.value = [
      {
        name: 'Product Sync',
        slug: 'shopify-product-sync',
        status: productTest.error ? 'error' : 'healthy',
        error: productTest.error?.message,
        lastChecked: new Date().toISOString()
      }
    ]
  } catch (error: any) {
    lastError.value = error.message
  } finally {
    loading.value = false
  }
}

const getStatusSeverity = (status: string) => {
  switch (status) {
    case 'healthy': return 'success'
    case 'error': return 'danger'
    default: return 'secondary'
  }
}

const openDashboard = () => {
  window.open('https://supabase.com/dashboard/project/zpdajajlqbeorbylhmlz/functions', '_blank')
}

onMounted(() => {
  checkFunctions()
})
</script>

<template>
  <div class="surface-card border-1 surface-border border-round p-3">
    <div class="flex align-items-center justify-content-between mb-3">
      <div>
        <h3 class="text-lg font-semibold m-0 mb-1 flex align-items-center gap-2">
          <i class="pi pi-bolt text-primary"></i>
          Edge Functions Status
        </h3>
        <p class="text-xs text-600 m-0">Monitor the health of your Shopify integration functions.</p>
      </div>
      <div class="flex gap-2">
        <Button 
          icon="pi pi-external-link" 
          text 
          size="small" 
          @click="openDashboard"
          v-tooltip.top="'Open Supabase Dashboard'"
        />
        <Button 
          icon="pi pi-refresh" 
          text 
          size="small" 
          @click="checkFunctions" 
          :loading="loading"
          v-tooltip.top="'Refresh status'"
        />
      </div>
    </div>

    <div v-if="loading && functionsStatus.length === 0" class="text-center p-4">
      <ProgressSpinner style="width: 40px; height: 40px" />
      <p class="text-sm text-500 mt-2">Checking function status...</p>
    </div>

    <div v-else-if="lastError" class="p-3 border-1 border-red-500 border-round bg-red-50 text-red-900">
      <div class="flex align-items-start gap-2">
        <i class="pi pi-exclamation-triangle text-xl"></i>
        <div>
          <div class="font-semibold mb-1">Connection Error</div>
          <div class="text-sm">{{ lastError }}</div>
        </div>
      </div>
    </div>

    <div v-else class="flex flex-column gap-2">
      <div 
        v-for="func in functionsStatus" 
        :key="func.slug"
        class="p-3 border-1 surface-border border-round"
      >
        <div class="flex align-items-center justify-content-between">
          <div class="flex align-items-center gap-2">
            <i class="pi pi-bolt text-xl text-primary"></i>
            <div>
              <div class="font-semibold text-sm">{{ func.name }}</div>
              <div class="text-xs text-500 font-mono">{{ func.slug }}</div>
            </div>
          </div>
          <Tag 
            :value="func.status.toUpperCase()" 
            :severity="getStatusSeverity(func.status)"
            size="small"
          />
        </div>
        <div v-if="func.error" class="mt-2 pt-2 border-top-1 surface-border">
          <div class="text-xs text-red-600">
            <i class="pi pi-times-circle mr-1"></i>
            {{ func.error }}
          </div>
        </div>
        <div class="mt-2 pt-2 border-top-1 surface-border text-xs text-500">
          Last checked: {{ new Date(func.lastChecked).toLocaleString() }}
        </div>
      </div>
    </div>

    <div class="mt-3 p-2 bg-blue-50 border-round text-xs text-600">
      <i class="pi pi-info-circle mr-1"></i>
      For detailed logs and metrics, click the external link to open the Supabase Dashboard.
    </div>
  </div>
</template>
