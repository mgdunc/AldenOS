<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Card from 'primevue/card'
import SyncCard from '../components/SyncCard.vue'

const toast = useToast()
const testingConnection = ref(false)
const connectionStatus = ref<{ success: boolean; message: string } | null>(null)
const showSettingsDialog = ref(false)
const saving = ref(false)

// Credentials form
const credentials = ref({
  shop_url: '',
  access_token: ''
})

const hasCredentials = ref(false)

async function loadCredentials() {
  try {
    // Check if credentials exist in Supabase secrets (via edge function)
    const { data, error } = await supabase.functions.invoke('shopify-test-connection')
    
    if (!error && data?.success) {
      hasCredentials.value = true
      credentials.value.shop_url = data.shop?.domain || ''
    }
  } catch (error) {
    hasCredentials.value = false
  }
}

async function saveCredentials() {
  if (!credentials.value.shop_url || !credentials.value.access_token) {
    toast.add({
      severity: 'warn',
      summary: 'Missing Fields',
      detail: 'Please enter both shop URL and access token',
      life: 3000
    })
    return
  }

  saving.value = true
  
  try {
    const cleanShopUrl = credentials.value.shop_url
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
    
    // Delete any existing credentials
    await supabase.from('shopify_credentials').delete().eq('is_active', true)
    
    // Insert new credentials
    const { error } = await supabase
      .from('shopify_credentials')
      .insert({
        shop_url: cleanShopUrl,
        access_token: credentials.value.access_token,
        is_active: true
      })

    if (error) throw error

    toast.add({
      severity: 'success',
      summary: 'Credentials Saved',
      detail: 'Shopify credentials have been updated successfully',
      life: 5000
    })

    hasCredentials.value = true
    showSettingsDialog.value = false
    
    // Test the new credentials
    await testConnection()
  } catch (error: any) {
    toast.add({
      severity: 'error',
      summary: 'Save Failed',
      detail: error.message || 'Failed to save credentials',
      life: 5000
    })
  } finally {
    saving.value = false
  }
}

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

onMounted(() => {
  loadCredentials()
})
</script>

<template>
  <div class="p-4">
    <!-- Header -->
    <div class="flex align-items-center justify-content-between mb-4">
      <div>
        <h1 class="text-3xl font-bold m-0 mb-2">Shopify Integration</h1>
        <p class="text-600 m-0">
          Sync products and orders from your Shopify store.
        </p>
      </div>
      <div class="flex gap-2">
        <Button 
          label="Settings" 
          icon="pi pi-cog"
          outlined
          @click="showSettingsDialog = true"
        />
        <Button 
          label="Test Connection" 
          icon="pi pi-link"
          outlined
          :loading="testingConnection"
          @click="testConnection"
        />
      </div>
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

    <!-- No Credentials Warning -->
    <Message 
      v-if="!hasCredentials && !connectionStatus"
      severity="warn"
      class="mb-4"
      :closable="false"
    >
      <div class="flex align-items-center justify-content-between">
        <div>
          <div class="font-semibold mb-1">No Credentials Configured</div>
          <div class="text-sm">Click "Settings" to add your Shopify store credentials.</div>
        </div>
        <Button 
          label="Configure Now" 
          icon="pi pi-cog"
          size="small"
          @click="showSettingsDialog = true"
        />
      </div>
    </Message>

    <!-- Configuration Info -->
    <Card class="mb-4">
      <template #content>
        <div class="flex align-items-start gap-3">
          <i class="pi pi-info-circle text-primary text-2xl"></i>
          <div class="flex-1">
            <div class="font-semibold mb-2">Configuration Options</div>
            <div class="text-sm text-600">
              <p class="mt-0 mb-2">
                <strong>Option 1 (Recommended):</strong> Use the Settings dialog to securely store credentials in the database.
              </p>
              <p class="m-0">
                <strong>Option 2:</strong> Set environment variables in your edge functions:
                <code class="text-primary ml-2">SHOPIFY_SHOP_URL</code> and 
                <code class="text-primary ml-1">SHOPIFY_ACCESS_TOKEN</code>
              </p>
            </div>
          </div>
        </div>
      </template>
    </Card>

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
      <Card>
        <template #title>
          <div class="flex align-items-center gap-2">
            <i class="pi pi-lightbulb text-primary"></i>
            <span>Tips</span>
          </div>
        </template>
        <template #content>
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
        </template>
      </Card>
    </div>

    <!-- Settings Dialog -->
    <Dialog
      v-model:visible="showSettingsDialog"
      header="Shopify Credentials"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="flex flex-column gap-4">
        <Message severity="info" :closable="false">
          <div class="text-sm">
            To get your Admin API credentials:
            <ol class="mt-2 mb-0 pl-4">
              <li>Go to Shopify Admin → Settings → Apps and sales channels</li>
              <li>Click "Develop apps" → Create an app</li>
              <li>Configure Admin API scopes: <code>read_products, read_orders</code></li>
              <li>Install the app and copy the access token</li>
            </ol>
          </div>
        </Message>

        <div class="field">
          <label for="shop_url" class="font-semibold mb-2 block">
            Shop URL *
          </label>
          <InputText
            id="shop_url"
            v-model="credentials.shop_url"
            placeholder="mystore.myshopify.com"
            class="w-full"
          />
          <small class="text-500">Your store's myshopify.com domain</small>
        </div>

        <div class="field">
          <label for="access_token" class="font-semibold mb-2 block">
            Admin API Access Token *
          </label>
          <InputText
            id="access_token"
            v-model="credentials.access_token"
            type="password"
            placeholder="shpat_xxxxxxxxxxxxx"
            class="w-full"
          />
          <small class="text-500">Your Admin API access token</small>
        </div>
      </div>

      <template #footer>
        <Button
          label="Cancel"
          severity="secondary"
          outlined
          @click="showSettingsDialog = false"
        />
        <Button
          label="Save & Test"
          icon="pi pi-check"
          :loading="saving"
          @click="saveCredentials"
        />
      </template>
    </Dialog>
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
