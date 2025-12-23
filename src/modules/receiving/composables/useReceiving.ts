import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useReceivingStore } from '../store'
import { useToast } from 'primevue/usetoast'
import type { 
  InventoryReceiptWithRelations,
  InventoryReceiptLineWithRelations,
  ReceivingFilters 
} from '../types'

export function useReceiving() {
  const store = useReceivingStore()
  const toast = useToast()
  const loading = ref(false)
  const saving = ref(false)

  /**
   * Load all receipts with optional filters
   */
  async function loadReceipts(filters?: ReceivingFilters): Promise<InventoryReceiptWithRelations[]> {
    loading.value = true
    store.loading = true

    try {
      let query = supabase
        .from('inventory_receipts')
        .select(`
          *,
          purchase_orders (id, po_number, supplier_name, status)
        `)
        .order('received_at', { ascending: false })

      if (filters?.purchase_order_id) {
        query = query.eq('purchase_order_id', filters.purchase_order_id)
      }

      if (filters?.date_from) {
        query = query.gte('received_at', filters.date_from)
      }

      if (filters?.date_to) {
        query = query.lte('received_at', filters.date_to)
      }

      const { data, error } = await query

      if (error) throw error

      store.setReceipts(data || [])
      return data || []
    } catch (error: any) {
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to load receipts',
        life: 3000
      })
      return []
    } finally {
      loading.value = false
      store.loading = false
    }
  }

  /**
   * Load a single receipt with lines
   */
  async function loadReceiptById(id: string): Promise<{
    receipt: InventoryReceiptWithRelations | null
    lines: InventoryReceiptLineWithRelations[]
  }> {
    loading.value = true

    try {
      // Fetch header
      const { data: header, error: headErr } = await supabase
        .from('inventory_receipts')
        .select(`
          *,
          purchase_orders ( id, po_number, status, supplier_name )
        `)
        .eq('id', id)
        .maybeSingle()

      if (headErr) throw headErr
      if (!header) throw new Error('Receipt not found')

      // Fetch lines
      const { data: lines, error: lineErr } = await supabase
        .from('inventory_receipt_lines')
        .select(`
          *,
          products ( sku, name ),
          locations ( name )
        `)
        .eq('receipt_id', id)

      if (lineErr) throw lineErr

      store.setCurrentReceipt(header)

      return {
        receipt: header,
        lines: lines || []
      }
    } catch (error: any) {
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to load receipt',
        life: 3000
      })
      return { receipt: null, lines: [] }
    } finally {
      loading.value = false
    }
  }

  /**
   * Load receivable purchase orders (for creating new receipts)
   */
  async function loadReceivablePurchaseOrders(): Promise<any[]> {
    loading.value = true

    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .in('status', ['placed', 'partial', 'partial_received'])
        .order('expected_date', { ascending: true })

      if (error) throw error

      return data || []
    } catch (error: any) {
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to load purchase orders',
        life: 3000
      })
      return []
    } finally {
      loading.value = false
    }
  }

  /**
   * Cancel/revert a receipt
   */
  async function cancelReceipt(id: string): Promise<boolean> {
    saving.value = true

    try {
      const { error } = await supabase.rpc('revert_inventory_receipt', {
        p_receipt_id: id
      })

      if (error) throw error

      store.removeReceipt(id)

      toast.add({
        severity: 'success',
        summary: 'Cancelled',
        detail: 'Receipt cancelled and inventory reversed',
        life: 3000
      })

      return true
    } catch (error: any) {
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to cancel receipt',
        life: 3000
      })
      return false
    } finally {
      saving.value = false
    }
  }

  /**
   * Process a receipt for a purchase order
   */
  async function processReceipt(
    poId: string,
    receiptNumber: string,
    items: Array<{
      po_line_id: string
      product_id: string
      location_id: string
      qty_to_receive: number
    }>,
    notes: string
  ): Promise<{ success: boolean; receiptId?: string }> {
    saving.value = true

    try {
      // 1. Create Receipt Header
      const { data: receipt, error: rErr } = await supabase
        .from('inventory_receipts')
        .insert({
          purchase_order_id: poId,
          receipt_number: receiptNumber,
          received_at: new Date(),
          notes: notes
        })
        .select()
        .single()

      if (rErr) throw rErr

      // 2. Create Receipt Lines
      const receiptLinesPayload = items.map(item => ({
        receipt_id: receipt.id,
        product_id: item.product_id,
        location_id: item.location_id,
        quantity_received: item.qty_to_receive
      }))

      const { error: rlErr } = await supabase
        .from('inventory_receipt_lines')
        .insert(receiptLinesPayload)

      if (rlErr) throw rlErr

      // 3. Update PO Lines & Physical Stock using RPCs
      for (const item of items) {
        if (!item.location_id) {
          throw new Error(`No location selected for product`)
        }

        // Update PO Line Received Qty
        await supabase.rpc('increment_po_line_received', {
          p_line_id: item.po_line_id,
          p_qty: item.qty_to_receive
        })

        // Update Physical Stock
        const { error: stockErr } = await supabase.rpc('book_in_stock', {
          p_product_id: item.product_id,
          p_location_id: item.location_id,
          p_quantity: item.qty_to_receive,
          p_reference_id: receipt.id,
          p_notes: `Receipt ${receiptNumber}`,
          p_idempotency_key: self.crypto.randomUUID()
        })

        if (stockErr) throw stockErr
      }

      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Receipt processed successfully',
        life: 3000
      })

      return { success: true, receiptId: receipt.id }
    } catch (error: any) {
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to process receipt',
        life: 3000
      })
      return { success: false }
    } finally {
      saving.value = false
    }
  }

  /**
   * Update purchase order status after receipt
   */
  async function updatePurchaseOrderStatus(poId: string, status: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status })
        .eq('id', poId)

      if (error) throw error

      return true
    } catch (error: any) {
      console.error('Error updating PO status:', error)
      return false
    }
  }

  /**
   * Load locations for receipt creation
   */
  async function loadLocations(): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('locations')
        .select('id, name')
        .order('name')

      if (error) throw error

      return data || []
    } catch (error: any) {
      console.error('Error loading locations:', error)
      return []
    }
  }

  /**
   * Load purchase order with lines for receipt creation
   */
  async function loadPurchaseOrderForReceipt(poId: string): Promise<{
    po: any | null
    lines: any[]
    locations: any[]
  }> {
    loading.value = true

    try {
      // Load PO, Lines, and Locations in parallel
      const [poRes, linesRes, locationsRes] = await Promise.all([
        supabase.from('purchase_orders').select('*').eq('id', poId).single(),
        supabase
          .from('purchase_order_lines')
          .select(`*, products (sku, name)`)
          .eq('purchase_order_id', poId),
        supabase.from('locations').select('id, name').order('name')
      ])

      if (poRes.error) throw poRes.error

      const locations = locationsRes.data || []
      const defaultLocation =
        locations.find(l => l.name === 'Default' || l.name === 'Warehouse') ||
        locations[0]

      // Prepare lines with defaults
      const preparedLines = (linesRes.data || []).map(l => ({
        po_line_id: l.id,
        product_id: l.product_id,
        sku: l.products.sku,
        name: l.products.name,
        qty_ordered: l.quantity_ordered,
        qty_received_prev: l.quantity_received || 0,
        qty_to_receive: Math.max(0, l.quantity_ordered - (l.quantity_received || 0)),
        location_id: defaultLocation?.id
      }))

      return {
        po: poRes.data,
        lines: preparedLines,
        locations
      }
    } catch (error: any) {
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Failed to load purchase order',
        life: 3000
      })
      return { po: null, lines: [], locations: [] }
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    saving,
    loadReceipts,
    loadReceiptById,
    loadReceivablePurchaseOrders,
    loadPurchaseOrderForReceipt,
    loadLocations,
    processReceipt,
    updatePurchaseOrderStatus,
    cancelReceipt
  }
}
