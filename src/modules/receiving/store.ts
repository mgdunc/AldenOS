import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { 
  InventoryReceiptWithRelations, 
  ReceivingStats 
} from './types'

export const useReceivingStore = defineStore('receiving', () => {
  const loading = ref(false)
  const receipts = ref<InventoryReceiptWithRelations[]>([])
  const currentReceipt = ref<InventoryReceiptWithRelations | null>(null)

  // Computed Stats
  const stats = computed<ReceivingStats>(() => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay())

    return {
      total_receipts: receipts.value.length,
      this_month: receipts.value.filter(r => new Date(r.received_at) >= startOfMonth).length,
      this_week: receipts.value.filter(r => new Date(r.received_at) >= startOfWeek).length,
      total_quantity_received: 0, // Would need receipt_lines to calculate
    }
  })

  // Filtered receipts
  const filteredReceipts = computed(() => {
    return receipts.value
  })

  // Actions
  function setReceipts(data: InventoryReceiptWithRelations[]) {
    receipts.value = data
  }

  function setCurrentReceipt(data: InventoryReceiptWithRelations | null) {
    currentReceipt.value = data
  }

  function addReceipt(data: InventoryReceiptWithRelations) {
    receipts.value.unshift(data)
  }

  function removeReceipt(id: string) {
    receipts.value = receipts.value.filter(r => r.id !== id)
  }

  function $reset() {
    loading.value = false
    receipts.value = []
    currentReceipt.value = null
  }

  return {
    loading,
    receipts,
    currentReceipt,
    stats,
    filteredReceipts,
    setReceipts,
    setCurrentReceipt,
    addReceipt,
    removeReceipt,
    $reset
  }
})

