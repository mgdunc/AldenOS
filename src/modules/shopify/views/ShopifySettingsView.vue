<script setup lang="ts">
/**
 * Shopify Settings - Single Store Edition
 * 
 * Simple interface to sync products and orders from your Shopify store.
 * Credentials are configured via environment variables.
 */
import { ref, computed, onMounted } from 'vue'
import { useShopifySync } from '../composables/useShopifySync'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/formatDate'

import Button from 'primevue/button'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import ProgressBar from 'primevue/progressbar'
import Message from 'primevue/message'

const { queue, loading, syncing, isSyncing, startProductSync, startOrderSync, loadQueue } = useShopifySync()

const shopifyConnected = ref(false)
const shopUrl = ref<string | null>(null)
const checkingConnection = ref(true)

// Check if Shopify is configured (by trying to fetch from integrations or checking if syncs work)
const checkConnection = async () => {
  checkingConnection.value = true
  try {
    // Check if we have any Shopify-linked products or orders
    const { count: productCount } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .not('shopify_product_id', 'is', null)
    
    const { count: orderCount } = await supabase
      .from('sales_orders')
      .select('id', { count: 'exact', head: true })
      .not('shopify_order_id', 'is', null)
    
    // If we have synced data, Shopify is likely configured
    shopifyConnected.value = (productCount || 0) > 0 || (orderCount || 0) > 0
    
    // Try to get shop URL from integrations (legacy) or we can show a placeholder
    const { data: integration } = await supabase
      .from('integrations')
      .select('settings')
      .eq('provider', 'shopify')
      .limit(1)
      .maybeSingle()
    
    if (integration?.settings?.shop_url) {
      shopUrl.value = integration.settings.shop_url
      shopifyConnected.value = true
    }
  } catch (e) {
    // Silent fail - we'll show not connected
  } finally {
    checkingConnection.value = false
  }
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

onMounted(() => {
  checkConnection()
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
      <Tag 
        v-if="!checkingConnection"
        :value="shopifyConnected ? 'CONNECTED' : 'NOT CONFIGURED'" 
        :severity="shopifyConnected ? 'success' : 'warn'"
        :icon="shopifyConnected ? 'pi pi-check-circle' : 'pi pi-exclamation-circle'"
      />
    </div>

    <!-- Connection Status -->
    <Message v-if="!checkingConnection && !shopifyConnected" severity="warn" :closable="false">
      <div class="flex align-items-center gap-2">
        <i class="pi pi-info-circle"></i>
        <span>Shopify credentials need to be configured in environment variables (SHOPIFY_SHOP_URL, SHOPIFY_ACCESS_TOKEN)</span>
      </div>
    </Message>

    <!-- Sync Actions -->
    <div class="grid">
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
    <Card>
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
              <span v-if="data.error_message" class="text-red-500 text-sm">{{ data.error_message }}</span>
              <span v-else class="text-400">-</span>
            </template>
          </Column>
        </DataTable>
      </template>
    </Card>

    <!-- Shop Info -->
    <Card v-if="shopUrl">
      <template #title>
        <div class="flex align-items-center gap-2">
          <i class="pi pi-globe text-500"></i>
          <span>Connected Store</span>
        </div>
      </template>
      <template #content>
        <div class="flex align-items-center gap-3">
          <div class="flex align-items-center justify-content-center bg-green-100 border-round" style="width: 3rem; height: 3rem;">
            <i class="pi pi-shopping-bag text-green-600 text-xl"></i>
          </div>
          <div>
            <div class="font-bold text-900">{{ shopUrl }}</div>
            <a :href="`https://${shopUrl}/admin`" target="_blank" class="text-sm text-primary">
              Open Shopify Admin <i class="pi pi-external-link text-xs"></i>
            </a>
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

