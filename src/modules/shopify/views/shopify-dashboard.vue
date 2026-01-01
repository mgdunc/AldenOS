<script setup lang="ts">
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Message from 'primevue/message'
import SyncCard from '../components/SyncCard.vue'

const toast = useToast()
const testingConnection = ref(false)
const connectionStatus = ref<{ success: boolean; message: string } | null>(null)

async function testConnection() {
  testingConnection.value = true
  connectionStatus.value = null
  
  try {
    const { data, error } = await supabase.functions.invoke('shopify-test-connection')
    
    if (error) throw error
    
    if (data?.success) {
      connectionStatus.value = {
        success: true,
        message: `Connected successfully to ${data.shop?.name || 'Shopify store'}`
      }
      toast.add({
        severity: 'success',
        summary: 'Connection Successful',
        detail: connectionStatus.value.message,
        life: 5000
      })
    } else {
      throw new Error(data?.error || 'Connection failed')
    }
  } catch (error: any) {
    connectionStatus.value = {
      success: false,
      message: error.message || 'Failed to connect to Shopify'
    }
    toast.add({
      severity: 'error',
      summary: 'Connection Failed',
      detail: connectionStatus.value.message,
      life: 5000
    })
  } finally {
    testingConnection.value = false
  }
}
</script>

<template>
  <div class="p-4">
    <!-- Header -->
    <div class="flex align-items-center justify-content-between mb-4">
      <div>
        <h1 class="text-3xl font-bold m-0 mb-2">Shopify Integration</h1>
        <p class="text-600 m-0">
          Sync products and orders from your Shopify store. Credentials are configured via environment variables.
        </p>
      </div>
      <Button 
        label="Test Connection" 
        icon="pi pi-link"
        outlined
        :loading="testingConnection"
        @click="testConnection"
      />
    </div>

    <!-- Connection Status Message -->
    <Message 
      v-if="connectionStatus"
      :severity="connectionStatus.success ? 'success' : 'error'"
      class="mb-4"
      :closable="true"
      @close="connectionStatus = null"
    >
      {{ connectionStatus.message }}
    </Message>

    <!-- Info Box -->
    <Message severity="info" class="mb-4" :closable="false">
      <div class="flex align-items-start gap-2">
        <i class="pi pi-info-circle text-xl"></i>
        <div>
          <div class="font-semibold mb-1">Configuration</div>
          <div class="text-sm">
            Set the following environment variables:
            <ul class="mt-2 mb-0 pl-4">
              <li><code class="text-primary">SHOPIFY_SHOP_URL</code> - Your store URL (e.g., mystore.myshopify.com)</li>
              <li><code class="text-primary">SHOPIFY_ACCESS_TOKEN</code> - Your Admin API access token</li>
            </ul>
          </div>
        </div>
      </div>
    </Message>

    <!-- Sync Cards -->
    <div class="grid">
      <div class="col-12 lg:col-6">
        <SyncCard 
          type="products" 
          title="Product Catalog" 
          icon="pi-box"
          description="Sync all products and variants from Shopify to your product catalog"
        />
      </div>
      
      <div class="col-12 lg:col-6">
        <SyncCard 
          type="orders" 
          title="Sales Orders" 
          icon="pi-shopping-cart"
          description="Sync all orders from Shopify to create sales orders in the WMS"
        />
      </div>
    </div>

    <!-- Tips Section -->
    <div class="mt-4">
      <div class="surface-card p-4 border-round shadow-1">
        <h3 class="mt-0 mb-3 flex align-items-center gap-2">
          <i class="pi pi-lightbulb text-primary"></i>
          <span>Tips</span>
        </h3>
        <ul class="m-0 pl-4">
          <li class="mb-2">
            <strong>Real-time Updates:</strong> Progress updates automatically without page refresh
          </li>
          <li class="mb-2">
            <strong>Products:</strong> Syncs all products and variants. Existing products are updated, new ones are created.
          </li>
          <li class="mb-2">
            <strong>Orders:</strong> Syncs order details including customer info and line items. Matches products by SKU.
          </li>
          <li class="mb-2">
            <strong>Background Processing:</strong> Syncs run in the background. You can leave this page and check back later.
          </li>
          <li>
            <strong>Errors:</strong> Check the sync history for any errors. Failed items are logged but don't stop the entire sync.
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
code {
  background-color: var(--surface-ground);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
}
</style>
