<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSupplierStock, type ImportResult } from '../composables/useSupplierStock'
import { useInventory } from '../composables/useInventory'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import FileUpload from 'primevue/fileupload'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import InputText from 'primevue/inputtext'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import TabView from 'primevue/tabview'
import TabPanel from 'primevue/tabpanel'
import Message from 'primevue/message'
import ProgressBar from 'primevue/progressbar'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'imported'): void
}>()

const { importStockFile, uploading, exportUnmatchedCsv } = useSupplierStock()
const { loadSuppliers } = useInventory()

// Form state
const selectedFile = ref<File | null>(null)
const supplierId = ref<string | null>(null)
const stockDate = ref<Date>(new Date())
const skuColumn = ref('SKU')
const qtyColumn = ref('Quantity')
const nameColumn = ref('Product Name')
const showAdvanced = ref(false)

// Results
const importResult = ref<ImportResult | null>(null)
const step = ref<'upload' | 'results'>('upload')

// Data
const suppliers = ref<any[]>([])

const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

watch(() => props.visible, async (visible) => {
  if (visible) {
    // Reset state
    selectedFile.value = null
    supplierId.value = null
    stockDate.value = new Date()
    importResult.value = null
    step.value = 'upload'
    showAdvanced.value = false
    
    // Load suppliers
    const suppData = await loadSuppliers()
    suppliers.value = suppData || []
  }
})

const onFileSelect = (event: any) => {
  const files = event.files
  if (files && files.length > 0) {
    selectedFile.value = files[0]
  }
}

const onFileClear = () => {
  selectedFile.value = null
}

const canUpload = computed(() => {
  return selectedFile.value !== null && !uploading.value
})

const formatStockDate = (date: Date) => {
  return date.toISOString().split('T')[0]
}

const handleUpload = async () => {
  if (!selectedFile.value) return

  const result = await importStockFile(selectedFile.value, {
    supplierId: supplierId.value || undefined,
    stockDate: formatStockDate(stockDate.value),
    skuColumn: skuColumn.value,
    qtyColumn: qtyColumn.value,
    nameColumn: nameColumn.value
  })

  importResult.value = result
  step.value = 'results'

  if (result.success) {
    emit('imported')
  }
}

const downloadUnmatched = () => {
  if (importResult.value?.unmatched) {
    exportUnmatchedCsv(
      importResult.value.unmatched.map((u, i) => ({
        id: String(i),
        upload_id: importResult.value?.uploadId || '',
        supplier_sku: u.sku,
        product_name: u.productName || null,
        quantity: u.quantity,
        raw_data: null
      })),
      `unmatched-${formatStockDate(stockDate.value)}.csv`
    )
  }
}

const resetDialog = () => {
  selectedFile.value = null
  importResult.value = null
  step.value = 'upload'
}

const closeDialog = () => {
  dialogVisible.value = false
}
</script>

