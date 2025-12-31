<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSupplierStock, type SupplierStockUpload, type UnmatchedItem } from '../composables/useSupplierStock'
import SupplierStockUploadDialog from '../components/SupplierStockUploadDialog.vue'

// PrimeVue
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import ConfirmDialog from 'primevue/confirmdialog'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'


const { 
  loading, 
  uploads, 
  unmatchedItems,
  loadUploads, 
  loadUnmatchedItems,
  deleteUpload,
  exportUnmatchedCsv
} = useSupplierStock()

const confirm = useConfirm()
const showUploadDialog = ref(false)
const showUnmatchedDialog = ref(false)
const selectedUpload = ref<SupplierStockUpload | null>(null)

onMounted(() => {
  loadUploads()
})

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

const formatDateTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const getStatusSeverity = (status: string) => {
  switch (status) {
    case 'completed': return 'success'
    case 'processing': return 'info'
    case 'failed': return 'danger'
    default: return 'secondary'
  }
}

const viewUnmatched = async (upload: SupplierStockUpload) => {
  selectedUpload.value = upload
  await loadUnmatchedItems(upload.id)
  showUnmatchedDialog.value = true
}

const downloadUnmatched = () => {
  if (selectedUpload.value) {
    exportUnmatchedCsv(
      unmatchedItems.value,
      `unmatched-${selectedUpload.value.stock_date}.csv`
    )
  }
}

const confirmDelete = (upload: SupplierStockUpload) => {
  confirm.require({
    message: `Delete upload from ${formatDate(upload.stock_date)}? This will remove all associated stock levels.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    accept: () => deleteUpload(upload.id)
  })
}

const onImported = () => {
  loadUploads()
}
</script>

<template>
  <div class="flex flex-column gap-4">
    <!-- Header -->
    <div class="flex align-items-center justify-content-between">
      <div>
        <h1 class="text-2xl font-bold m-0 text-900">Supplier Stock</h1>
        <p class="text-500 m-0 mt-1">Upload and track supplier inventory levels</p>
      </div>
      <div class="flex gap-2">
        <Button 
          icon="pi pi-refresh" 
          outlined 
          rounded 
          @click="loadUploads" 
          :loading="loading" 
          v-tooltip="'Refresh'"
        />
        <Button 
          label="Upload Stock File" 
          icon="pi pi-upload" 
          @click="showUploadDialog = true" 
        />
      </div>
    </div>

    <!-- Upload History Table -->
    <div class="surface-card shadow-2 border-round">
      <DataTable
        :value="uploads"
        :loading="loading"
        stripedRows
        paginator
        :rows="20"
        dataKey="id"
        responsiveLayout="scroll"
      >
        <template #empty>
          <div class="flex flex-column align-items-center gap-3 py-6">
            <i class="pi pi-cloud-upload text-4xl text-300"></i>
            <div class="text-center">
              <p class="text-600 font-medium mb-1">No uploads yet</p>
              <p class="text-500 text-sm">Upload your first supplier stock file to get started</p>
            </div>
            <Button label="Upload Stock File" icon="pi pi-upload" @click="showUploadDialog = true" />
          </div>
        </template>

        <Column field="stock_date" header="Stock Date" sortable style="width: 120px">
          <template #body="{ data }">
            <span class="font-medium">{{ formatDate(data.stock_date) }}</span>
          </template>
        </Column>

        <Column field="file_name" header="File" sortable>
          <template #body="{ data }">
            <div class="flex align-items-center gap-2">
              <i class="pi pi-file-excel text-green-600"></i>
              <span class="text-sm">{{ data.file_name || 'Unknown' }}</span>
            </div>
          </template>
        </Column>

        <Column field="suppliers.name" header="Supplier">
          <template #body="{ data }">
            <span>{{ data.suppliers?.name || '-' }}</span>
          </template>
        </Column>

        <Column field="status" header="Status" style="width: 110px">
          <template #body="{ data }">
            <Tag :value="data.status" :severity="getStatusSeverity(data.status)" />
          </template>
        </Column>

        <Column header="Results" style="width: 200px">
          <template #body="{ data }">
            <div class="flex align-items-center gap-3">
              <div class="flex align-items-center gap-1">
                <i class="pi pi-check-circle text-green-500 text-sm"></i>
                <span class="text-sm font-medium">{{ data.matched_count }}</span>
              </div>
              <div 
                v-if="data.unmatched_count > 0" 
                class="flex align-items-center gap-1 cursor-pointer hover:text-primary"
                @click="viewUnmatched(data)"
              >
                <i class="pi pi-exclamation-triangle text-orange-500 text-sm"></i>
                <span class="text-sm font-medium text-orange-600">{{ data.unmatched_count }}</span>
              </div>
              <span class="text-400 text-sm">/ {{ data.total_rows }}</span>
            </div>
          </template>
        </Column>

        <Column field="upload_date" header="Uploaded" sortable style="width: 160px">
          <template #body="{ data }">
            <span class="text-sm text-500">{{ formatDateTime(data.upload_date) }}</span>
          </template>
        </Column>

        <Column style="width: 80px">
          <template #body="{ data }">
            <Button 
              icon="pi pi-trash" 
              severity="danger" 
              text 
              rounded 
              @click="confirmDelete(data)"
              v-tooltip="'Delete'"
            />
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Upload Dialog -->
    <SupplierStockUploadDialog
      v-model:visible="showUploadDialog"
      @imported="onImported"
    />

    <!-- Unmatched Items Dialog -->
    <Dialog
      v-model:visible="showUnmatchedDialog"
      header="Unmatched Products"
      :style="{ width: '600px' }"
      :modal="true"
    >
      <div v-if="selectedUpload" class="mb-3">
        <div class="text-500 text-sm">
          From upload on {{ formatDate(selectedUpload.stock_date) }} ({{ selectedUpload.file_name }})
        </div>
      </div>

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

      <DataTable :value="unmatchedItems" size="small" :rows="10" paginator stripedRows>
        <Column field="supplier_sku" header="Supplier SKU" sortable />
        <Column field="product_name" header="Product Name" sortable />
        <Column field="quantity" header="Qty" sortable style="width: 80px" />
      </DataTable>

      <template #footer>
        <Button label="Close" severity="secondary" text @click="showUnmatchedDialog = false" />
      </template>
    </Dialog>

    <ConfirmDialog />
  </div>
</template>

