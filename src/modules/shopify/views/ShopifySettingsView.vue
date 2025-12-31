<script setup lang="ts">
/**
 * Shopify Settings - Single Store Edition
 * 
 * Simple interface to configure and sync with your Shopify store.
 */
import { ref, computed, onMounted } from 'vue'
import { useShopifySync } from '../composables/useShopifySync'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/formatDate'
import { useToast } from 'primevue/usetoast'
import { logger } from '@/lib/logger'

import Button from 'primevue/button'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import ProgressBar from 'primevue/progressbar'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Dialog from 'primevue/dialog'
import Divider from 'primevue/divider'

const toast = useToast()
const { queue, loading, syncing, isSyncing, startProductSync, startOrderSync, loadQueue } = useShopifySync()

// Integration state
const integration = ref<any>(null)
const integrationId = ref<string | null>(null)
const checkingConnection = ref(true)
const saving = ref(false)
const showEditDialog = ref(false)

// Form fields
const form = ref({
  name: '',
  shop_url: '',
  access_token: ''
})

const shopifyConnected = computed(() => {
  return integration.value && integration.value.settings?.shop_url && integration.value.settings?.access_token
})

// Load integration from database
const loadIntegration = async () => {
  checkingConnection.value = true
  try {
    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('provider', 'shopify')
      .limit(1)
      .maybeSingle()

    if (error) throw error
    
    if (data) {
      integration.value = data
      integrationId.value = data.id
      form.value = {
        name: data.name || 'Shopify Store',
        shop_url: data.settings?.shop_url || '',
        access_token: data.settings?.access_token || ''
      }
    }
  } catch (e: any) {
    logger.error('Failed to load integration', e)
  } finally {
    checkingConnection.value = false
  }
}

// Save integration
const saveIntegration = async () => {
  if (!form.value.shop_url || !form.value.access_token) {
    toast.add({ severity: 'warn', summary: 'Missing Fields', detail: 'Please fill in all required fields' })
    return
  }

  saving.value = true
  try {
    const settings = {
      shop_url: form.value.shop_url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
      access_token: form.value.access_token,
      api_version: '2024-01'
    }

    if (integrationId.value) {
      // Update existing
      const { error } = await supabase
        .from('integrations')
        .update({
          name: form.value.name,
          settings
        })
        .eq('id', integrationId.value)

      if (error) throw error
    } else {
      // Create new
      const { data, error } = await supabase
        .from('integrations')
        .insert({
          provider: 'shopify',
          name: form.value.name || 'Shopify Store',
          settings,
          enabled: true
        })
        .select()
        .single()

      if (error) throw error
      integrationId.value = data.id
    }

    toast.add({ severity: 'success', summary: 'Saved', detail: 'Shopify settings saved successfully' })
    showEditDialog.value = false
    await loadIntegration()
  } catch (e: any) {
    logger.error('Failed to save integration', e)
    toast.add({ severity: 'error', summary: 'Error', detail: e.message })
  } finally {
    saving.value = false
  }
}

// Test connection via Edge Function (avoids CORS)
const testConnection = async () => {
  if (!form.value.shop_url || !form.value.access_token) {
    toast.add({ severity: 'warn', summary: 'Missing Fields', detail: 'Please fill in shop URL and access token first' })
    return
  }

  saving.value = true
  try {
    const { data, error } = await supabase.functions.invoke('shopify-test-connection', {
      body: {
        shop_url: form.value.shop_url,
        access_token: form.value.access_token
      }
    })

    if (error) throw error
    
    if (!data.success) {
      throw new Error(data.error || 'Connection failed')
    }

    toast.add({ 
      severity: 'success', 
      summary: 'Connection Successful', 
      detail: `Connected to ${data.shop?.name || form.value.shop_url}` 
    })
  } catch (e: any) {
    logger.error('Connection test failed', e)
    toast.add({ 
      severity: 'error', 
      summary: 'Connection Failed', 
      detail: e.message || 'Could not connect to Shopify' 
    })
  } finally {
    saving.value = false
  }
}

const openEditDialog = () => {
  form.value = {
    name: integration.value?.name || 'Shopify Store',
    shop_url: integration.value?.settings?.shop_url || '',
    access_token: integration.value?.settings?.access_token || ''
  }
  showEditDialog.value = true
}

const getStatusSeverity = (status: string) => {
  switch (status) {
    case 'completed': return 'success'
    case 'processing': return 'info'
    case 'pending': return 'warn'
    case 'failed': return 'danger'
    default: return 'secondary'
  }
}

