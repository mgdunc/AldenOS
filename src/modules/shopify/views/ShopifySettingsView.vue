<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useShopifyStore } from '../store'
import { useShopifyIntegration } from '../composables/useShopifyIntegration'
import ShopifyIntegrationCard from '../components/ShopifyIntegrationCard.vue'
import ShopifyWebhooksCard from '../components/ShopifyWebhooksCard.vue'
import ShopifyLogsCard from '../components/ShopifyLogsCard.vue'
import ShopifyProductSyncCard from '../components/ShopifyProductSyncCard.vue'
import ShopifyOrderSyncCard from '../components/ShopifyOrderSyncCard.vue'
import ShopifyUnmatchedProducts from '../components/ShopifyUnmatchedProducts.vue'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Listbox from 'primevue/listbox'
import Button from 'primevue/button'

const store = useShopifyStore()
const { integrations, selectedIntegration, loading } = storeToRefs(store)
const { loadIntegrations } = useShopifyIntegration()

const createNew = () => {
    store.setSelectedIntegration({ 
        id: 'new', 
        provider: 'shopify',
        name: '',
        settings: { shop_url: '', access_token: '' },
        is_active: true,
        created_at: '',
        updated_at: ''
    } as any)
}

const onSaved = (savedId?: string) => {
    loadIntegrations(savedId)
}

onMounted(() => {
    loadIntegrations()
})
</script>

<template>
  <div class="p-4">
    <div class="flex align-items-center justify-content-between mb-4">
      <div>
        <h2 class="text-2xl font-bold m-0">Shopify Integration</h2>
        <p class="text-gray-600 mt-1">Sync products, orders, and inventory with your Shopify stores.</p>
      </div>
      <Button label="Add Store" icon="pi pi-plus" severity="success" @click="createNew" />
    </div>
    
    <div class="flex flex-column lg:flex-row gap-4">
      <!-- Store List -->
      <div class="surface-card shadow-2 border-round p-4 lg:w-3 w-full">
            <h3 class="text-lg font-bold mb-3"><i class="pi pi-shopping-bag mr-2"></i>Connected Stores</h3>
            <Listbox 
                v-model="selectedIntegration" 
                :options="integrations" 
                :optionLabel="(option: any) => option.name || option.settings?.shop_url || 'New Store'" 
                class="w-full border-none p-0"
                listStyle="max-height: 200px"
            >
                <template #option="{ option }">
                    <div class="flex align-items-center gap-2">
                        <i class="pi pi-shopping-bag text-xl"></i>
                        <div class="flex flex-column">
                            <span class="font-bold">{{ option.name || option.settings?.shop_url || 'New Store' }}</span>
                            <span class="text-sm text-500">{{ option.is_active ? 'Active' : 'Inactive' }}</span>
                        </div>
                    </div>
                </template>
                <template #empty>
                    <div class="p-3 text-center text-500">No stores connected.</div>
                </template>
            </Listbox>
      </div>

      <!-- Details -->
      <div v-if="selectedIntegration" class="flex flex-column gap-4 lg:w-9 w-full">
            <div class="w-full">
                <ShopifyIntegrationCard 
                    :key="selectedIntegration.id"
                    :integration-id="selectedIntegration.id === 'new' ? null : selectedIntegration.id"
                    @saved="onSaved"
                />
            </div>
            <div class="w-full" v-if="selectedIntegration.id !== 'new'">
                <Tabs value="0">
                <TabList>
                    <Tab value="0">Product Sync</Tab>
                    <Tab value="1">Order Sync</Tab>
                    <Tab value="2">Unmatched Items</Tab>
                    <Tab value="3">Webhooks</Tab>
                    <Tab value="4">Logs</Tab>
                </TabList>
                <TabPanels>
                    <TabPanel value="0">
                    <ShopifyProductSyncCard :integration-id="selectedIntegration.id" />
                    </TabPanel>
                    <TabPanel value="1">
                    <ShopifyOrderSyncCard :integration-id="selectedIntegration.id" />
                    </TabPanel>
                    <TabPanel value="2">
                    <ShopifyUnmatchedProducts :integration-id="selectedIntegration.id" />
                    </TabPanel>
                    <TabPanel value="3">
                    <ShopifyWebhooksCard :integration-id="selectedIntegration.id" />
                    </TabPanel>
                    <TabPanel value="4">
                    <ShopifyLogsCard :integration-id="selectedIntegration.id" />
                    </TabPanel>
                </TabPanels>
                </Tabs>
            </div>
      </div>
    </div>
  </div>
</template>
