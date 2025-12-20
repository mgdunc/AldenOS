<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
import ToggleSwitch from 'primevue/toggleswitch'
import Password from 'primevue/password'
import Button from 'primevue/button'

const props = defineProps<{
    integrationId?: string | null
}>()

const emit = defineEmits(['saved'])

const toast = useToast()
const loading = ref(false)
const shopUrl = ref('')
const accessToken = ref('')
const webhookSecret = ref('')
const isActive = ref(false)

const loadSettings = async () => {
  if (!props.integrationId) {
      // Reset for new
      shopUrl.value = ''
      accessToken.value = ''
      webhookSecret.value = ''
      isActive.value = true
      return
  }

  loading.value = true
  console.log('Loading Shopify settings...', props.integrationId)
  
  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('id', props.integrationId)
    .single()

  if (error) {
    console.error('Error loading settings:', error)
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load settings' })
  }

  if (data) {
    console.log('Settings loaded:', data)
    isActive.value = data.is_active
    if (data.settings) {
      shopUrl.value = data.settings.shop_url || ''
      accessToken.value = data.settings.access_token || ''
      webhookSecret.value = data.settings.webhook_secret || ''
    }
  }
  loading.value = false
}

watch(() => props.integrationId, () => {
    loadSettings()
})

const saveSettings = async () => {
  console.log('Saving settings...', { isActive: isActive.value, shopUrl: shopUrl.value })
  loading.value = true
  
  const settings = {
    shop_url: shopUrl.value,
    access_token: accessToken.value,
    webhook_secret: webhookSecret.value
  }

  let error;
  
  if (props.integrationId) {
      // Update existing
      const res = await supabase
        .from('integrations')
        .update({
            is_active: isActive.value,
            settings: settings,
            updated_at: new Date().toISOString()
        })
        .eq('id', props.integrationId)
        .select()
      error = res.error
      if (res.data && res.data.length > 0) {
          // Success
      }
  } else {
      // Create new
      const res = await supabase
        .from('integrations')
        .insert({
            provider: 'shopify',
            is_active: isActive.value,
            settings: settings
        })
        .select()
      error = res.error
      if (res.data && res.data.length > 0) {
          // Return the new ID
          emit('saved', res.data[0].id)
          return // Return early to avoid double emit
      }
  }

  if (error) {
    console.error('Error saving settings:', error)
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save settings' })
  } else {
    toast.add({ severity: 'success', summary: 'Success', detail: 'Settings saved successfully' })
    emit('saved', props.integrationId)
  }
  loading.value = false
}

onMounted(() => {
  loadSettings()
})
</script>

<template>
  <div class="card p-4 border-1 surface-border border-round">
    <div class="flex align-items-center justify-content-between mb-4">
      <div class="flex align-items-center gap-2">
        <i class="pi pi-shopping-bag text-2xl text-green-500"></i>
        <h2 class="text-xl font-bold m-0">Connection</h2>
      </div>
      <div class="flex align-items-center gap-2">
        <span class="font-semibold text-sm">{{ isActive ? 'Active' : 'Inactive' }}</span>
        <ToggleSwitch v-model="isActive" inputId="active-switch" />
      </div>
    </div>

    <form @submit.prevent="saveSettings">
      <div class="grid formgrid p-fluid">
        <div class="field col-12">
          <label for="shopUrl">Shop URL</label>
          <InputText id="shopUrl" v-model="shopUrl" placeholder="my-store.myshopify.com" />
        </div>
        <div class="field col-12">
          <label for="accessToken">Admin API Access Token</label>
          <Password id="accessToken" v-model="accessToken" :feedback="false" toggleMask />
        </div>
        <div class="field col-12">
          <label for="webhookSecret">Webhook Signing Secret</label>
          <Password id="webhookSecret" v-model="webhookSecret" :feedback="false" toggleMask />
        </div>
      </div>

      <div class="flex justify-content-end mt-3">
        <Button type="submit" label="Save" icon="pi pi-save" :loading="loading" />
      </div>
    </form>
  </div>
</template>
