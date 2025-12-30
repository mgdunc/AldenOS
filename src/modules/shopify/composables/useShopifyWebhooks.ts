import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import type { ShopifyWebhook, ShopifyWebhookPayload } from '../types'
import { logger } from '@/lib/logger'

export function useShopifyWebhooks(integrationId: string) {
  const toast = useToast()
  const loading = ref(false)
  const webhooks = ref<ShopifyWebhook[]>([])

  const fetchWebhooks = async () => {
    if (!integrationId) return

    loading.value = true

    try {
      const { data, error } = await supabase
        .from('integrations')
        .select('settings')
        .eq('id', integrationId)
        .single()

      if (error) throw error

      webhooks.value = data?.settings?.webhooks || []
    } catch (error: any) {
      logger.error('Error fetching webhooks:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load webhooks'
      })
    } finally {
      loading.value = false
    }
  }

  const registerWebhook = async (payload: ShopifyWebhookPayload) => {
    loading.value = true

    try {
      // Call Edge Function to register webhook with Shopify API
      const { data, error } = await supabase.functions.invoke('shopify-register-webhook', {
        body: {
          integration_id: integrationId,
          ...payload
        }
      })

      if (error) throw error

      if (data?.error) {
        throw new Error(data.error)
      }

      // Add webhook to local state
      const newWebhook: ShopifyWebhook = {
        id: data.webhook.id.toString(),
        topic: payload.topic,
        address: payload.address,
        created_at: new Date().toISOString()
      }

      webhooks.value.push(newWebhook)

      // Update database settings
      await updateWebhooksInDatabase()

      // Log the registration
      await supabase.from('integration_logs').insert({
        integration_id: integrationId,
        event_type: 'webhook_registered',
        message: `Registered webhook for ${payload.topic}`,
        level: 'success'
      })

      toast.add({
        severity: 'success',
        summary: 'Webhook Registered',
        detail: `Successfully registered ${payload.topic} webhook`
      })

      return newWebhook
    } catch (error: any) {
      logger.error('Error registering webhook:', error)
      toast.add({
        severity: 'error',
        summary: 'Registration Failed',
        detail: error.message || 'Failed to register webhook'
      })
      return null
    } finally {
      loading.value = false
    }
  }

  const deleteWebhook = async (webhookId: string) => {
    loading.value = true

    try {
      // Call Edge Function to delete webhook from Shopify API
      const { data, error } = await supabase.functions.invoke('shopify-delete-webhook', {
        body: {
          integration_id: integrationId,
          webhook_id: webhookId
        }
      })

      if (error) throw error

      if (data?.error) {
        throw new Error(data.error)
      }

      // Remove from local state
      webhooks.value = webhooks.value.filter(w => w.id !== webhookId)

      // Update database settings
      await updateWebhooksInDatabase()

      // Log the deletion
      await supabase.from('integration_logs').insert({
        integration_id: integrationId,
        event_type: 'webhook_deleted',
        message: `Deleted webhook ${webhookId}`,
        level: 'info'
      })

      toast.add({
        severity: 'success',
        summary: 'Webhook Deleted',
        detail: 'Webhook removed successfully'
      })

      return true
    } catch (error: any) {
      logger.error('Error deleting webhook:', error)
      toast.add({
        severity: 'error',
        summary: 'Deletion Failed',
        detail: error.message || 'Failed to delete webhook'
      })
      return false
    } finally {
      loading.value = false
    }
  }

  const updateWebhooksInDatabase = async () => {
    try {
      const { data: current } = await supabase
        .from('integrations')
        .select('settings')
        .eq('id', integrationId)
        .single()

      const newSettings = {
        ...current?.settings,
        webhooks: webhooks.value
      }

      await supabase
        .from('integrations')
        .update({ settings: newSettings })
        .eq('id', integrationId)
    } catch (error) {
      logger.error('Error updating webhooks in database:', error)
    }
  }

  const listWebhooksFromShopify = async () => {
    loading.value = true

    try {
      // Call Edge Function to fetch webhooks from Shopify API
      const { data, error } = await supabase.functions.invoke('shopify-list-webhooks', {
        body: { integration_id: integrationId }
      })

      if (error) throw error

      if (data?.error) {
        throw new Error(data.error)
      }

      const shopifyWebhooks = data.webhooks || []
      
      // Sync with local state
      webhooks.value = shopifyWebhooks.map((w: any) => ({
        id: w.id.toString(),
        topic: w.topic,
        address: w.address,
        created_at: w.created_at
      }))

      // Update database
      await updateWebhooksInDatabase()

      toast.add({
        severity: 'success',
        summary: 'Webhooks Synced',
        detail: `Found ${webhooks.value.length} webhooks`
      })
    } catch (error: any) {
      logger.error('Error listing webhooks:', error)
      toast.add({
        severity: 'error',
        summary: 'Sync Failed',
        detail: error.message || 'Failed to fetch webhooks from Shopify'
      })
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    fetchWebhooks()
  })

  return {
    loading,
    webhooks,
    fetchWebhooks,
    registerWebhook,
    deleteWebhook,
    listWebhooksFromShopify
  }
}
