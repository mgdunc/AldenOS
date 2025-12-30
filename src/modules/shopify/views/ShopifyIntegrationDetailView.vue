<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useShopifyStore } from '../store'
import { useShopifyIntegration } from '../composables/useShopifyIntegration'
import { useShopifySync } from '../composables/useShopifySync'
import { logger } from '@/lib/logger'
import ShopifyIntegrationCard from '../components/ShopifyIntegrationCard.vue'
import ShopifyWebhooksCard from '../components/ShopifyWebhooksCard.vue'
import ShopifyUnmatchedProducts from '../components/ShopifyUnmatchedProducts.vue'
import ShopifyIntegrationQueue from '../components/ShopifyIntegrationQueue.vue'
import ShopifySyncHealthStats from '../components/ShopifySyncHealthStats.vue'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Button from 'primevue/button'
import Menu from 'primevue/menu'

const route = useRoute()
const router = useRouter()
const store = useShopifyStore()
const { integrations, loading } = storeToRefs(store)
const { loadIntegrations } = useShopifyIntegration()

const integrationId = computed(() => route.params.id as string)
const isNew = computed(() => integrationId.value === 'new')

const integration = ref<any>(null)
const syncMenu = ref()

// Sync composables - stored as refs 
// We initialize them once on mount and clean up on unmount
const productSync = ref<ReturnType<typeof useShopifySync> | null>(null)
const orderSync = ref<ReturnType<typeof useShopifySync> | null>(null)

// Local reactive state for button - directly watched from composables
const productSyncing = ref(false)
const orderSyncing = ref(false)

// Watch composable syncing state and copy to local refs
// This ensures Vue reactivity tracks the changes properly
watch(
  () => productSync.value?.syncing.value,
  (val) => { productSyncing.value = val ?? false },
  { immediate: true }
)

watch(
  () => orderSync.value?.syncing.value,
  (val) => { orderSyncing.value = val ?? false },
  { immediate: true }
)

// Initialize sync composables when we have a valid integrationId
let lastInitializedId: string | null = null

const initSyncComposables = () => {
  const currentId = integrationId.value
  
  // Guard against double initialization for the same ID
  if (currentId === lastInitializedId) {
    logger.debug('[ShopifyIntegrationDetailView] initSyncComposables skipped - same ID:', currentId)
    return
  }
  
  logger.debug('[ShopifyIntegrationDetailView] initSyncComposables for ID:', { currentId, previous: lastInitializedId })
  
  // Cleanup existing if any
  productSync.value?.cleanup()
  orderSync.value?.cleanup()
  
  if (!isNew.value && currentId) {
    lastInitializedId = currentId
    productSync.value = useShopifySync(currentId, 'product_sync')
    orderSync.value = useShopifySync(currentId, 'order_sync')
    // Manually init since we're creating outside the original setup context
    productSync.value.init()
    orderSync.value.init()
    logger.debug('[ShopifyIntegrationDetailView] Sync composables initialized, syncing states:', 
      productSync.value.syncing.value, orderSync.value.syncing.value)
  } else {
    lastInitializedId = null
    productSync.value = null
    orderSync.value = null
  }
}

// Track syncing state reactively
const isSyncing = computed(() => productSyncing.value || orderSyncing.value)

// Direct sync trigger functions for menu commands
const triggerProductSync = () => {
  logger.debug('[ShopifyIntegrationDetailView] triggerProductSync called')
  logger.debug('[ShopifyIntegrationDetailView] productSync.value:', { productSync: productSync.value })
  if (productSync.value) {
    logger.debug('[ShopifyIntegrationDetailView] Calling startSync...')
    productSync.value.startSync()
  } else {
    logger.error('[ShopifyIntegrationDetailView] productSync is null!')
  }
}

const triggerOrderSync = () => {
  logger.debug('[ShopifyIntegrationDetailView] triggerOrderSync called')
  if (orderSync.value) {
    orderSync.value.startSync()
  } else {
    logger.error('[ShopifyIntegrationDetailView] orderSync is null!')
  }
}

