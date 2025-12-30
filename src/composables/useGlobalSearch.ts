import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

export interface SearchResult {
  id: string
  type: 'product' | 'order' | 'purchase_order' | 'customer' | 'supplier'
  title: string
  subtitle?: string
  meta?: string
  url: string
  score?: number
}

/**
 * Global search composable
 * Searches across products, orders, POs, customers, and suppliers
 */
export function useGlobalSearch() {
  const loading = ref(false)
  const results = ref<SearchResult[]>([])

  const search = async (query: string) => {
    if (!query || query.length < 2) {
      results.value = []
      return
    }

    loading.value = true

    try {
      const searchPattern = `%${query}%`
      
      // Search in parallel across all tables
      const [
        productsRes,
        ordersRes,
        posRes,
        customersRes,
        suppliersRes
      ] = await Promise.all([
        // Products
        supabase
          .from('products')
          .select('id, sku, name, list_price')
          .or(`sku.ilike.${searchPattern},name.ilike.${searchPattern},barcode.ilike.${searchPattern}`)
          .limit(5),
        
        // Sales Orders
        supabase
          .from('sales_orders')
          .select('id, order_number, customer_name, status, total_amount')
          .or(`order_number.ilike.${searchPattern},customer_name.ilike.${searchPattern}`)
          .limit(5),
        
        // Purchase Orders
        supabase
          .from('purchase_orders')
          .select('id, po_number, supplier_name, status')
          .or(`po_number.ilike.${searchPattern},supplier_name.ilike.${searchPattern}`)
          .limit(5),
        
        // Customers
        supabase
          .from('customers')
          .select('id, name, email, phone')
          .or(`name.ilike.${searchPattern},email.ilike.${searchPattern}`)
          .limit(5),
        
        // Suppliers
        supabase
          .from('suppliers')
          .select('id, name, email, code')
          .or(`name.ilike.${searchPattern},email.ilike.${searchPattern},code.ilike.${searchPattern}`)
          .limit(5)
      ])

      const searchResults: SearchResult[] = []

      // Map products
      productsRes.data?.forEach(p => {
        searchResults.push({
          id: p.id,
          type: 'product',
          title: p.name,
          subtitle: p.sku,
          meta: `£${p.list_price?.toFixed(2) || '0.00'}`,
          url: `/product/${p.id}`
        })
      })

      // Map sales orders
      ordersRes.data?.forEach(o => {
        searchResults.push({
          id: o.id,
          type: 'order',
          title: `Order ${o.order_number}`,
          subtitle: o.customer_name,
          meta: o.status,
          url: `/sales/${o.id}`
        })
      })

      // Map purchase orders
      posRes.data?.forEach(po => {
        searchResults.push({
          id: po.id,
          type: 'purchase_order',
          title: `PO ${po.po_number}`,
          subtitle: po.supplier_name,
          meta: po.status,
          url: `/purchases/${po.id}`
        })
      })

      // Map customers
      customersRes.data?.forEach(c => {
        searchResults.push({
          id: c.id,
          type: 'customer',
          title: c.name,
          subtitle: c.email,
          meta: c.phone,
          url: `/customers/${c.id}`
        })
      })

      // Map suppliers
      suppliersRes.data?.forEach(s => {
        searchResults.push({
          id: s.id,
          type: 'supplier',
          title: s.name,
          subtitle: s.code,
          meta: s.email,
          url: `/suppliers/${s.id}`
        })
      })

      results.value = searchResults
    } catch (error) {
      logger.error('Global search error', error as Error)
      results.value = []
    } finally {
      loading.value = false
    }
  }

  const clear = () => {
    results.value = []
  }

  const getIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'product': return 'pi-box'
      case 'order': return 'pi-shopping-cart'
      case 'purchase_order': return 'pi-truck'
      case 'customer': return 'pi-user'
      case 'supplier': return 'pi-building'
      default: return 'pi-search'
    }
  }

  const getTypeLabel = (type: SearchResult['type']) => {
    switch (type) {
      case 'product': return 'Product'
      case 'order': return 'Sales Order'
      case 'purchase_order': return 'Purchase Order'
      case 'customer': return 'Customer'
      case 'supplier': return 'Supplier'
      default: return ''
    }
  }

  return {
    loading,
    results,
    search,
    clear,
    getIcon,
    getTypeLabel
  }
}
