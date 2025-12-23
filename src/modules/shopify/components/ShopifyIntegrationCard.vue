<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useShopifyIntegration } from '../composables/useShopifyIntegration'
import InputText from 'primevue/inputtext'
import ToggleSwitch from 'primevue/toggleswitch'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Tag from 'primevue/tag'

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
  <div class="surface-card shadow-2 border-round overflow-hidden">
    <!-- Header -->
    <div class="flex align-items-center justify-content-between p-4 surface-100 border-bottom-1 surface-border">
      <div class="flex align-items-center gap-3">
        <div class="flex align-items-center justify-content-center bg-green-100 border-round" style="width: 3rem; height: 3rem;">
          <i class="pi pi-shopping-bag text-green-600 text-xl"></i>
        </div>
        <div>
          <h2 class="text-xl font-bold m-0 mb-1">Store Connection</h2>
          <p class="text-xs text-600 m-0">Configure your Shopify store integration</p>
        </div>
      </div>
      <div class="flex align-items-center gap-2">
        <Tag :value="isActive ? 'Active' : 'Inactive'" :severity="isActive ? 'success' : 'secondary'" />
        <ToggleSwitch v-model="isActive" inputId="active-switch" />
      </div>
    </div>

    <!-- Form -->
    <form @submit.prevent="saveSettings" class="p-4">
      <div class="grid formgrid p-fluid">
        <div class="field col-12">
          <label for="name" class="font-semibold text-sm mb-2 block">
            <i class="pi pi-tag mr-2"></i>Integration Name *
          </label>
          <InputText 
            id="name" 
            v-model="name" 
            placeholder="My Shopify Store" 
            required 
            autocomplete="off"
          />
          <small class="text-500">A friendly name to identify this store</small>
        </div>

        <div class="field col-12">
          <label for="shopUrl" class="font-semibold text-sm mb-2 block">
            <i class="pi pi-globe mr-2"></i>Shop URL *
          </label>
          <InputText 
            id="shopUrl" 
            v-model="shopUrl" 
            placeholder="my-store.myshopify.com"
            :class="{ 'p-invalid': shopUrlError }"
            required 
            autocomplete="off"
          />
          <small v-if="shopUrlError" class="p-error">
            <i class="pi pi-exclamation-circle mr-1"></i>{{ shopUrlError }}
          </small>
          <small v-else class="text-500">Your Shopify store domain (must end with .myshopify.com)</small>
        </div>

        <div class="field col-12">
          <label for="accessToken" class="font-semibold text-sm mb-2 block">
            <i class="pi pi-key mr-2"></i>Admin API Access Token *
          </label>
          <Password 
            id="accessToken" 
            v-model="accessToken" 
            :feedback="false" 
            toggleMask 
            required 
            autocomplete="new-password"
            inputClass="font-mono"
          />
          <small class="text-500">Generate this token in your Shopify admin under Settings → Apps and sales channels → Develop apps</small>
        </div>

        <div class="field col-12">
          <label for="webhookSecret" class="font-semibold text-sm mb-2 block">
            <i class="pi pi-shield mr-2"></i>Webhook Signing Secret
            <Tag value="Optional" severity="secondary" class="ml-2" />
          </label>
          <Password 
            id="webhookSecret" 
            v-model="webhookSecret" 
            :feedback="false" 
            toggleMask
            autocomplete="new-password"
            inputClass="font-mono"
          />
          <small class="text-500">Used to verify webhook authenticity. Find this in your Shopify app settings.</small>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex flex-column sm:flex-row justify-content-between align-items-stretch sm:align-items-center gap-2 mt-4 pt-3 border-top-1 surface-border">
        <Button 
          type="button"
          label="Test Connection" 
          icon="pi pi-check-circle"
          severity="secondary"
          outlined
          :loading="testing"
          :disabled="!shopUrl || !accessToken"
          @click="handleTestConnection"
          class="w-full sm:w-auto"
        />
        <Button 
          type="submit" 
          label="Save Configuration" 
          icon="pi pi-save" 
          :loading="saving"
          :disabled="!isValid"
          class="w-full sm:w-auto"
        />
      </div>
    </form>
  </div>
</template>
