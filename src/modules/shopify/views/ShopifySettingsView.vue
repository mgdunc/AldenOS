<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import ShopifyIntegrationCard from '../components/ShopifyIntegrationCard.vue'
import ShopifyWebhooksCard from '../components/ShopifyWebhooksCard.vue'
import ShopifyLogsCard from '../components/ShopifyLogsCard.vue'
import ShopifyProductSyncCard from '../components/ShopifyProductSyncCard.vue'
import ShopifyUnmatchedProducts from '../components/ShopifyUnmatchedProducts.vue'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Listbox from 'primevue/listbox'
import Button from 'primevue/button'

const integrations = ref<any[]>([])
const selectedIntegration = ref<any>(null)
const loading = ref(false)

const loadIntegrations = async (targetId?: string) => {
    loading.value = true
    
    // Capture current selection ID if no target provided
    const currentId = targetId || (selectedIntegration.value?.id !== 'new' ? selectedIntegration.value?.id : null)

    const { data } = await supabase
        .from('integrations')
        .select('*')
        .eq('provider', 'shopify')
        .order('created_at', { ascending: true })
    
    integrations.value = data || []
    
    if (integrations.value.length > 0) {
        if (currentId) {
            const found = integrations.value.find(i => i.id === currentId)
            if (found) {
                selectedIntegration.value = found
            } else {
                selectedIntegration.value = integrations.value[0]
            }
        } else if (!selectedIntegration.value || selectedIntegration.value.id === 'new') {
             selectedIntegration.value = integrations.value[0]
        }
    } else {
        selectedIntegration.value = null
    }

    loading.value = false
}

const createNew = () => {
    selectedIntegration.value = { id: 'new', settings: { shop_url: '' } }
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
        <p class="text-gray-600 mt-1">Manage multiple Shopify stores.</p>
      </div>
      <Button label="Add Store" icon="pi pi-plus" @click="createNew" />
    </div>
    
    <div class="grid">
      <!-- Store List -->
      <div class="col-12 md:col-3">
        <div class="surface-card shadow-2 border-round p-3 h-full">
            <h3 class="text-lg font-bold mb-3">Connected Stores</h3>
            <Listbox 
                v-model="selectedIntegration" 
                :options="integrations" 
                :optionLabel="(option: any) => option.settings?.shop_url || 'New Store'" 
                class="w-full border-none p-0"
                listStyle="max-height: 400px"
            >
                <template #option="{ option }">
                    <div class="flex align-items-center gap-2">
                        <i class="pi pi-shopping-bag text-xl"></i>
                        <div class="flex flex-column">
                            <span class="font-bold">{{ option.settings?.shop_url || 'New Store' }}</span>
                            <span class="text-sm text-500">{{ option.is_active ? 'Active' : 'Inactive' }}</span>
                        </div>
                    </div>
                </template>
                <template #empty>
                    <div class="p-3 text-center text-500">No stores connected.</div>
                </template>
            </Listbox>
        </div>
      </div>

      <!-- Details -->
      <div class="col-12 md:col-9" v-if="selectedIntegration">
        <div class="grid">
            <div class="col-12 xl:col-5">
                <ShopifyIntegrationCard 
                    :key="selectedIntegration.id"
                    :integration-id="selectedIntegration.id === 'new' ? null : selectedIntegration.id"
                    @saved="onSaved"
                />
            </div>
            <div class="col-12 xl:col-7" v-if="selectedIntegration.id !== 'new'">
                <Tabs value="0">
                <TabList>
                    <Tab value="0">Product Sync</Tab>
                    <Tab value="1">Unmatched Items</Tab>
                    <Tab value="2">Webhooks</Tab>
                    <Tab value="3">Logs</Tab>
                </TabList>
                <TabPanels>
                    <TabPanel value="0">
                    <ShopifyProductSyncCard :integration-id="selectedIntegration.id" />
                    </TabPanel>
                    <TabPanel value="1">
                    <ShopifyUnmatchedProducts :integration-id="selectedIntegration.id" />
                    </TabPanel>
                    <TabPanel value="2">
                    <ShopifyWebhooksCard :integration-id="selectedIntegration.id" />
                    </TabPanel>
                    <TabPanel value="3">
                    <ShopifyLogsCard :integration-id="selectedIntegration.id" />
                    </TabPanel>
                </TabPanels>
                </Tabs>
            </div>
        </div>
      </div>
    </div>
  </div>
</template>
