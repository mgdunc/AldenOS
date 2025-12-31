<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSupplierStock, type ImportResult } from '../composables/useSupplierStock'
import { useInventory } from '../composables/useInventory'
import * as XLSX from 'xlsx'
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
import Stepper from 'primevue/stepper'
import StepList from 'primevue/steplist'
import StepPanels from 'primevue/steppanels'
import StepItem from 'primevue/stepitem'
import Step from 'primevue/step'
import StepPanel from 'primevue/steppanel'

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

// Column mapping
const fileHeaders = ref<string[]>([])
const previewData = ref<any[]>([])
const skuColumn = ref<string | null>(null)
const qtyColumn = ref<string | null>(null)
const nameColumn = ref<string | null>(null)
const parsing = ref(false)

// Results
const importResult = ref<ImportResult | null>(null)
const activeStep = ref(1)

// Data
const suppliers = ref<any[]>([])

const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

// Common column name patterns for auto-detection
const SKU_PATTERNS = ['sku', 'supplier_sku', 'supplier sku', 'part number', 'part no', 'item code', 'item number', 'code', 'product code', 'article', 'ref']
const QTY_PATTERNS = ['quantity', 'qty', 'stock', 'available', 'on hand', 'in stock', 'count', 'amount', 'units']
const NAME_PATTERNS = ['name', 'product name', 'product', 'description', 'title', 'item', 'item name']

const autoDetectColumn = (headers: string[], patterns: string[]): string | null => {
  for (const header of headers) {
    const normalized = header.toLowerCase().trim()
    for (const pattern of patterns) {
      if (normalized === pattern || normalized.includes(pattern)) {
        return header
      }
    }
  }
  return null
}

watch(() => props.visible, async (visible) => {
  if (visible) {
    // Reset state
    selectedFile.value = null
    supplierId.value = null
    stockDate.value = new Date()
    importResult.value = null
    activeStep.value = 1
    fileHeaders.value = []
    previewData.value = []
    skuColumn.value = null
    qtyColumn.value = null
    nameColumn.value = null
    
    // Load suppliers
    const suppData = await loadSuppliers()
    suppliers.value = suppData || []
  }
})

const onFileSelect = async (event: any) => {
  const files = event.files
  if (files && files.length > 0) {
    selectedFile.value = files[0]
    await parseFileHeaders(files[0])
  }
}

const onFileClear = () => {
  selectedFile.value = null
  fileHeaders.value = []
  previewData.value = []
  skuColumn.value = null
  qtyColumn.value = null
  nameColumn.value = null
}

