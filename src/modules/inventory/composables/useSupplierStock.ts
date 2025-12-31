import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { useToast } from 'primevue/usetoast'

export interface SupplierStockUpload {
  id: string
  supplier_id: string | null
  upload_date: string
  stock_date: string
  file_name: string | null
  status: 'processing' | 'completed' | 'failed'
  total_rows: number
  matched_count: number
  unmatched_count: number
  error_message: string | null
  created_at: string
  suppliers?: { name: string }
}

export interface SupplierStockLevel {
  id: string
  product_id: string
  supplier_id: string | null
  quantity: number
  stock_date: string
  created_at: string
}

export interface UnmatchedItem {
  id: string
  upload_id: string
  supplier_sku: string
  product_name: string | null
  quantity: number
  raw_data: any
}

export interface ImportResult {
  success: boolean
  uploadId?: string
  totalRows: number
  matchedCount: number
  unmatchedCount: number
  matched: Array<{ sku: string; productName: string; quantity: number }>
  unmatched: Array<{ sku: string; productName?: string; quantity: number }>
  error?: string
}

export function useSupplierStock() {
  const toast = useToast()
  const uploading = ref(false)
  const loading = ref(false)
  const uploads = ref<SupplierStockUpload[]>([])
  const unmatchedItems = ref<UnmatchedItem[]>([])

  /**
   * Upload and import a supplier stock file
   */
  const importStockFile = async (
    file: File,
    options: {
      supplierId?: string
      stockDate?: string
      skuColumn?: string
      qtyColumn?: string
      nameColumn?: string
    } = {}
  ): Promise<ImportResult> => {
    uploading.value = true

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (options.supplierId) formData.append('supplierId', options.supplierId)
      if (options.stockDate) formData.append('stockDate', options.stockDate)
      if (options.skuColumn) formData.append('skuColumn', options.skuColumn)
      if (options.qtyColumn) formData.append('qtyColumn', options.qtyColumn)
      if (options.nameColumn) formData.append('nameColumn', options.nameColumn)

      const { data: { session } } = await supabase.auth.getSession()

      const { data, error } = await supabase.functions.invoke('supplier-stock-import', {
        body: formData,
        headers: session?.access_token ? {
          Authorization: `Bearer ${session.access_token}`
        } : undefined
      })

      if (error) throw error

      if (data.success) {
        toast.add({
          severity: 'success',
          summary: 'Import Complete',
          detail: `Matched ${data.matchedCount} of ${data.totalRows} products`,
          life: 5000
        })
      } else {
        throw new Error(data.error || 'Import failed')
      }

      return data as ImportResult

    } catch (e: any) {
      logger.error('Failed to import supplier stock file', e)
      toast.add({
        severity: 'error',
        summary: 'Import Failed',
        detail: e.message || 'Failed to import file',
        life: 5000
      })
      return {
        success: false,
        totalRows: 0,
        matchedCount: 0,
        unmatchedCount: 0,
        matched: [],
        unmatched: [],
        error: e.message
      }
    } finally {
      uploading.value = false
    }
  }

  /**
   * Load upload history
   */
  const loadUploads = async (limit = 50) => {
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('supplier_stock_uploads')
        .select(`
          *,
          suppliers (name)
        `)
        .order('upload_date', { ascending: false })
        .limit(limit)

      if (error) throw error
      uploads.value = data || []
    } catch (e) {
      logger.error('Failed to load supplier stock uploads', e as Error)
    } finally {
      loading.value = false
    }
  }

  /**
   * Load unmatched items for an upload
   */
  const loadUnmatchedItems = async (uploadId: string) => {
    try {
      const { data, error } = await supabase
        .from('supplier_stock_unmatched')
        .select('*')
        .eq('upload_id', uploadId)
        .order('supplier_sku')

      if (error) throw error
      unmatchedItems.value = data || []
      return data || []
    } catch (e) {
      logger.error('Failed to load unmatched items', e as Error)
      return []
    }
  }

  /**
   * Get latest supplier stock for a product
   */
  const getProductSupplierStock = async (productId: string) => {
    try {
      const { data, error } = await supabase
        .rpc('get_supplier_stock', { p_product_id: productId })

      if (error) throw error
      return data?.[0] || null
    } catch (e) {
      logger.error('Failed to get supplier stock', e as Error)
      return null
    }
  }

  /**
   * Get supplier stock history for a product (for charts)
   */
  const getProductSupplierStockHistory = async (productId: string, days = 30) => {
    try {
      const { data, error } = await supabase
        .rpc('get_supplier_stock_history', { 
          p_product_id: productId,
          p_days: days
        })

      if (error) throw error
      return data || []
    } catch (e) {
      logger.error('Failed to get supplier stock history', e as Error)
      return []
    }
  }

  /**
   * Delete an upload and its associated data
   */
  const deleteUpload = async (uploadId: string) => {
    try {
      const { error } = await supabase
        .from('supplier_stock_uploads')
        .delete()
        .eq('id', uploadId)

      if (error) throw error

      toast.add({
        severity: 'success',
        summary: 'Deleted',
        detail: 'Upload and associated data removed'
      })

      // Refresh list
      await loadUploads()
      return true
    } catch (e) {
      logger.error('Failed to delete upload', e as Error)
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to delete upload'
      })
      return false
    }
  }

  /**
   * Export unmatched items as CSV
   */
  const exportUnmatchedCsv = (items: UnmatchedItem[], fileName = 'unmatched-products.csv') => {
    const headers = ['Supplier SKU', 'Product Name', 'Quantity']
    const rows = items.map(item => [
      item.supplier_sku,
      item.product_name || '',
      item.quantity
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  return {
    uploading,
    loading,
    uploads,
    unmatchedItems,
    importStockFile,
    loadUploads,
    loadUnmatchedItems,
    getProductSupplierStock,
    getProductSupplierStockHistory,
    deleteUpload,
    exportUnmatchedCsv
  }
}

