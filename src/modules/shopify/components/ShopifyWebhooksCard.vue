<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Dropdown from 'primevue/dropdown'

const props = defineProps<{
    integrationId: string
}>()

const toast = useToast()
const loading = ref(false)
const showAddDialog = ref(false)
const webhooks = ref<any[]>([])

const webhookTopics = [
  { label: 'Order Creation', value: 'orders/create' },
  { label: 'Order Update', value: 'orders/updated' },
  { label: 'Order Cancellation', value: 'orders/cancelled' },
  { label: 'Inventory Update', value: 'inventory_levels/update' },
  { label: 'Product Update', value: 'products/update' }
]

const newWebhook = ref({
  topic: 'orders/create',
  address: 'https://<project-ref>.supabase.co/functions/v1/shopify-webhook'
})

const loadWebhooks = async () => {
  if (!props.integrationId) return
  loading.value = true
  // In a real app, we would fetch this from Shopify API via Edge Function
  // For now, we'll read from our local settings or just show defaults
  const { data } = await supabase
    .from('integrations')
    .select('settings')
    .eq('id', props.integrationId)
    .single()

  if (data?.settings?.webhooks) {
    webhooks.value = data.settings.webhooks
  } else {
    webhooks.value = []
  }
  loading.value = false
}

watch(() => props.integrationId, () => {
    loadWebhooks()
})

const addWebhook = async () => {
  if (!props.integrationId) return
  // 1. Save to DB settings
  const updatedWebhooks = [...webhooks.value, { 
    id: Date.now().toString(),
    topic: newWebhook.value.topic,
    address: newWebhook.value.address,
    created_at: new Date().toISOString()
  }]

  const { data: current } = await supabase.from('integrations').select('settings').eq('id', props.integrationId).single()
  const newSettings = { ...current?.settings, webhooks: updatedWebhooks }

  const { error } = await supabase
    .from('integrations')
    .update({ settings: newSettings })
    .eq('id', props.integrationId)

  if (error) {
      toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save webhook' })
  } else {
      webhooks.value = updatedWebhooks
      showAddDialog.value = false
      toast.add({ severity: 'success', summary: 'Success', detail: 'Webhook added (simulated)' })

      // Log it
      await supabase.from('integration_logs').insert({
        integration_id: props.integrationId,
        event_type: 'webhook_registered',
        message: `Registered webhook for ${newWebhook.value.topic}`,
        level: 'success'
      })
  }
}

const removeWebhook = async (index: number) => {
  if (!props.integrationId) return
  const updatedWebhooks = [...webhooks.value]
  updatedWebhooks.splice(index, 1)
  
  const { data: current } = await supabase.from('integrations').select('settings').eq('id', props.integrationId).single()
  if (current) {
    const newSettings = { ...current.settings, webhooks: updatedWebhooks }
    await supabase.from('integrations').update({ settings: newSettings }).eq('id', props.integrationId)
  }
  
  webhooks.value = updatedWebhooks
  toast.add({ severity: 'info', summary: 'Webhook Removed', life: 3000 })
}

onMounted(() => {
  loadWebhooks()
})
</script>

<template>
  <div class="card p-4 border-1 surface-border border-round mt-4">
    <div class="flex align-items-center justify-content-between mb-3">
      <h3 class="text-xl font-bold m-0">Webhooks</h3>
      <Button label="Add Webhook" icon="pi pi-plus" size="small" @click="showAddDialog = true" />
    </div>

    <DataTable :value="webhooks" :loading="loading" size="small" stripedRows>
      <template #empty>No webhooks configured.</template>
      <Column field="topic" header="Topic"></Column>
      <Column field="address" header="Callback URL"></Column>
      <Column header="Actions" style="width: 10%">
        <template #body="slotProps">
          <Button icon="pi pi-trash" text severity="danger" rounded @click="removeWebhook(slotProps.index)" />
        </template>
      </Column>
    </DataTable>

    <Dialog v-model:visible="showAddDialog" header="Register Webhook" :modal="true" class="p-fluid" style="width: 450px">
      <div class="field">
        <label for="topic">Topic</label>
        <Dropdown id="topic" v-model="newWebhook.topic" :options="webhookTopics" optionLabel="label" optionValue="value" />
      </div>
      <div class="field">
        <label for="address">Callback URL</label>
        <InputText id="address" v-model="newWebhook.address" />
        <small class="text-gray-500">The URL where Shopify will send the payload.</small>
      </div>
      <template #footer>
        <Button label="Cancel" icon="pi pi-times" text @click="showAddDialog = false" />
        <Button label="Register" icon="pi pi-check" @click="addWebhook" autofocus />
      </template>
    </Dialog>
  </div>
</template>
