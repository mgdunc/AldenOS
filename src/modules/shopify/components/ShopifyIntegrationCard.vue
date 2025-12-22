<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useShopifyIntegration } from '../composables/useShopifyIntegration'
import InputText from 'primevue/inputtext'
import ToggleSwitch from 'primevue/toggleswitch'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'

const props = defineProps<{
    integrationId?: string | null
}>()

const emit = defineEmits(['saved'])

const {
  loading,
  saving,
  loadIntegration,
  createIntegration,
  updateIntegration,
  testConnection,
  validateShopUrl
} = useShopifyIntegration()

const name = ref('')
const shopUrl = ref('')
const accessToken = ref('')
const webhookSecret = ref('')
const isActive = ref(false)
const testing = ref(false)

const isValid = computed(() => {
  return name.value.trim() !== '' && 
         validateShopUrl(shopUrl.value) && 
         accessToken.value.trim() !== ''
})

const shopUrlError = computed(() => {
  if (!shopUrl.value) return ''
  if (!validateShopUrl(shopUrl.value)) {
    return 'Shop URL must end with .myshopify.com'
  }
  return ''
})

const loadSettings = async () => {
  if (!props.integrationId) {
      // Reset for new
      name.value = ''
      shopUrl.value = ''
      accessToken.value = ''
      webhookSecret.value = ''
      isActive.value = true
      return
  }

  const integration = await loadIntegration(props.integrationId)
  
  if (integration) {
    isActive.value = integration.is_active
    name.value = integration.name || ''
    shopUrl.value = integration.settings.shop_url || ''
    accessToken.value = integration.settings.access_token || ''
    webhookSecret.value = integration.settings.webhook_secret || ''
  }
}

watch(() => props.integrationId, () => {
    loadSettings()
})

const saveSettings = async () => {
  if (!isValid.value) return

  const settings = {
    shop_url: shopUrl.value.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    access_token: accessToken.value,
    webhook_secret: webhookSecret.value
  }

  if (props.integrationId) {
    // Update existing
    const updated = await updateIntegration(props.integrationId, {
      name: name.value,
      is_active: isActive.value,
      settings
    })
    
    if (updated) {
      emit('saved', props.integrationId)
    }
  } else {
    // Create new
    const created = await createIntegration(name.value, settings, isActive.value)
    
    if (created) {
      emit('saved', created.id)
    }
  }
}

const handleTestConnection = async () => {
  if (!shopUrl.value || !accessToken.value) return
  
  testing.value = true
  const normalizedUrl = shopUrl.value.replace(/^https?:\/\//, '').replace(/\/$/, '')
  await testConnection(normalizedUrl, accessToken.value)
  testing.value = false
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
          <label for="name">Integration Name *</label>
          <InputText id="name" v-model="name" placeholder="My Shopify Store" required />
        </div>
        <div class="field col-12">
          <label for="shopUrl">Shop URL *</label>
          <InputText 
            id="shopUrl" 
            v-model="shopUrl" 
            placeholder="my-store.myshopify.com"
            :class="{ 'p-invalid': shopUrlError }"
            required 
          />
          <small v-if="shopUrlError" class="p-error">{{ shopUrlError }}</small>
          <small v-else class="text-500">Must be a .myshopify.com domain</small>
        </div>
        <div class="field col-12">
          <label for="accessToken">Admin API Access Token *</label>
          <Password id="accessToken" v-model="accessToken" :feedback="false" toggleMask required />
        </div>
        <div class="field col-12">
          <label for="webhookSecret">Webhook Signing Secret</label>
          <Password id="webhookSecret" v-model="webhookSecret" :feedback="false" toggleMask />
          <small class="text-500">Optional: Used to verify webhook authenticity</small>
        </div>
      </div>

      <div class="flex justify-content-between align-items-center mt-3 gap-2">
        <Button 
          type="button"
          label="Test Connection" 
          icon="pi pi-check-circle"
          severity="secondary"
          outlined
          :loading="testing"
          :disabled="!shopUrl || !accessToken"
          @click="handleTestConnection"
        />
        <Button 
          type="submit" 
          label="Save" 
          icon="pi pi-save" 
          :loading="saving"
          :disabled="!isValid"
        />
      </div>
    </form>
  </div>
</template>
