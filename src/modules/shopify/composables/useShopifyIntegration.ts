import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { useShopifyStore } from '../store'
import type { ShopifyIntegration, ShopifyIntegrationSettings } from '../types'
import { logger } from '@/lib/logger'

export function useShopifyIntegration() {
  const toast = useToast()
  const store = useShopifyStore()
  const loading = ref(false)
  const saving = ref(false)

  const loadIntegrations = async (targetId?: string) => {
    loading.value = true
    store.loading = true

    try {
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('provider', 'shopify')
        .order('created_at', { ascending: true })

      if (error) throw error

      const integrations = (data || []) as ShopifyIntegration[]
      store.setIntegrations(integrations)

      // Handle selection
      if (integrations.length > 0) {
        if (targetId) {
          const found = integrations.find(i => i.id === targetId)
          store.setSelectedIntegration(found || integrations[0] || null)
        } else if (!store.selectedIntegration || store.selectedIntegration.id === 'new') {
          store.setSelectedIntegration(integrations[0] || null)
        }
      } else {
        store.setSelectedIntegration(null)
      }
    } catch (error: any) {
      logger.error('Error loading integrations:', error)
      toast.add({ 
        severity: 'error', 
        summary: 'Error', 
        detail: 'Failed to load integrations' 
      })
    } finally {
      loading.value = false
      store.loading = false
    }
  }

  const loadIntegration = async (id: string) => {
    loading.value = true

    try {
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      return data as ShopifyIntegration
    } catch (error: any) {
      logger.error('Error loading integration:', error)
      toast.add({ 
        severity: 'error', 
        summary: 'Error', 
        detail: 'Failed to load integration details' 
      })
      return null
    } finally {
      loading.value = false
    }
  }

  const createIntegration = async (
    name: string, 
    settings: ShopifyIntegrationSettings,
    isActive = true
  ) => {
    saving.value = true

    try {
      const { data, error } = await supabase
        .from('integrations')
        .insert({
          provider: 'shopify',
          name,
          settings,
          is_active: isActive
        })
        .select()
        .single()

      if (error) throw error

      const newIntegration = data as ShopifyIntegration
      store.addIntegration(newIntegration)
      store.setSelectedIntegration(newIntegration)

      toast.add({ 
        severity: 'success', 
        summary: 'Success', 
        detail: 'Integration created successfully' 
      })

      return newIntegration
    } catch (error: any) {
      logger.error('Error creating integration:', error)
      toast.add({ 
        severity: 'error', 
        summary: 'Error', 
        detail: error.message || 'Failed to create integration' 
      })
      return null
    } finally {
      saving.value = false
    }
  }

  const updateIntegration = async (
    id: string,
    updates: Partial<Pick<ShopifyIntegration, 'name' | 'settings' | 'is_active'>>
  ) => {
    saving.value = true

    try {
      const { data, error } = await supabase
        .from('integrations')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      const updated = data as ShopifyIntegration
      store.updateIntegration(id, updated)

      toast.add({ 
        severity: 'success', 
        summary: 'Success', 
        detail: 'Integration updated successfully' 
      })

      return updated
    } catch (error: any) {
      logger.error('Error updating integration:', error)
      toast.add({ 
        severity: 'error', 
        summary: 'Error', 
        detail: error.message || 'Failed to update integration' 
      })
      return null
    } finally {
      saving.value = false
    }
  }

  const deleteIntegration = async (id: string) => {
    saving.value = true

    try {
      const { error } = await supabase
        .from('integrations')
        .delete()
        .eq('id', id)

      if (error) throw error

      store.removeIntegration(id)

      toast.add({ 
        severity: 'success', 
        summary: 'Success', 
        detail: 'Integration deleted successfully' 
      })

      return true
    } catch (error: any) {
      logger.error('Error deleting integration:', error)
      toast.add({ 
        severity: 'error', 
        summary: 'Error', 
        detail: error.message || 'Failed to delete integration' 
      })
      return false
    } finally {
      saving.value = false
    }
  }

  const testConnection = async (shopUrl: string, accessToken: string) => {
    loading.value = true

    try {
      // Call Edge Function to test connection
      const { data, error } = await supabase.functions.invoke('shopify-test-connection', {
        body: { shop_url: shopUrl, access_token: accessToken }
      })

      if (error) throw error

      if (data?.success) {
        toast.add({ 
          severity: 'success', 
          summary: 'Connection Successful', 
          detail: `Connected to ${data.shop?.name || shopUrl}` 
        })
        return true
      } else {
        throw new Error(data?.error || 'Connection failed')
      }
    } catch (error: any) {
      logger.error('Connection test failed', error)
      toast.add({ 
        severity: 'error', 
        summary: 'Connection Failed', 
        detail: error.message || 'Unable to connect to Shopify store' 
      })
      return false
    } finally {
      loading.value = false
    }
  }

  const validateShopUrl = (url: string): boolean => {
    if (!url) return false
    
    // Remove protocol and trailing slash
    const cleaned = url.replace(/^https?:\/\//, '').replace(/\/$/, '')
    
    // Must end with .myshopify.com
    return cleaned.endsWith('.myshopify.com') && cleaned.split('.').length === 3
  }

  return {
    loading,
    saving,
    loadIntegrations,
    loadIntegration,
    createIntegration,
    updateIntegration,
    deleteIntegration,
    testConnection,
    validateShopUrl
  }
}
