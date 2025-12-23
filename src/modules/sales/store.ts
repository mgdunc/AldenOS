// @ts-nocheck
import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'
import { useRealtime } from '@/composables/useRealtime'
import type { SalesOrder, Fulfillment, SalesOrderFilters, SalesStats } from './types'

export const useSalesStore = defineStore('sales', () => {
  const loading = ref(false)
  const orders = ref<SalesOrder[]>([])
  const currentOrder = ref<SalesOrder | null>(null)
  const fulfillments = ref<Fulfillment[]>([])
  const filters = ref<SalesOrderFilters>({})
  
  // Realtime
  const { subscribe, unsubscribe, connected: realtimeConnected } = useRealtime()
  const realtimeEnabled = ref(false)

  // Computed stats
  const stats = computed<SalesStats>(() => {
    return {
      total_orders: orders.value.length,
      draft_orders: orders.value.filter(o => o.status === 'draft').length,
      confirmed_orders: orders.value.filter(o => o.status === 'confirmed').length,
      fulfilled_orders: orders.value.filter(o => o.status === 'fulfilled').length,
      cancelled_orders: orders.value.filter(o => o.status === 'cancelled').length,
      total_revenue: orders.value
        .filter(o => ['confirmed', 'fulfilled', 'shipped', 'delivered'].includes(o.status))
        .reduce((sum, o) => sum + (o.total_amount || 0), 0),
      pending_fulfillments: orders.value.filter(o => 
        o.status === 'confirmed' && 
        (o.fulfillment_status === 'not_started' || o.fulfillment_status === 'partially_fulfilled')
      ).length
    }
  })

  // Filtered orders based on current filters
  const filteredOrders = computed(() => {
    let result = orders.value

    if (filters.value.status) {
      const statuses = Array.isArray(filters.value.status) 
        ? filters.value.status 
        : [filters.value.status]
      result = result.filter(o => statuses.includes(o.status))
    }

    if (filters.value.customer) {
      result = result.filter(o => o.customer_id === filters.value.customer)
    }

    if (filters.value.search) {
      const search = filters.value.search.toLowerCase()
      result = result.filter(o =>
        o.order_number?.toLowerCase().includes(search) ||
        o.customer_po?.toLowerCase().includes(search)
      )
    }

    if (filters.value.date_from) {
      result = result.filter(o => o.created_at >= filters.value.date_from!)
    }

    if (filters.value.date_to) {
      result = result.filter(o => o.created_at <= filters.value.date_to!)
    }

    return result
  })

  // Actions
  const setOrders = (newOrders: SalesOrder[]) => {
    orders.value = newOrders
  }

  const setCurrentOrder = (order: SalesOrder | null) => {
    currentOrder.value = order
  }

  const addOrder = (order: SalesOrder) => {
    orders.value.unshift(order)
  }

  const updateOrder = (id: string, updates: Partial<SalesOrder>) => {
    const index = orders.value.findIndex(o => o.id === id)
    if (index !== -1) {
      orders.value[index] = { ...orders.value[index], ...updates }
    }
    if (currentOrder.value?.id === id) {
      currentOrder.value = { ...currentOrder.value, ...updates }
    }
  }

  const removeOrder = (id: string) => {
    orders.value = orders.value.filter(o => o.id !== id)
    if (currentOrder.value?.id === id) {
      currentOrder.value = null
    }
  }

  const setFulfillments = (newFulfillments: Fulfillment[]) => {
    fulfillments.value = newFulfillments
  }

  const setFilters = (newFilters: SalesOrderFilters) => {
    filters.value = newFilters
  }

  const clearFilters = () => {
    filters.value = {}
  }

  // Realtime Subscription
  const enableRealtime = () => {
    if (realtimeEnabled.value) return

    subscribe('sales-orders', {
      table: 'sales_orders',
      event: '*',
      callback: (payload) => {
        if (payload.eventType === 'INSERT') {
          orders.value.unshift(payload.new as SalesOrder)
        } else if (payload.eventType === 'UPDATE') {
          updateOrder(payload.new.id, payload.new)
        } else if (payload.eventType === 'DELETE') {
          removeOrder(payload.old.id)
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
    orders,
    currentOrder,
    fulfillments,
    filters,
    stats,
    filteredOrders,
    realtimeConnected,
    realtimeEnabled,
    setOrders,
    setCurrentOrder,
    addOrder,
    updateOrder,
    removeOrder,
    setFulfillments,
    setFilters,
    clearFilters,
    enableRealtime,
    disableRealtime
  }
})