const parseFileHeaders = async (file: File) => {
  parsing.value = true
  try {
    const arrayBuffer = await file.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    const workbook = XLSX.read(data, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const rows: any[] = XLSX.utils.sheet_to_json(worksheet)

    if (rows.length > 0) {
      // Extract headers
      fileHeaders.value = Object.keys(rows[0])
      console.debug('[SupplierStockUpload] Parsed headers:', fileHeaders.value)
      // Store preview data (first 5 rows)
      previewData.value = rows.slice(0, 5)

      // Auto-detect columns
      skuColumn.value = autoDetectColumn(fileHeaders.value, SKU_PATTERNS)
      qtyColumn.value = autoDetectColumn(fileHeaders.value, QTY_PATTERNS)
      nameColumn.value = autoDetectColumn(fileHeaders.value, NAME_PATTERNS)
    } else {
      fileHeaders.value = []
      previewData.value = []
      showNoColumnsError()
    }
    if (fileHeaders.value.length === 0) {
      showNoColumnsError()
    }
  } catch (e) {
    console.error('Error parsing file:', e)
    showNoColumnsError()
  } finally {
    parsing.value = false
  }
// User-facing error for missing columns
import { useToast } from 'primevue/usetoast'
const toast = useToast()
function showNoColumnsError() {
  toast.add({
    severity: 'error',
    summary: 'No Columns Detected',
    detail: 'No columns were detected in the uploaded file. Please ensure the first row contains column headers and the file is a valid CSV or Excel format.',
    life: 7000
  })
}
}

const canProceedToMapping = computed(() => {
  return selectedFile.value !== null && fileHeaders.value.length > 0 && !parsing.value
})

const canProceedToImport = computed(() => {
  return skuColumn.value !== null && qtyColumn.value !== null
})

const goToMapping = () => {
  if (canProceedToMapping.value) {
    activeStep.value = 2
  }
}

const formatStockDate = (date: Date) => {
  return date.toISOString().split('T')[0]
}

const handleUpload = async () => {
  if (!selectedFile.value || !skuColumn.value || !qtyColumn.value) return

  const result = await importStockFile(selectedFile.value, {
    supplierId: supplierId.value || undefined,
    stockDate: formatStockDate(stockDate.value),
    skuColumn: skuColumn.value,
    qtyColumn: qtyColumn.value,
    nameColumn: nameColumn.value || 'Product Name'
  })

  importResult.value = result
  activeStep.value = 3

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
  activeStep.value = 1
  fileHeaders.value = []
  previewData.value = []
  skuColumn.value = null
  qtyColumn.value = null
  nameColumn.value = null
}

const closeDialog = () => {
  dialogVisible.value = false
}

// Get preview value for a column
const getPreviewValue = (column: string): string => {
  if (previewData.value.length === 0) return '-'
  const val = previewData.value[0][column]
  return val !== undefined ? String(val) : '-'
}
</script>

<template>
  <Dialog
    v-model:visible="dialogVisible"
    header="Upload Supplier Stock File"
    :style="{ width: '800px' }"
    :modal="true"
    :closable="!uploading"
  >
    <Stepper v-model:value="activeStep" linear>
      <StepList>
        <StepItem :value="1">
          <Step>Upload File</Step>
        </StepItem>
        <StepItem :value="2">
          <Step>Map Columns</Step>
        </StepItem>
        <StepItem :value="3">
          <Step>Results</Step>
        </StepItem>
      </StepList>

      <StepPanels>
        <!-- STEP 1: UPLOAD FILE -->
        <StepPanel :value="1">
          <div class="flex flex-column gap-4 p-2">
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

            <!-- Parsing indicator -->
            <div v-if="parsing" class="flex align-items-center gap-2 text-500">
              <i class="pi pi-spin pi-spinner"></i>
              <span>Reading file...</span>
            </div>

            <!-- File preview info -->
            <div v-if="fileHeaders.length > 0" class="surface-ground border-round p-3">
              <div class="flex align-items-center gap-2 mb-2">
                <i class="pi pi-check-circle text-green-500"></i>
                <span class="font-medium">File loaded successfully</span>
              </div>
              <div class="text-sm text-600">
                Found <strong>{{ fileHeaders.length }}</strong> columns: 
                <span class="text-500">{{ fileHeaders.slice(0, 5).join(', ') }}{{ fileHeaders.length > 5 ? '...' : '' }}</span>
              </div>
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

            <div class="flex justify-content-end pt-2">
              <Button 
                label="Next: Map Columns" 
                icon="pi pi-arrow-right" 
                iconPos="right"
                @click="goToMapping" 
                :disabled="!canProceedToMapping" 
              />
            </div>
          </div>
        </StepPanel>

        <!-- STEP 2: MAP COLUMNS -->
        <StepPanel :value="2">
          <div class="flex flex-column gap-4 p-2">
            <Message severity="info" :closable="false">
              <div class="flex align-items-center gap-2">
                <i class="pi pi-info-circle"></i>
                <span>Select which columns from your file contain the SKU, Quantity, and Product Name.</span>
              </div>
            </Message>

            <!-- Column Mapping -->
            <div class="grid">
              <div class="col-12 md:col-4">
                <div class="surface-card border-round p-3 h-full border-left-3" :class="skuColumn ? 'border-green-500' : 'border-orange-500'">
                  <label class="block font-bold text-700 mb-2">
                    <i class="pi pi-key mr-2"></i>SKU Column <span class="text-red-500">*</span>
                  </label>
                  <Select
                    v-model="skuColumn"
                    :options="fileHeaders"
                    placeholder="Select column..."
                    showClear
                    class="w-full"
                  />
                  <div v-if="skuColumn" class="mt-2 text-sm">
                    <span class="text-500">Sample: </span>
                    <span class="font-mono">{{ getPreviewValue(skuColumn) }}</span>
                  </div>
                </div>
              </div>
              
              <div class="col-12 md:col-4">
                <div class="surface-card border-round p-3 h-full border-left-3" :class="qtyColumn ? 'border-green-500' : 'border-orange-500'">
                  <label class="block font-bold text-700 mb-2">
                    <i class="pi pi-hashtag mr-2"></i>Quantity Column <span class="text-red-500">*</span>
                  </label>
                  <Select
                    v-model="qtyColumn"
                    :options="fileHeaders"
                    placeholder="Select column..."
                    showClear
                    class="w-full"
                  />
                  <div v-if="qtyColumn" class="mt-2 text-sm">
                    <span class="text-500">Sample: </span>
                    <span class="font-mono">{{ getPreviewValue(qtyColumn) }}</span>
                  </div>
                </div>
              </div>
              
              <div class="col-12 md:col-4">
                <div class="surface-card border-round p-3 h-full border-left-3 border-gray-300">
                  <label class="block font-bold text-700 mb-2">
                    <i class="pi pi-tag mr-2"></i>Name Column <span class="text-400">(optional)</span>
                  </label>
                  <Select
                    v-model="nameColumn"
                    :options="fileHeaders"
                    placeholder="Select column..."
                    showClear
                    class="w-full"
                  />
                  <div v-if="nameColumn" class="mt-2 text-sm">
                    <span class="text-500">Sample: </span>
                    <span class="font-mono text-overflow-ellipsis overflow-hidden white-space-nowrap block" style="max-width: 150px;">{{ getPreviewValue(nameColumn) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Data Preview -->
            <div>
              <div class="font-medium text-700 mb-2">Data Preview (first 5 rows)</div>
              <DataTable :value="previewData" size="small" stripedRows scrollable scrollHeight="200px" class="text-sm">
                <Column v-for="header in fileHeaders.slice(0, 8)" :key="header" :field="header" :header="header">
                  <template #header>
                    <div class="flex align-items-center gap-1">
                      <span>{{ header }}</span>
                      <Tag v-if="header === skuColumn" value="SKU" severity="success" class="text-xs" />
                      <Tag v-else-if="header === qtyColumn" value="QTY" severity="info" class="text-xs" />
                      <Tag v-else-if="header === nameColumn" value="NAME" severity="secondary" class="text-xs" />
                    </div>
                  </template>
                </Column>
              </DataTable>
              <small v-if="fileHeaders.length > 8" class="text-500 mt-1 block">
                Showing first 8 of {{ fileHeaders.length }} columns
              </small>
            </div>

            <!-- Upload Progress -->
            <ProgressBar v-if="uploading" mode="indeterminate" style="height: 6px" />

            <div class="flex justify-content-between pt-2">
              <Button 
                label="Back" 
                icon="pi pi-arrow-left" 
                severity="secondary"
                text
                @click="activeStep = 1" 
                :disabled="uploading"
              />
              <Button 
                label="Import" 
                icon="pi pi-upload" 
                @click="handleUpload" 
                :disabled="!canProceedToImport"
                :loading="uploading"
              />
            </div>
          </div>
        </StepPanel>

        <!-- STEP 3: RESULTS -->
        <StepPanel :value="3">
          <div class="flex flex-column gap-4 p-2">
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
                <DataTable :value="importResult.matched" size="small" :rows="10" paginator stripedRows scrollable scrollHeight="250px">
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
                <DataTable :value="importResult.unmatched" size="small" :rows="10" paginator stripedRows scrollable scrollHeight="250px">
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

            <div class="flex justify-content-between pt-2">
              <Button 
                label="Upload Another" 
                icon="pi pi-refresh" 
                severity="secondary"
                text
                @click="resetDialog" 
              />
              <Button 
                label="Close" 
                @click="closeDialog" 
              />
            </div>
          </div>
        </StepPanel>
      </StepPanels>
    </Stepper>
  </Dialog>
</template>