const recentSyncs = computed(() => queue.value.slice(0, 10))
const maskedToken = computed(() => {
  const token = integration.value?.settings?.access_token
  if (!token) return ''
  return token.substring(0, 8) + '...' + token.substring(token.length - 4)
})

onMounted(() => {
  loadIntegration()
})
</script>

<template>
  <div class="flex flex-column gap-4">
    <!-- Header -->
    <div class="flex justify-content-between align-items-center">
      <div class="flex align-items-center gap-2">
        <i class="pi pi-shopping-bag text-primary text-xl"></i>
        <h1 class="text-xl font-bold m-0 text-900">Shopify Integration</h1>
      </div>
      <div class="flex gap-2">
        <Tag 
          v-if="!checkingConnection"
          :value="shopifyConnected ? 'CONNECTED' : 'NOT CONFIGURED'" 
          :severity="shopifyConnected ? 'success' : 'warn'"
          :icon="shopifyConnected ? 'pi pi-check-circle' : 'pi pi-exclamation-circle'"
        />
      </div>
    </div>

    <!-- Store Configuration Card -->
    <Card>
      <template #title>
        <div class="flex justify-content-between align-items-center">
          <div class="flex align-items-center gap-2">
            <i class="pi pi-cog text-500"></i>
            <span>Store Configuration</span>
          </div>
          <Button 
            :label="shopifyConnected ? 'Edit Settings' : 'Configure'" 
            :icon="shopifyConnected ? 'pi pi-pencil' : 'pi pi-plus'" 
            :severity="shopifyConnected ? 'secondary' : 'primary'"
            size="small"
            @click="openEditDialog"
          />
        </div>
      </template>
      <template #content>
        <div v-if="checkingConnection" class="flex justify-content-center py-4">
          <i class="pi pi-spin pi-spinner text-2xl text-500"></i>
        </div>
        
        <div v-else-if="shopifyConnected" class="flex flex-column gap-3">
          <div class="flex align-items-center gap-3">
            <div class="flex align-items-center justify-content-center bg-green-100 border-round" style="width: 3rem; height: 3rem;">
              <i class="pi pi-shopping-bag text-green-600 text-xl"></i>
            </div>
            <div class="flex-1">
              <div class="font-bold text-900">{{ integration?.name || 'Shopify Store' }}</div>
              <div class="text-sm text-600">{{ integration?.settings?.shop_url }}</div>
            </div>
            <a 
              :href="`https://${integration?.settings?.shop_url}/admin`" 
              target="_blank" 
              class="p-button p-button-text p-button-sm"
            >
              <i class="pi pi-external-link mr-2"></i> Open Admin
            </a>
          </div>
          
          <Divider />
          
          <div class="grid">
            <div class="col-12 md:col-6">
              <div class="text-500 text-sm mb-1">Shop URL</div>
              <div class="font-mono text-sm">{{ integration?.settings?.shop_url }}</div>
            </div>
            <div class="col-12 md:col-6">
              <div class="text-500 text-sm mb-1">Access Token</div>
              <div class="font-mono text-sm">{{ maskedToken }}</div>
            </div>
          </div>
        </div>

        <div v-else class="text-center py-4">
          <i class="pi pi-shopping-bag text-4xl text-300 mb-3"></i>
          <p class="text-600 mb-3">No Shopify store configured yet.</p>
          <Button label="Connect Store" icon="pi pi-plus" @click="openEditDialog" />
        </div>
      </template>
    </Card>

    <!-- Sync Actions (only show when connected) -->
    <div v-if="shopifyConnected" class="grid">
      <div class="col-12 md:col-6">
        <Card>
          <template #title>
            <div class="flex align-items-center gap-2">
              <i class="pi pi-box text-blue-500"></i>
              <span>Product Sync</span>
            </div>
          </template>
          <template #content>
            <p class="text-600 mb-3">Import products from Shopify. Updates existing products by SKU or creates new ones.</p>
            <Button 
              label="Sync Products" 
              icon="pi pi-refresh" 
              @click="startProductSync"
              :loading="syncing"
              :disabled="isSyncing"
              class="w-full"
            />
          </template>
        </Card>
      </div>
      <div class="col-12 md:col-6">
        <Card>
          <template #title>
            <div class="flex align-items-center gap-2">
              <i class="pi pi-shopping-cart text-green-500"></i>
              <span>Order Sync</span>
            </div>
          </template>
          <template #content>
            <p class="text-600 mb-3">Import orders from Shopify. Updates existing orders or creates new ones.</p>
            <Button 
              label="Sync Orders" 
              icon="pi pi-refresh" 
              @click="startOrderSync"
              :loading="syncing"
              :disabled="isSyncing"
              severity="success"
              class="w-full"
            />
          </template>
        </Card>
      </div>
    </div>

    <!-- Active Sync Progress -->
    <Card v-if="isSyncing">
      <template #title>
        <div class="flex align-items-center gap-2">
          <i class="pi pi-spin pi-spinner text-primary"></i>
          <span>Sync in Progress</span>
        </div>
      </template>
      <template #content>
        <ProgressBar mode="indeterminate" style="height: 6px" />
        <p class="text-600 mt-2 text-sm">Syncing with Shopify... This may take a few minutes for large catalogs.</p>
      </template>
    </Card>

    <!-- Recent Syncs -->
    <Card v-if="shopifyConnected">
      <template #title>
        <div class="flex justify-content-between align-items-center">
          <div class="flex align-items-center gap-2">
            <i class="pi pi-history text-500"></i>
            <span>Recent Syncs</span>
          </div>
          <Button icon="pi pi-refresh" text rounded @click="loadQueue" :loading="loading" />
        </div>
      </template>
      <template #content>
        <DataTable :value="recentSyncs" :loading="loading" size="small" stripedRows>
          <template #empty>
            <div class="text-center text-500 py-4">No syncs yet. Start a sync above!</div>
          </template>
          <Column field="sync_type" header="Type" style="width: 120px">
            <template #body="{ data }">
              <Tag :value="data.sync_type.replace('_', ' ').toUpperCase()" severity="secondary" class="text-xs" />
            </template>
          </Column>
          <Column field="status" header="Status" style="width: 120px">
            <template #body="{ data }">
              <Tag :value="data.status.toUpperCase()" :severity="getStatusSeverity(data.status)" class="text-xs" />
            </template>
          </Column>
          <Column field="created_at" header="Started">
            <template #body="{ data }">
              <span class="text-sm">{{ formatDateTime(data.created_at) }}</span>
            </template>
          </Column>
          <Column field="completed_at" header="Completed">
            <template #body="{ data }">
              <span v-if="data.completed_at" class="text-sm">{{ formatDateTime(data.completed_at) }}</span>
              <span v-else class="text-400">-</span>
            </template>
          </Column>
          <Column field="error_message" header="Error">
            <template #body="{ data }">
              <span v-if="data.error_message" class="text-red-500 text-sm text-truncate" style="max-width: 200px; display: block;">
                {{ data.error_message }}
              </span>
              <span v-else class="text-400">-</span>
            </template>
          </Column>
        </DataTable>
      </template>
    </Card>

    <!-- Edit Dialog -->
    <Dialog 
      v-model:visible="showEditDialog" 
      :header="integrationId ? 'Edit Shopify Settings' : 'Connect Shopify Store'"
      modal 
      :style="{ width: '500px' }"
    >
      <div class="flex flex-column gap-4">
        <div class="field">
          <label class="font-medium text-sm text-700 mb-2 block">Store Name</label>
          <InputText v-model="form.name" placeholder="My Shopify Store" class="w-full" />
          <small class="text-500">A friendly name for this integration</small>
        </div>

        <div class="field">
          <label class="font-medium text-sm text-700 mb-2 block">Shop URL <span class="text-red-500">*</span></label>
          <InputText 
            v-model="form.shop_url" 
            placeholder="mystore.myshopify.com" 
            class="w-full font-mono"
          />
          <small class="text-500">Your Shopify store URL (without https://)</small>
        </div>

        <div class="field">
          <label class="font-medium text-sm text-700 mb-2 block">Access Token <span class="text-red-500">*</span></label>
          <Password 
            v-model="form.access_token" 
            placeholder="shpat_xxxxxxxxxxxxx" 
            class="w-full"
            inputClass="w-full font-mono"
            :feedback="false"
            toggleMask
          />
          <small class="text-500">
            Get this from Shopify Admin → Settings → Apps → Develop apps → API credentials
          </small>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-content-between w-full">
          <Button 
            label="Test Connection" 
            icon="pi pi-bolt" 
            severity="secondary" 
            outlined
            @click="testConnection"
            :loading="saving"
          />
          <div class="flex gap-2">
            <Button label="Cancel" severity="secondary" text @click="showEditDialog = false" />
            <Button 
              label="Save" 
              icon="pi pi-check" 
              @click="saveIntegration"
              :loading="saving"
            />
          </div>
        </div>
      </template>
    </Dialog>
  </div>
</template>
