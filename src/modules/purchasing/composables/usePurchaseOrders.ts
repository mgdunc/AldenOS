import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { usePurchasingStore } from '../store'
import type { PurchaseOrder, PurchaseOrderLine, PurchaseOrderFilters, Supplier, InventoryReceipt } from '../types'

export function usePurchaseOrders() {
  const toast = useToast()
  const store = usePurchasingStore()
  const loading = ref(false)
  const saving = ref(false)

  const loadPurchaseOrders = async (filters?: PurchaseOrderFilters) => {
    loading.value = true
    store.loading = true

    try {
      let query = supabase
        .from('purchase_orders')
        .select(`
          *,
          supplier:suppliers(name, email),
          lines:purchase_order_lines(
            id,
            quantity_ordered,
            quantity_received,
            product_id,
            products(sku, name)
          )
        `)
        .order('created_at', { ascending: false })

      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status)
        } else {
          query = query.eq('status', filters.status)
        }
      }

      if (filters?.supplier_id) {
        query = query.eq('supplier_id', filters.supplier_id)
      }

      if (filters?.search) {
        query = query.or(`po_number.ilike.%${filters.search}%`)
      }

      if (filters?.date_from) {
        query = query.gte('order_date', filters.date_from)
      }

      if (filters?.date_to) {
        query = query.lte('order_date', filters.date_to)
      }

      const { data, error } = await query

      if (error) throw error

      const pos = (data || []) as PurchaseOrder[]
      store.setPurchaseOrders(pos)
      return pos
    } catch (error: any) {
      console.error('Error loading purchase orders:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load purchase orders'
      })
      return []
    } finally {
      loading.value = false
      store.loading = false
    }
  }

  const loadPurchaseOrder = async (id: string) => {
    loading.value = true

    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*, supplier:suppliers(*), lines:purchase_order_lines(*, product:products(name, sku))')
        .eq('id', id)
        .single()

      if (error) throw error

      const po = data as PurchaseOrder
      store.setCurrentPurchaseOrder(po)
      return po
    } catch (error: any) {
      console.error('Error loading purchase order:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load purchase order details'
      })
      return null
    } finally {
      loading.value = false
    }
  }

  const createPurchaseOrder = async (
    poData: Partial<PurchaseOrder>,
    lines: Partial<PurchaseOrderLine>[]
  ) => {
    saving.value = true

    try {
      // Create PO
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert(poData)
        .select()
        .single()

      if (poError) throw poError

      // Create lines
      const linesWithPoId = lines.map(line => ({
        ...line,
        purchase_order_id: po.id
      }))

      const { error: linesError } = await supabase
        .from('purchase_order_lines')
        .insert(linesWithPoId)

      if (linesError) throw linesError

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Purchase order created successfully'
      })

      // Reload to get complete data
      return await loadPurchaseOrder(po.id)
    } catch (error: any) {
      console.error('Error creating purchase order:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to create purchase order'
      })
      return null
    } finally {
      saving.value = false
    }
  }

  const updatePurchaseOrder = async (id: string, updates: Partial<PurchaseOrder>) => {
    saving.value = true

    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Purchase order updated successfully'
      })

      return data as PurchaseOrder
    } catch (error: any) {
      console.error('Error updating purchase order:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to update purchase order'
      })
      return null
    } finally {
      saving.value = false
    }
  }

  const confirmPurchaseOrder = async (id: string) => {
    return await updatePurchaseOrder(id, { status: 'confirmed' })
  }

  const cancelPurchaseOrder = async (id: string, reason?: string) => {
    saving.value = true

    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({
          status: 'cancelled',
          notes: reason ? `Cancelled: ${reason}` : 'Cancelled'
        })
        .eq('id', id)

      if (error) throw error

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Purchase order cancelled successfully'
      })

      return await loadPurchaseOrder(id)
    } catch (error: any) {
      console.error('Error cancelling purchase order:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to cancel purchase order'
      })
      return null
    } finally {
      saving.value = false
    }
  }

  const createReceipt = async (receiptData: Partial<InventoryReceipt>) => {
    saving.value = true

    try {
      const { data, error } = await supabase
        .from('inventory_receipts')
        .insert(receiptData)
        .select()
        .single()

      if (error) throw error

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Receipt created successfully'
      })

      return data as InventoryReceipt
    } catch (error: any) {
      console.error('Error creating receipt:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to create receipt'
      })
      return null
    } finally {
      saving.value = false
    }
  }

  const loadReceipts = async (purchaseOrderId: string) => {
    loading.value = true

    try {
      const { data, error } = await supabase
        .from('inventory_receipts')
        .select('*, lines:inventory_receipt_lines(*)')
        .eq('purchase_order_id', purchaseOrderId)
        .order('created_at', { ascending: false })

      if (error) throw error

      return (data || []) as InventoryReceipt[]
    } catch (error: any) {
      console.error('Error loading receipts:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load receipts'
      })
      return []
    } finally {
      loading.value = false
    }
  }

  const loadSuppliers = async () => {
    loading.value = true

    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name')

      if (error) throw error

      const suppliers = (data || []) as Supplier[]
      store.setSuppliers(suppliers)
      return suppliers
    } catch (error: any) {
      console.error('Error loading suppliers:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load suppliers'
      })
      return []
    } finally {
      loading.value = false
    }
  }

  const createSupplier = async (supplierData: Partial<Supplier>) => {
    saving.value = true

    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert(supplierData)
        .select()
        .single()

      if (error) throw error

      const supplier = data as Supplier
      store.addSupplier(supplier)

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Supplier created successfully'
      })

      return supplier
    } catch (error: any) {
      console.error('Error creating supplier:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to create supplier'
      })
      return null
    } finally {
      saving.value = false
    }
  }

  const searchSuppliers = async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) return []

    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name, email, phone')
        .or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
        .limit(20)

      if (error) throw error

      return (data || []) as Supplier[]
    } catch (error: any) {
      console.error('Error searching suppliers:', error)
      return []
    }
  }

  return {
    loading,
    saving,
    loadPurchaseOrders,
    loadPurchaseOrder,
    createPurchaseOrder,
    updatePurchaseOrder,
    confirmPurchaseOrder,
    cancelPurchaseOrder,
    createReceipt,
    loadReceipts,
    loadSuppliers,
    createSupplier,
    searchSuppliers
  }
}
