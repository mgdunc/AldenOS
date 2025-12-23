import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useFulfillmentStore } from '../store'
import { useToast } from 'primevue/usetoast'
import type { 
  Fulfillment, 
  FulfillmentWithRelations,
  FulfillmentLineWithRelations,
  FulfillmentFilters 
} from '../types'

export function useFulfillment() {
  const store = useFulfillmentStore()
  const toast = useToast()
  const loading = ref(false)
  const saving = ref(false)

  /**
   * Load all fulfillments with optional filters
   */
  async function loadFulfillments(filters?: FulfillmentFilters): Promise<FulfillmentWithRelations[]> {
    loading.value = true
    store.loading = true

    try {
      let query = supabase
        .from('fulfillments')
        .select(`
          *,
          sales_orders ( order_number, customer_name )
        `)
        .order('created_at', { ascending: false })

      if (filters?.status) {
        query = query.eq('status', filters.status)
      }

      if (filters?.sales_order_id) {
        query = query.eq('sales_order_id', filters.sales_order_id)
      }

      const { data, error } = await query

      if (error) throw error

      store.setFulfillments(data || [])
      return data || []
    } catch (error: any) {
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to load fulfillments',
        life: 3000
      })
      return []
    } finally {
      loading.value = false
      store.loading = false
    }
  }

  /**
   * Load a single fulfillment with lines
   */
  async function loadFulfillmentById(id: string): Promise<{
    fulfillment: FulfillmentWithRelations | null
    lines: FulfillmentLineWithRelations[]
  }> {
    loading.value = true

    try {
      // Fetch header
      const { data: header, error: headErr } = await supabase
        .from('fulfillments')
        .select('*, sales_orders(order_number, customer_name)')
        .eq('id', id)
        .single()

      if (headErr) throw headErr

      // Fetch lines
      const { data: lines, error: lineErr } = await supabase
        .from('fulfillment_lines')
        .select('*, sales_order_lines(products(sku, name)), locations(name)')
        .eq('fulfillment_id', id)

      if (lineErr) throw lineErr

      store.setCurrentFulfillment(header)

      return {
        fulfillment: header,
        lines: lines || []
      }
    } catch (error: any) {
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to load fulfillment',
        life: 3000
      })
      return { fulfillment: null, lines: [] }
    } finally {
      loading.value = false
    }
  }

  /**
   * Update fulfillment status
   */
  async function updateFulfillmentStatus(id: string, status: Fulfillment['status']): Promise<boolean> {
    saving.value = true

    try {
      const { error } = await supabase
        .from('fulfillments')
        .update({ status })
        .eq('id', id)

      if (error) throw error

      store.updateFulfillment(id, { status })

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: `Fulfillment marked as ${status}`,
        life: 3000
      })

      return true
    } catch (error: any) {
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to update fulfillment',
        life: 3000
      })
      return false
    } finally {
      saving.value = false
    }
  }

  /**
   * Ship fulfillment (calls RPC to deduct inventory)
   */
  async function shipFulfillment(id: string): Promise<boolean> {
    saving.value = true

    try {
      const { error } = await supabase.rpc('process_fulfillment_shipment', {
        p_fulfillment_id: id,
        p_idempotency_key: self.crypto.randomUUID()
      })

      if (error) throw error

      store.updateFulfillment(id, { status: 'shipped' })

      toast.add({
        severity: 'success',
        summary: 'Shipped!',
        detail: 'Inventory deducted successfully',
        life: 3000
      })

      return true
    } catch (error: any) {
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to ship fulfillment',
        life: 3000
      })
      return false
    } finally {
      saving.value = false
    }
  }

  /**
   * Cancel fulfillment (returns stock to order allocation)
   */
  async function cancelFulfillment(id: string): Promise<boolean> {
    saving.value = true

    try {
      const { error } = await supabase.rpc('cancel_fulfillment_and_return_stock', {
        p_fulfillment_id: id,
        p_idempotency_key: self.crypto.randomUUID()
      })

      if (error) throw error

      store.updateFulfillment(id, { status: 'cancelled' })

      toast.add({
        severity: 'success',
        summary: 'Cancelled',
        detail: 'Fulfillment cancelled and stock returned',
        life: 3000
      })

      return true
    } catch (error: any) {
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to cancel fulfillment',
        life: 3000
      })
      return false
    } finally {
      saving.value = false
    }
  }

  /**
   * Revert shipment (unship - returns stock to warehouse)
   */
  async function revertShipment(id: string): Promise<boolean> {
    saving.value = true

    try {
      const { error } = await supabase.rpc('revert_fulfillment_shipment', {
        p_fulfillment_id: id,
        p_idempotency_key: self.crypto.randomUUID()
      })

      if (error) throw error

      store.updateFulfillment(id, { status: 'packed' })

      toast.add({
        severity: 'success',
        summary: 'Shipment Cancelled',
        detail: 'Stock returned to warehouse',
        life: 3000
      })

      return true
    } catch (error: any) {
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to revert shipment',
        life: 3000
      })
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    loading,
    saving,
    loadFulfillments,
    loadFulfillmentById,
    updateFulfillmentStatus,
    shipFulfillment,
    cancelFulfillment,
    revertShipment
  }
}
