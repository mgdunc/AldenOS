<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useShopifyStore } from '../store'
import { useShopifyIntegration } from '../composables/useShopifyIntegration'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Tag from 'primevue/tag'

const router = useRouter()
const store = useShopifyStore()
const { integrations, loading } = storeToRefs(store)
const { loadIntegrations } = useShopifyIntegration()

const createNew = () => {
  router.push('/settings/shopify/new')
}

const viewIntegration = (id: string) => {
  router.push(`/settings/shopify/${id}`)
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString()
}

onMounted(() => {
  loadIntegrations()
})
</script>

<template>
  <div class="p-3">
    <div class="flex align-items-center justify-content-between mb-3">
      <div>
        <h2 class="text-2xl font-bold m-0 mb-1">Shopify Integrations</h2>
        <p class="text-sm text-600 m-0">Manage your connected Shopify stores and sync settings.</p>
      </div>
      <Button label="Add Store" icon="pi pi-plus" severity="success" @click="createNew" />
    </div>

    <div class="surface-card shadow-2 border-round overflow-hidden">
      <DataTable 
        :value="integrations" 
        :loading="loading"
        stripedRows
        dataKey="id"
        @row-click="(event: any) => viewIntegration(event.data.id)"
        class="cursor-pointer"
      >
        <template #empty>
          <div class="text-center text-500 py-8">
            <i class="pi pi-shopping-bag text-6xl mb-3 block text-300"></i>
            <div class="text-xl font-semibold mb-2">No Stores Connected</div>
            <p class="text-sm mb-3">Connect your first Shopify store to start syncing products and orders.</p>
            <Button label="Add Store" icon="pi pi-plus" severity="success" @click="createNew" />
          </div>
        </template>

        <Column header="Store" style="min-width: 250px">
          <template #body="{ data }">
            <div class="flex align-items-center gap-2">
              <i class="pi pi-shopping-bag text-green-600 text-xl"></i>
              <div>
                <div class="font-semibold">{{ data.name || 'Unnamed Store' }}</div>
                <div class="text-xs text-500">{{ data.settings?.shop_url || '-' }}</div>
              </div>
            </div>
          </template>
        </Column>

        <Column field="provider" header="Provider" style="width: 120px">
          <template #body="{ data }">
            <span class="text-sm capitalize">{{ data.provider }}</span>
          </template>
        </Column>

        <Column field="is_active" header="Status" style="width: 100px">
          <template #body="{ data }">
            <Tag 
              :value="data.is_active ? 'Active' : 'Inactive'" 
              :severity="data.is_active ? 'success' : 'secondary'"
              class="text-xs"
            />
          </template>
        </Column>

        <Column field="created_at" header="Connected" style="width: 150px">
          <template #body="{ data }">
            <span class="text-sm">{{ formatDate(data.created_at) }}</span>
          </template>
        </Column>

        <Column style="width: 100px">
          <template #body="{ data }">
            <Button 
              icon="pi pi-chevron-right" 
              text 
              rounded 
              @click.stop="viewIntegration(data.id)"
              v-tooltip="'View Details'"
            />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<style scoped>
:deep(.p-datatable-tbody > tr) {
  cursor: pointer;
}

:deep(.p-datatable-tbody > tr:hover) {
  background-color: var(--surface-hover) !important;
}
</style>
