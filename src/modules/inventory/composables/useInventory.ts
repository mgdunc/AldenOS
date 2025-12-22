import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { useInventoryStore } from '../store'
import type { Product, ProductWithStock, ProductFilters, StockAdjustment } from '../types'

export function useInventory() {
  const toast = useToast()
  const store = useInventoryStore()
  const loading = ref(false)
  const saving = ref(false)

  const loadProducts = async (filters?: ProductFilters) => {
    loading.value = true
    store.loading = true

    try {
      let query = supabase
        .from('products')
        .select('*, product_inventory_view(available_stock, reserved_stock, total_stock)')
        .order('name')

      if (filters?.search) {
        query = query.or(`sku.ilike.%${filters.search}%,name.ilike.%${filters.search}%,barcode.ilike.%${filters.search}%`)
      }

      if (filters?.category) {
        query = query.eq('category', filters.category)
      }

      if (filters?.supplier_id) {
        query = query.eq('supplier_id', filters.supplier_id)
      }

      if (filters?.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active)
      }

      const { data, error } = await query

      if (error) throw error

      // Transform to include stock levels
      const products = (data || []).map(p => ({
        ...p,
        available_stock: p.product_inventory_view?.[0]?.available_stock || 0,
        reserved_stock: p.product_inventory_view?.[0]?.reserved_stock || 0,
        total_stock: p.product_inventory_view?.[0]?.total_stock || 0
      })) as ProductWithStock[]

      store.setProducts(products)
      return products
    } catch (error: any) {
      console.error('Error loading products:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load products'
      })
      return []
    } finally {
      loading.value = false
      store.loading = false
    }
  }

  const loadProduct = async (id: string) => {
    loading.value = true

    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_inventory_view(available_stock, reserved_stock, total_stock)')
        .eq('id', id)
        .single()

      if (error) throw error

      const product = {
        ...data,
        available_stock: data.product_inventory_view?.[0]?.available_stock || 0,
        reserved_stock: data.product_inventory_view?.[0]?.reserved_stock || 0,
        total_stock: data.product_inventory_view?.[0]?.total_stock || 0
      } as ProductWithStock

      store.setCurrentProduct(product)
      return product
    } catch (error: any) {
      console.error('Error loading product:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load product details'
      })
      return null
    } finally {
      loading.value = false
    }
  }

  const createProduct = async (productData: Partial<Product>) => {
    saving.value = true

    try {
      const { data, error } = await supabase
        .from('products')
        .insert(productData)
        .select()
        .single()

      if (error) throw error

      const newProduct = data as Product
      store.addProduct(newProduct)

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Product created successfully'
      })

      return newProduct
    } catch (error: any) {
      console.error('Error creating product:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to create product'
      })
      return null
    } finally {
      saving.value = false
    }
  }

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    saving.value = true

    try {
      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      const updated = data as Product
      store.updateProduct(id, updated)

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Product updated successfully'
      })

      return updated
    } catch (error: any) {
      console.error('Error updating product:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to update product'
      })
      return null
    } finally {
      saving.value = false
    }
  }

  const deleteProduct = async (id: string) => {
    saving.value = true

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)

      if (error) throw error

      store.removeProduct(id)

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Product deleted successfully'
      })

      return true
    } catch (error: any) {
      console.error('Error deleting product:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to delete product'
      })
      return false
    } finally {
      saving.value = false
    }
  }

  const adjustStock = async (adjustment: StockAdjustment) => {
    saving.value = true

    try {
      const { error } = await supabase.rpc('adjust_inventory', {
        p_product_id: adjustment.product_id,
        p_location_id: adjustment.location_id,
        p_quantity: adjustment.quantity_change,
        p_reason: adjustment.reason,
        p_notes: adjustment.notes
      })

      if (error) throw error

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Stock adjusted successfully'
      })

      // Reload the product to get updated stock
      if (store.currentProduct?.id === adjustment.product_id) {
        await loadProduct(adjustment.product_id)
      }

      return true
    } catch (error: any) {
      console.error('Error adjusting stock:', error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to adjust stock'
      })
      return false
    } finally {
      saving.value = false
    }
  }

  const searchProducts = async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) return []

    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, sku, name, list_price')
        .or(`sku.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%,barcode.ilike.%${searchTerm}%`)
        .eq('is_active', true)
        .limit(20)

      if (error) throw error

      return data || []
    } catch (error: any) {
      console.error('Error searching products:', error)
      return []
    }
  }

  return {
    loading,
    saving,
    loadProducts,
    loadProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    adjustStock,
    searchProducts
  }
}