const syncMenuItems = computed(() => [
  {
    label: 'Sync Products',
    icon: 'pi pi-box',
    command: triggerProductSync,
    disabled: productSyncing.value
  },
  {
    label: 'Sync Orders',
    icon: 'pi pi-shopping-cart',
    command: triggerOrderSync,
    disabled: orderSyncing.value
  }
])

const toggleSyncMenu = (event: Event) => {
  syncMenu.value.toggle(event)
}

const loadIntegration = async () => {
  if (isNew.value) {
    integration.value = {
      id: 'new',
      provider: 'shopify',
      name: '',
      settings: { shop_url: '', access_token: '' },
      is_active: true,
      created_at: '',
      updated_at: ''
    }
  } else {
    await loadIntegrations()
    integration.value = integrations.value.find(i => i.id === integrationId.value)
    
    if (!integration.value) {
      router.push('/settings/shopify')
    }
  }
}

const onSaved = (savedId?: string) => {
  if (savedId && isNew.value) {
    router.push(`/settings/shopify/${savedId}`)
  } else {
    loadIntegration()
  }
}

const goBack = () => {
  router.push('/settings/shopify')
}

watch(() => route.params.id, () => {
  loadIntegration()
  initSyncComposables()
})

onMounted(() => {
  loadIntegration()
  initSyncComposables()
})

onUnmounted(() => {
  productSync.value?.cleanup()
  orderSync.value?.cleanup()
})
</script>

<template>
  <div class="p-3">
    <div class="flex align-items-center gap-2 mb-3">
      <Button 
        icon="pi pi-arrow-left" 
        text 
        rounded 
        @click="goBack" 
        v-tooltip="'Back to Integrations'"
      />
      <div class="flex-1">
        <h2 class="text-2xl font-bold m-0 mb-1">
          {{ isNew ? 'Add Shopify Store' : integration?.name || 'Store Details' }}
        </h2>
        <p class="text-sm text-600 m-0">
          {{ isNew ? 'Connect a new Shopify store to sync products and orders.' : 'Manage sync settings and view activity logs.' }}
        </p>
      </div>
      <div v-if="!isNew" class="flex gap-2">
        <Button 
          label="Sync Now" 
          icon="pi pi-sync" 
          :loading="isSyncing"
          severity="success"
          @click="toggleSyncMenu"
        />
        <Menu ref="syncMenu" :model="syncMenuItems" :popup="true" />
      </div>
    </div>

    <div v-if="loading && !integration" class="flex justify-content-center align-items-center py-8">
      <i class="pi pi-spin pi-spinner text-4xl text-primary"></i>
    </div>

    <div v-else-if="integration" class="flex flex-column gap-3">
      <!-- Connection Settings -->
      <ShopifyIntegrationCard 
        :integration-id="isNew ? null : integrationId"
        @saved="onSaved"
      />

      <!-- Tabs for existing integrations -->
      <div v-if="!isNew">
        <Tabs value="0">
          <TabList>
            <Tab value="0"><i class="pi pi-list mr-2"></i>Sync Queue</Tab>
            <Tab value="1"><i class="pi pi-heart mr-2"></i>Health</Tab>
            <Tab value="2"><i class="pi pi-question-circle mr-2"></i>Unmatched</Tab>
            <Tab value="3"><i class="pi pi-bolt mr-2"></i>Webhooks</Tab>
          </TabList>
          <TabPanels>
            <TabPanel value="0">
              <ShopifyIntegrationQueue :integration-id="integrationId" />
            </TabPanel>
            <TabPanel value="1">
              <ShopifySyncHealthStats :integration-id="integrationId" />
            </TabPanel>
            <TabPanel value="2">
              <ShopifyUnmatchedProducts :integration-id="integrationId" />
            </TabPanel>
            <TabPanel value="3">
              <ShopifyWebhooksCard :integration-id="integrationId" />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </div>
  </div>
</template>
