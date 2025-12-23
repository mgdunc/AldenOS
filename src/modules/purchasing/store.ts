import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'
import { useRealtime } from '@/composables/useRealtime'
import type { PurchaseOrder, Supplier, PurchaseOrderFilters, PurchasingStats } from './types'

export const usePurchasingStore = defineStore('purchasing', () => {
  const loading = ref(false)
  const purchaseOrders = ref<PurchaseOrder[]>([])
  const currentPurchaseOrder = ref<PurchaseOrder | null>(null)
  const suppliers = ref<Supplier[]>([])
  const filters = ref<PurchaseOrderFilters>({})
  
  // Realtime
  const { subscribe, unsubscribe, connected: realtimeConnected } = useRealtime()
  const realtimeEnabled = ref(false)

  // Computed stats
  const stats = computed<PurchasingStats>(() => {
    return {
      total_pos: purchaseOrders.value.length,
      draft_count: purchaseOrders.value.filter(po => po.status === 'draft').length,
      confirmed_count: purchaseOrders.value.filter(po => po.status === 'confirmed').length,
      received_count: purchaseOrders.value.filter(po => po.status === 'received').length,
      cancelled_count: purchaseOrders.value.filter(po => po.status === 'cancelled').length,
      total_spend: purchaseOrders.value
        .filter(po => ['confirmed', 'partially_received', 'received'].includes(po.status))
        .reduce((sum, po) => sum + (po.total || 0), 0),
      pending_receipt: purchaseOrders.value.filter(po => 
        po.status === 'confirmed' || po.status === 'partially_received'
      ).length
    }
  })

  // Filtered POs based on current filters
  const filteredPurchaseOrders = computed(() => {
    let result = purchaseOrders.value

    if (filters.value.status) {
      const statuses = Array.isArray(filters.value.status) 
        ? filters.value.status 
        : [filters.value.status]
      result = result.filter(po => statuses.includes(po.status))
    }

    if (filters.value.supplier_id) {
      result = result.filter(po => po.supplier_id === filters.value.supplier_id)
    }

    if (filters.value.search) {
      const search = filters.value.search.toLowerCase()
      result = result.filter(po =>
        po.po_number?.toLowerCase().includes(search)
      )
    }

    if (filters.value.date_from) {
      result = result.filter(po => po.expected_date && po.expected_date >= filters.value.date_from!)
    }

    if (filters.value.date_to) {
      result = result.filter(po => po.expected_date && po.expected_date <= filters.value.date_to!)
    }

    return result
  })

  // Actions
  const setPurchaseOrders = (pos: PurchaseOrder[]) => {
    purchaseOrders.value = pos
  }

  const setCurrentPurchaseOrder = (po: PurchaseOrder | null) => {
    currentPurchaseOrder.value = po
  }

  const addPurchaseOrder = (po: PurchaseOrder) => {
    purchaseOrders.value.unshift(po)
  }

  const updatePurchaseOrder = (id: string, updates: Partial<PurchaseOrder>) => {
    const index = purchaseOrders.value.findIndex(po => po.id === id)
    if (index !== -1) {
      purchaseOrders.value[index] = { ...purchaseOrders.value[index], ...updates }
    }
    if (currentPurchaseOrder.value?.id === id) {
      currentPurchaseOrder.value = { ...currentPurchaseOrder.value, ...updates }
    }
  }

  const removePurchaseOrder = (id: string) => {
    purchaseOrders.value = purchaseOrders.value.filter(po => po.id !== id)
    if (currentPurchaseOrder.value?.id === id) {
      currentPurchaseOrder.value = null
    }
  }

  const setSuppliers = (newSuppliers: Supplier[]) => {
    suppliers.value = newSuppliers
  }

  const addSupplier = (supplier: Supplier) => {
    suppliers.value.unshift(supplier)
  }

  const setFilters = (newFilters: PurchaseOrderFilters) => {
    filters.value = newFilters
  }

  const clearFilters = () => {
    filters.value = {}
  }

  // Realtime Subscription
  const enableRealtime = () => {
    if (realtimeEnabled.value) return

    subscribe('purchase-orders', {
      table: 'purchase_orders',
      event: '*',
      callback: (payload) => {
        if (payload.eventType === 'INSERT') {
          purchaseOrders.value.unshift(payload.new as PurchaseOrder)
        } else if (payload.eventType === 'UPDATE') {
          updatePurchaseOrder(payload.new.id, payload.new)
        } else if (payload.eventType === 'DELETE') {
          removePurchaseOrder(payload.old.id)
        }
      }
    })

    realtimeEnabled.value = true
  }

  const disableRealtime = () => {
    if (!realtimeEnabled.value) return
    unsubscribe()
    realtimeEnabled.value = false
  }

  onUnmounted(() => {
    disableRealtime()
  })

  return {
    loading,
    purchaseOrders,
    currentPurchaseOrder,
    suppliers,
    filters,
    stats,
    filteredPurchaseOrders,
    realtimeConnected,
    realtimeEnabled,
    setPurchaseOrders,
    setCurrentPurchaseOrder,
    addPurchaseOrder,
    updatePurchaseOrder,
    removePurchaseOrder,
    setSuppliers,
    addSupplier,
    setFilters,
    clearFilters,
    enableRealtime,
    disableRealtime
  }
})
