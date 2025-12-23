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
import ShopifyFunctionStatus from '../components/ShopifyFunctionStatus.vue'
import ShopifySyncQueue from '../components/ShopifySyncQueue.vue'
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
  <div class="p-3">
    <div class="flex align-items-center justify-content-between mb-3">
      <div>
        <h2 class="text-2xl font-bold m-0 mb-1">Shopify Integration</h2>
        <p class="text-sm text-600 m-0">Sync products, orders, and inventory with your Shopify stores. Advanced logging & debugging tools for super users.</p>
      </div>
      <Button label="Add Store" icon="pi pi-plus" severity="success" size="small" @click="createNew" />
    </div>
    
    <div class="flex flex-column lg:flex-row gap-3">
      <!-- Store List -->
      <div class="surface-card border-1 surface-border border-round p-3 lg:w-3 w-full" style="height: fit-content;">
            <h3 class="text-base font-bold mb-2"><i class="pi pi-shopping-bag mr-2 text-primary"></i>Connected Stores</h3>
            <Listbox 
                v-model="selectedIntegration" 
                :options="integrations" 
                :optionLabel="(option: any) => option.name || option.settings?.shop_url || 'New Store'" 
                class="w-full border-none p-0"
                listStyle="max-height: 300px"
            >
                <template #option="{ option }">
                    <div class="flex align-items-center gap-2 py-1">
                        <i :class="option.is_active ? 'pi pi-circle-fill text-green-500 text-xs' : 'pi pi-circle text-500 text-xs'"></i>
                        <div class="flex flex-column">
                            <span class="font-semibold text-sm">{{ option.name || option.settings?.shop_url || 'New Store' }}</span>
                            <span class="text-xs text-500">{{ option.is_active ? 'Active' : 'Inactive' }}</span>
                        </div>
                    </div>
                </template>
                <template #empty>
                    <div class="p-3 text-center text-sm text-500">No stores connected. Click "Add Store" to get started.</div>
                </template>
            </Listbox>
      </div>

      <!-- Details -->
      <div v-if="selectedIntegration" class="flex flex-column gap-3 lg:w-9 w-full">
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
                    <Tab value="0"><i class="pi pi-box mr-2"></i>Product Sync</Tab>
                    <Tab value="1"><i class="pi pi-shopping-cart mr-2"></i>Order Sync</Tab>
                    <Tab value="2"><i class="pi pi-list mr-2"></i>Sync Queue</Tab>
                    <Tab value="3"><i class="pi pi-question-circle mr-2"></i>Unmatched</Tab>
                    <Tab value="4"><i class="pi pi-history mr-2"></i>Activity Logs</Tab>
                    <Tab value="5"><i class="pi pi-bolt mr-2"></i>Webhooks</Tab>
                    <Tab value="6"><i class="pi pi-server mr-2"></i>Function Status</Tab>
                </TabList>
                <TabPanels>
                    <TabPanel value="0">
                    <ShopifyProductSyncCard :integration-id="selectedIntegration.id" />
                    </TabPanel>
                    <TabPanel value="1">
                    <ShopifyOrderSyncCard :integration-id="selectedIntegration.id" />
                    </TabPanel>
                    <TabPanel value="2">
                    <ShopifySyncQueue />
                    </TabPanel>
                    <TabPanel value="3">
                    <ShopifyUnmatchedProducts :integration-id="selectedIntegration.id" />
                    </TabPanel>
                    <TabPanel value="4">
                    <ShopifyLogsCard :integration-id="selectedIntegration.id" />
                    </TabPanel>
                    <TabPanel value="5">
                    <ShopifyWebhooksCard :integration-id="selectedIntegration.id" />
                    </TabPanel>
                    <TabPanel value="6">
                    <ShopifyFunctionStatus :integration-id="selectedIntegration.id" />
                    </TabPanel>
                </TabPanels>
                </Tabs>
            </div>
      </div>
    </div>
  </div>
</template>
