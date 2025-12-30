import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { useSalesStore } from '../store'
import type { SalesOrder, SalesOrderLine, SalesOrderFilters, Fulfillment, Customer } from '../types'
import { logger } from '@/lib/logger'

export function useSalesOrders() {
  const toast = useToast()
  const store = useSalesStore()
  const loading = ref(false)
  const saving = ref(false)

  const loadOrders = async (filters?: SalesOrderFilters) => {
    loading.value = true
    store.loading = true

    try {
      let query = supabase
        .from('sales_orders')
        .select(`
          *,
          customer:customers(
            id,
            name,
            email,
            phone,
            company
          ),
          lines:sales_order_lines(
            id,
            sku,
            product_name,
            quantity_ordered,
            quantity_fulfilled,
            product_id,
            shopify_line_item_id,
            shopify_variant_id,
            products(id, sku, name)
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

      if (filters?.customer) {
        query = query.eq('customer_id', filters.customer)
      }

      if (filters?.search) {
        query = query.or(`order_number.ilike.%${filters.search}%,customer_po.ilike.%${filters.search}%`)
      }

      if (filters?.date_from) {
        query = query.gte('created_at', filters.date_from)
      }

      if (filters?.date_to) {
        query = query.lte('created_at', filters.date_to)
      }

      const { data, error } = await query

      if (error) throw error

      const orders = (data || []) as SalesOrder[]
      store.setOrders(orders)
      return orders
    } catch (error: any) {
      logger.error('Error loading orders', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load sales orders'
      })
      return []
    } finally {
      loading.value = false
      store.loading = false
    }
  }

  const loadOrder = async (id: string) => {
    loading.value = true

    try {
      const { data, error } = await supabase
        .from('sales_orders')
        .select('*, customer:customers(*), lines:sales_order_lines(*)')
        .eq('id', id)
        .single()

      if (error) throw error

      const order = data as SalesOrder
      store.setCurrentOrder(order)
      return order
    } catch (error: any) {
      logger.error('Error loading order:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load order details'
      })
      return null
    } finally {
      loading.value = false
    }
  }

  const createOrder = async (orderData: Partial<SalesOrder>, lines: Partial<SalesOrderLine>[]) => {
    saving.value = true

    try {
      // Create order
      const { data: order, error: orderError } = await supabase
        .from('sales_orders')
        .insert(orderData)
        .select()
        .single()

      if (orderError) throw orderError

      // Create lines
      const linesWithOrderId = lines.map(line => ({
        ...line,
        sales_order_id: order.id
      }))

      const { error: linesError } = await supabase
        .from('sales_order_lines')
        .insert(linesWithOrderId)

      if (linesError) throw linesError

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Sales order created successfully'
      })

      // Reload to get complete data
      return await loadOrder(order.id)
    } catch (error: any) {
      logger.error('Error creating order:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to create sales order'
      })
      return null
    } finally {
      saving.value = false
    }
  }

  const updateOrder = async (id: string, updates: Partial<SalesOrder>) => {
    saving.value = true

    try {
      const { data, error } = await supabase
        .from('sales_orders')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Order updated successfully'
      })

      return data as SalesOrder
    } catch (error: any) {
      logger.error('Error updating order:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to update order'
      })
      return null
    } finally {
      saving.value = false
    }
  }

  const confirmOrder = async (id: string) => {
    saving.value = true

    try {
      // Use RPC to allocate inventory and confirm the order
      const { data, error } = await supabase.rpc('allocate_inventory_and_confirm_order', {
        p_order_id: id,
        p_new_status: 'confirmed'
      })

      if (error) throw error

      // Check allocation result
      const result = data as { status: string; allocated: number; backordered: number } | null
      
      if (result?.backordered > 0) {
        toast.add({
          severity: 'warn',
          summary: 'Partially Allocated',
          detail: `Order confirmed. ${result.allocated} items allocated, ${result.backordered} items backordered (awaiting stock).`,
          life: 5000
        })
      } else {
        toast.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Order confirmed and inventory allocated'
        })
      }

      // Reload order
      return await loadOrder(id)
    } catch (error: any) {
      logger.error('Error confirming order:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to confirm order'
      })
      return null
    } finally {
      saving.value = false
    }
  }

  const cancelOrder = async (id: string, reason?: string) => {
    saving.value = true

    try {
      const { error } = await supabase
        .from('sales_orders')
        .update({ 
          status: 'cancelled',
          notes: reason ? `Cancelled: ${reason}` : 'Cancelled'
        })
        .eq('id', id)

      if (error) throw error

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Order cancelled successfully'
      })

      return await loadOrder(id)
    } catch (error: any) {
      logger.error('Error cancelling order:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to cancel order'
      })
      return null
    } finally {
      saving.value = false
    }
  }

  const createFulfillment = async (fulfillmentData: Partial<Fulfillment>) => {
    saving.value = true

    try {
      const { data, error } = await supabase
        .from('fulfillments')
        .insert(fulfillmentData)
        .select()
        .single()

      if (error) throw error

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Fulfillment created successfully'
      })

      return data as Fulfillment
    } catch (error: any) {
      logger.error('Error creating fulfillment:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to create fulfillment'
      })
      return null
    } finally {
      saving.value = false
    }
  }

  const loadFulfillments = async (orderId: string) => {
    loading.value = true

    try {
      const { data, error } = await supabase
        .from('fulfillments')
        .select('*, lines:fulfillment_lines(*)')
        .eq('sales_order_id', orderId)
        .order('created_at', { ascending: false })

      if (error) throw error

      return (data || []) as Fulfillment[]
    } catch (error: any) {
      logger.error('Error loading fulfillments:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load fulfillments'
      })
      return []
    } finally {
      loading.value = false
    }
  }

  const searchCustomers = async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) return []

    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, email, phone, company')
        .or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%`)
        .limit(20)

      if (error) throw error

      return (data || []) as Customer[]
    } catch (error: any) {
      logger.error('Error searching customers:', error)
      return []
    }
  }

  const loadCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error

      return (data || []) as Customer[]
    } catch (error: any) {
      logger.error('Error loading customers:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load customers'
      })
      return []
    }
  }

  const createCustomer = async (customerData: Partial<Customer>) => {
    saving.value = true

    try {
      const { data, error } = await supabase
        .from('customers')
        .insert(customerData)
        .select()
        .single()

      if (error) throw error

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Customer created successfully'
      })

      return data as Customer
    } catch (error: any) {
      logger.error('Error creating customer:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to create customer'
      })
      return null
    } finally {
      saving.value = false
    }
  }

  const updateCustomer = async (id: string, customerData: Partial<Customer>) => {
    saving.value = true

    try {
      const { data, error } = await supabase
        .from('customers')
        .update(customerData)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Customer updated successfully'
      })

      return data as Customer
    } catch (error: any) {
      logger.error('Error updating customer:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update customer'
      })
      return null
    } finally {
      saving.value = false
    }
  }

  const loadOrderDetails = async (orderId: string) => {
    loading.value = true

    try {
      // Fetch order, fulfillments, and lines in parallel
      const [orderRes, fulfillRes, linesRes] = await Promise.all([
        supabase
          .from('sales_orders')
          .select('*, billing_address, shipping_address')
          .eq('id', orderId)
          .single(),
        supabase
          .from('fulfillments')
          .select('*')
          .eq('sales_order_id', orderId)
          .order('created_at', { ascending: false }),
        supabase
          .from('sales_order_lines')
          .select(`*, products (id, sku, name, list_price)`)
          .eq('sales_order_id', orderId)
          .order('created_at', { ascending: true })
      ])

      if (orderRes.error) throw orderRes.error

      const rawLines = linesRes.data || []
      const productIds = rawLines.map(l => l.product_id).filter(id => id)

      // Fetch inventory availability and fulfillment quantities
      let availMap: Record<string, number> = {}
      let fulfillMap: Record<string, any> = {}
      let incomingMap: Record<string, any[]> = {}

      if (productIds.length > 0) {
        const [stockData, fulfillQty, incoming] = await Promise.all([
          supabase
            .from('product_inventory_view')
            .select('product_id, available')
            .in('product_id', productIds),
          supabase.rpc('get_line_fulfillment_qty', { p_order_id: orderId }),
          supabase
            .from('purchase_order_lines')
            .select('product_id, quantity_ordered, purchase_orders!inner(po_number, expected_date, status)')
            .in('product_id', productIds)
            .eq('purchase_orders.status', 'placed')
        ])

        stockData.data?.forEach(row => {
          availMap[row.product_id] = row.available
        })

        fulfillQty.data?.forEach((row: any) => {
          fulfillMap[row.line_id] = row
        })

        incoming.data?.forEach((row: any) => {
          if (!incomingMap[row.product_id]) incomingMap[row.product_id] = []
          incomingMap[row.product_id]!.push({
            po: row.purchase_orders.po_number,
            date: row.purchase_orders.expected_date,
            qty: row.quantity_ordered
          })
        })
      }

      // Map enriched line data
      const enrichedLines = rawLines.map(l => ({
        ...l,
        available_now: availMap[l.product_id] ?? 0,
        qty_allocated: l.quantity_allocated || 0,
        qty_in_fulfillment: fulfillMap[l.id]?.qty_in_fulfillment ?? 0,
        qty_shipped: fulfillMap[l.id]?.qty_shipped ?? 0,
        line_total: l.quantity_ordered * l.unit_price
      }))

      return {
        order: orderRes.data,
        lines: enrichedLines,
        fulfillments: fulfillRes.data || [],
        incomingStock: incomingMap
      }
    } catch (error: any) {
      logger.error('Error loading order details:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load order details'
      })
      return null
    } finally {
      loading.value = false
    }
  }

  const updateOrderLine = async (lineId: string, updates: Partial<SalesOrderLine>) => {
    saving.value = true

    try {
      const { error } = await supabase
        .from('sales_order_lines')
        .update(updates)
        .eq('id', lineId)

      if (error) throw error

      return true
    } catch (error: any) {
      logger.error('Error updating line:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update line item'
      })
      return false
    } finally {
      saving.value = false
    }
  }

  const deleteOrderLine = async (lineId: string) => {
    saving.value = true

    try {
      const { error } = await supabase
        .from('sales_order_lines')
        .delete()
        .eq('id', lineId)

      if (error) throw error

      toast.add({
        severity: 'success',
        summary: 'Deleted',
        detail: 'Line item deleted'
      })

      return true
    } catch (error: any) {
      logger.error('Error deleting line:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to delete line item'
      })
      return false
    } finally {
      saving.value = false
    }
  }

  const addProductToOrder = async (orderId: string, productId: string, unitPrice: number) => {
    saving.value = true

    try {
      // Check if product already exists
      const { data: existing } = await supabase
        .from('sales_order_lines')
        .select('*')
        .eq('sales_order_id', orderId)
        .eq('product_id', productId)
        .maybeSingle()

      if (existing) {
        // Increment quantity
        await supabase
          .from('sales_order_lines')
          .update({ quantity_ordered: existing.quantity_ordered + 1 })
          .eq('id', existing.id)
      } else {
        // Insert new line
        await supabase
          .from('sales_order_lines')
          .insert({
            sales_order_id: orderId,
            product_id: productId,
            quantity_ordered: 1,
            unit_price: unitPrice
          })
      }

      return true
    } catch (error: any) {
      logger.error('Error adding product:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to add product'
      })
      return false
    } finally {
      saving.value = false
    }
  }

  const revertToDraft = async (orderId: string) => {
    saving.value = true

    try {
      const { error } = await supabase
        .from('sales_orders')
        .update({ status: 'draft' })
        .eq('id', orderId)

      if (error) throw error

      toast.add({
        severity: 'success',
        summary: 'Reverted',
        detail: 'Order is now in Draft'
      })

      return true
    } catch (error: any) {
      logger.error('Error reverting order:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message
      })
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    loading,
    saving,
    loadOrders,
    loadOrder,
    loadOrderDetails,
    createOrder,
    updateOrder,
    updateOrderLine,
    deleteOrderLine,
    addProductToOrder,
    confirmOrder,
    cancelOrder,
    revertToDraft,
    createFulfillment,
    loadFulfillments,
    searchCustomers,
    loadCustomers,
    createCustomer,
    updateCustomer
  }
}
