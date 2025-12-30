<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

// PrimeVue Components
import Dialog from 'primevue/dialog'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Paginator from 'primevue/paginator'

// PROPS: We need the visibility state and the product data
const props = defineProps<{
    visible: boolean,
    product: any // The product object containing id, sku, snapshots, etc.
}>()

// EMITS: We need to tell the parent when to close the dialog
const emit = defineEmits(['update:visible'])

const history = ref<any[]>([])
const historyLoading = ref(false)
const adjusting = ref(false)
const adjustQty = ref(0)
const adjustLocation = ref('')
const adjustReason = ref('')
const adjustError = ref('')

// --- Helper Functions ---
const formatDate = (dateStr: string) => dateStr ? new Date(dateStr).toLocaleString() : '-'

const getAvailableSeverity = (val: number) => {
    if (val === 0) return 'danger'
    if (val < 10) return 'warn'
    return 'success'
}

const getTypeSeverity = (type: string) => {
    switch (type) {
        case 'purchase':
        case 'po_received': return 'success'
        case 'sale': return 'danger'
        case 'adjustment': return 'warn'
        default: return 'info'
    }
}

const fetchHistory = async (productId: string) => {
    historyLoading.value = true
    const { data, error } = await supabase
        .from('inventory_ledger')
        .select(`
            created_at, transaction_type, change_qoh, notes,
            location:location_id ( name ) // <-- Query uses the 'location' alias
        `)
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(25) 

    if (error) logger.error('Error loading inventory history', error)
    else history.value = data || []
    
    historyLoading.value = false
}

// Watch for the dialog to open (visibility=true) and fetch data
watch(() => props.visible, (newVal) => {
    if (newVal && props.product?.id) {
        fetchHistory(props.product.id)
    } else {
        history.value = [] // Clear history when closed
    }
})

// Helper: List of locations for select
const locationOptions = computed(() => {
  if (!props.product?.inventory_snapshots) return []
  // Unique locations from snapshots
  const locs = props.product.inventory_snapshots.map((s: any) => s.locations)
  const seen = new Set()
  return locs.filter((l: any) => l && !seen.has(l.id) && seen.add(l.id))
})

const doAdjustStock = async () => {
  adjustError.value = ''
  if (!props.product?.id || !adjustLocation.value || !adjustQty.value) {
    adjustError.value = 'All fields are required.'
    return
  }
  adjusting.value = true
  const { data, error } = await supabase.rpc('adjust_stock', {
    p_product_id: props.product.id,
    p_location_id: adjustLocation.value,
    p_quantity: adjustQty.value,
    p_reason: adjustReason.value || 'Manual adjustment'
  })
  adjusting.value = false
  if (error) {
    adjustError.value = error.message || 'Adjustment failed.'
    return
  }
  // Success: refresh movement history and clear form
  await fetchHistory(props.product.id)
  adjustQty.value = 0
  adjustLocation.value = ''
  adjustReason.value = ''
}

</script>

<template>
    <Dialog 
        :visible="visible" 
        @update:visible="val => emit('update:visible', val)"
        modal 
        :header="`${product?.sku || 'Product'} Inventory Details`"
        :style="{ width: '50rem' }"
    >
        <div v-if="product">
            <h3 class="mt-0 mb-3 text-lg font-medium">{{ product.name }}</h3>

            <Tabs value="0">
                <TabList>
                    <Tab value="0">Current Breakdown</Tab>
                    <Tab value="1">Last 25 Movements</Tab>
                    <Tab value="2">Adjust Stock</Tab>
                </TabList>

                <TabPanels>
                    <TabPanel value="0">
                        <DataTable 
                            :value="product.inventory_snapshots" 
                            size="small" 
                            stripedRows
                        >
                            <template #empty>No stock found in any location.</template>
                            <Column field="locations.name" header="Location" />
                            <Column field="qoh" header="On Hand" style="width: 5rem" />
                            <Column field="reserved" header="Reserved" style="width: 5rem" />
                            
                            <Column field="available" header="Available" style="width: 5rem">
                                <template #body="{ data }">
                                    <Tag 
                                        :severity="getAvailableSeverity(data.available)" 
                                        :value="data.available" 
                                        rounded
                                    />
                                </template>
                            </Column>
                        </DataTable>
                    </TabPanel>

                    <TabPanel value="1">
                        <DataTable 
                            :value="history" 
                            size="small" 
                            stripedRows 
                            :loading="historyLoading"
                        >
                            <template #empty>No recent movement history found.</template>
                            
                            <Column field="created_at" header="Date">
                                <template #body="{ data }">
                                    <span class="text-sm">{{ formatDate(data.created_at) }}</span>
                                </template>
                            </Column>
                            
                            <Column field="transaction_type" header="Type">
                                <template #body="{ data }">
                                    <Tag :value="data.transaction_type" :severity="getTypeSeverity(data.transaction_type)" />
                                </template>
                            </Column>
                            
                            <Column field="location.name" header="Location" /> 
                            
                            <Column field="change_qoh" header="Change">
                                <template #body="{ data }">
                                    <span :class="data.change_qoh > 0 ? 'text-green-600 font-bold' : 'text-red-500 font-bold'">
                                        {{ data.change_qoh > 0 ? '+' : '' }}{{ data.change_qoh }}
                                    </span>
                                </template>
                            </Column>
                            <Column field="notes" header="Notes" />
                        </DataTable>
                        <p class="text-xs text-500 mt-2">Showing the 25 most recent movements. See Product Detail View for full history.</p>
                    </TabPanel>

                    <TabPanel value="2">
                        <div class="flex flex-column gap-3 p-3">
                            <div class="flex gap-2 align-items-end">
                                <span>
                                    <label for="adj-location">Location</label>
                                    <select id="adj-location" v-model="adjustLocation" class="p-inputtext">
                                        <option value="" disabled>Select Location</option>
                                        <option v-for="loc in locationOptions" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
                                    </select>
                                </span>
                                <span>
                                    <label for="adj-qty">Quantity</label>
                                    <input id="adj-qty" v-model.number="adjustQty" type="number" class="p-inputtext" style="width: 6rem" />
                                </span>
                                <span>
                                    <label for="adj-reason">Reason</label>
                                    <input id="adj-reason" v-model="adjustReason" type="text" class="p-inputtext" placeholder="Reason (optional)" />
                                </span>
                                <button class="p-button p-button-success" :disabled="adjusting" @click="doAdjustStock">Adjust</button>
                            </div>
                            <div v-if="adjustError" class="text-red-500 text-sm">{{ adjustError }}</div>
                            <div class="text-xs text-500">Positive = add stock, negative = remove. All changes are logged.</div>
                        </div>
                    </TabPanel>
                </TabPanels>
            </Tabs>
        </div>
        <div v-else>
            <p class="text-500">No product selected.</p>
        </div>
        <template #footer>
            <div class="flex justify-content-end">
                <small class="text-xs text-300">ProductInventoryDialog.vue</small>
            </div>
        </template>
    </Dialog>
</template>