import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { useSalesStore } from '../store'
import type { SalesOrder, SalesOrderLine, SalesOrderFilters, Fulfillment, Customer } from '../types'

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
            quantity_ordered,
            quantity_fulfilled,
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

      if (filters?.customer) {
        query = query.eq('customer_id', filters.customer)
      }

      if (filters?.search) {
        query = query.or(`order_number.ilike.%${filters.search}%,customer_po.ilike.%${filters.search}%`)
      }

      if (filters?.date_from) {
        query = query.gte('order_date', filters.date_from)
      }

      if (filters?.date_to) {
        query = query.lte('order_date', filters.date_to)
      }

      const { data, error } = await query

      if (error) throw error

      const orders = (data || []) as SalesOrder[]
      store.setOrders(orders)
      return orders
    } catch (error: any) {
      console.error('Error loading orders:', error)
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
      console.error('Error loading order:', error)
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
      console.error('Error creating order:', error)
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
      console.error('Error updating order:', error)
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
      // Use RPC if you have inventory allocation logic
      const { error } = await supabase.rpc('allocate_inventory_and_confirm_order', {
        p_order_id: id
      })

      if (error) throw error

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Order confirmed and inventory allocated'
      })

      // Reload order
      return await loadOrder(id)
    } catch (error: any) {
      console.error('Error confirming order:', error)
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
      console.error('Error cancelling order:', error)
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
      console.error('Error creating fulfillment:', error)
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
      console.error('Error loading fulfillments:', error)
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
      console.error('Error searching customers:', error)
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
      console.error('Error loading customers:', error)
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
      console.error('Error creating customer:', error)
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
      console.error('Error updating customer:', error)
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

  return {
    loading,
    saving,
    loadOrders,
    loadOrder,
    createOrder,
    updateOrder,
    confirmOrder,
    cancelOrder,
    createFulfillment,
    loadFulfillments,
    searchCustomers,
    loadCustomers,
    createCustomer,
    updateCustomer
  }
}