<template>
  <Dialog
    v-model:visible="dialogVisible"
    :header="step === 'upload' ? 'Upload Supplier Stock File' : 'Import Results'"
    :style="{ width: '700px' }"
    :modal="true"
    :closable="!uploading"
  >
    <!-- UPLOAD STEP -->
    <div v-if="step === 'upload'" class="flex flex-column gap-4">
      <!-- File Upload -->
      <div>
        <label class="block font-medium text-700 mb-2">Stock File</label>
        <FileUpload
          mode="basic"
          accept=".xlsx,.xls,.csv"
          :maxFileSize="10000000"
          chooseLabel="Select File"
          @select="onFileSelect"
          @clear="onFileClear"
          :auto="false"
          class="w-full"
        />
        <small class="text-500 mt-1 block">Supported formats: Excel (.xlsx, .xls) or CSV</small>
      </div>

      <!-- Stock Date -->
      <div>
        <label class="block font-medium text-700 mb-2">Stock Date</label>
        <DatePicker
          v-model="stockDate"
          dateFormat="dd/mm/yy"
          showIcon
          :maxDate="new Date()"
          class="w-full"
        />
        <small class="text-500 mt-1 block">The date this stock level was reported</small>
      </div>

      <!-- Supplier (Optional) -->
      <div>
        <label class="block font-medium text-700 mb-2">Supplier (Optional)</label>
        <Select
          v-model="supplierId"
          :options="suppliers"
          optionLabel="name"
          optionValue="id"
          placeholder="Select supplier..."
          showClear
          filter
          class="w-full"
        />
      </div>

      <!-- Advanced Options -->
      <div>
        <Button
          :label="showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options'"
          icon="pi pi-cog"
          text
          size="small"
          @click="showAdvanced = !showAdvanced"
        />
        
        <div v-if="showAdvanced" class="surface-ground border-round p-3 mt-2">
          <div class="text-sm text-500 mb-3">Column mappings (if different from defaults)</div>
          <div class="grid">
            <div class="col-4">
              <label class="block text-sm font-medium text-700 mb-1">SKU Column</label>
              <InputText v-model="skuColumn" class="w-full" placeholder="SKU" />
            </div>
            <div class="col-4">
              <label class="block text-sm font-medium text-700 mb-1">Quantity Column</label>
              <InputText v-model="qtyColumn" class="w-full" placeholder="Quantity" />
            </div>
            <div class="col-4">
              <label class="block text-sm font-medium text-700 mb-1">Name Column</label>
              <InputText v-model="nameColumn" class="w-full" placeholder="Product Name" />
            </div>
          </div>
        </div>
      </div>

      <!-- Upload Progress -->
      <ProgressBar v-if="uploading" mode="indeterminate" style="height: 6px" />
    </div>

    <!-- RESULTS STEP -->
    <div v-else-if="step === 'results'" class="flex flex-column gap-4">
      <!-- Summary -->
      <div v-if="importResult?.success" class="grid">
        <div class="col-4">
          <div class="surface-card border-round p-3 text-center">
            <div class="text-3xl font-bold text-primary">{{ importResult.totalRows }}</div>
            <div class="text-500 text-sm">Total Rows</div>
          </div>
        </div>
        <div class="col-4">
          <div class="surface-card border-round p-3 text-center">
            <div class="text-3xl font-bold text-green-600">{{ importResult.matchedCount }}</div>
            <div class="text-500 text-sm">Matched</div>
          </div>
        </div>
        <div class="col-4">
          <div class="surface-card border-round p-3 text-center">
            <div class="text-3xl font-bold" :class="importResult.unmatchedCount > 0 ? 'text-orange-500' : 'text-500'">
              {{ importResult.unmatchedCount }}
            </div>
            <div class="text-500 text-sm">Unmatched</div>
          </div>
        </div>
      </div>

      <!-- Error Message -->
      <Message v-if="importResult?.error" severity="error" :closable="false">
        {{ importResult.error }}
      </Message>

      <!-- Success Message -->
      <Message v-else-if="importResult?.success" severity="success" :closable="false">
        Successfully imported stock levels for {{ importResult.matchedCount }} products.
      </Message>

      <!-- Tabs for Matched/Unmatched -->
      <TabView v-if="importResult?.success && (importResult.matchedCount > 0 || importResult.unmatchedCount > 0)">
        <TabPanel>
          <template #header>
            <span class="flex align-items-center gap-2">
              <i class="pi pi-check-circle text-green-500"></i>
              <span>Matched ({{ importResult.matchedCount }})</span>
            </span>
          </template>
          <DataTable :value="importResult.matched" size="small" :rows="10" paginator stripedRows scrollable scrollHeight="300px">
            <Column field="sku" header="Supplier SKU" sortable />
            <Column field="productName" header="Product" sortable />
            <Column field="quantity" header="Qty" sortable style="width: 100px">
              <template #body="{ data }">
                <span class="font-bold">{{ data.quantity }}</span>
              </template>
            </Column>
          </DataTable>
        </TabPanel>
        
        <TabPanel v-if="importResult.unmatchedCount > 0">
          <template #header>
            <span class="flex align-items-center gap-2">
              <i class="pi pi-exclamation-triangle text-orange-500"></i>
              <span>Unmatched ({{ importResult.unmatchedCount }})</span>
            </span>
          </template>
          <div class="flex justify-content-end mb-2">
            <Button
              label="Download CSV"
              icon="pi pi-download"
              size="small"
              severity="secondary"
              outlined
              @click="downloadUnmatched"
            />
          </div>
          <DataTable :value="importResult.unmatched" size="small" :rows="10" paginator stripedRows scrollable scrollHeight="300px">
            <Column field="sku" header="Supplier SKU" sortable />
            <Column field="productName" header="Product Name" sortable />
            <Column field="quantity" header="Qty" sortable style="width: 100px" />
          </DataTable>
          <Message severity="info" :closable="false" class="mt-3">
            <div class="flex align-items-center gap-2">
              <i class="pi pi-info-circle"></i>
              <span>To match these products, add the Supplier SKU to each product in the system.</span>
            </div>
          </Message>
        </TabPanel>
      </TabView>
    </div>

    <template #footer>
      <div class="flex justify-content-between w-full">
        <div>
          <Button
            v-if="step === 'results'"
            label="Upload Another"
            icon="pi pi-refresh"
            severity="secondary"
            text
            @click="resetDialog"
          />
        </div>
        <div class="flex gap-2">
          <Button label="Close" severity="secondary" text @click="closeDialog" :disabled="uploading" />
          <Button
            v-if="step === 'upload'"
            label="Upload & Import"
            icon="pi pi-upload"
            @click="handleUpload"
            :disabled="!canUpload"
            :loading="uploading"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>

