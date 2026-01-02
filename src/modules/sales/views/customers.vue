<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSalesOrders } from '../composables/useSalesOrders'
import type { Customer } from '../types'

// PrimeVue Components
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'

const router = useRouter()
const { loadCustomers, createCustomer, updateCustomer, saving } = useSalesOrders()

const customers = ref<Customer[]>([])
const loading = ref(true)
const showDialog = ref(false)
const editMode = ref(false)
const selectedCustomer = ref<Partial<Customer>>({})

const fetchCustomers = async () => {
  loading.value = true
  customers.value = await loadCustomers()
  loading.value = false
}

const openCreateDialog = () => {
  selectedCustomer.value = {
    name: '',
    email: '',
    phone: '',
    company: '',
    notes: ''
  }
  editMode.value = false
  showDialog.value = true
}

const openEditDialog = (customer: Customer) => {
  selectedCustomer.value = { ...customer }
  editMode.value = true
  showDialog.value = true
}

const saveCustomer = async () => {
  if (!selectedCustomer.value.name) return

  if (editMode.value && selectedCustomer.value.id) {
    const updated = await updateCustomer(selectedCustomer.value.id, selectedCustomer.value)
    if (updated) {
      const index = customers.value.findIndex(c => c.id === updated.id)
      if (index !== -1) {
        customers.value[index] = updated
      }
      showDialog.value = false
    }
  } else {
    const created = await createCustomer(selectedCustomer.value)
    if (created) {
      customers.value.unshift(created)
      showDialog.value = false
    }
  }
}

onMounted(fetchCustomers)
</script>

<template>
  <div class="flex flex-column gap-4">
    
    <div class="flex justify-content-between align-items-center">
      <div>
        <h1 class="text-3xl font-bold text-900 m-0 mb-2">Customers</h1>
        <p class="text-600 m-0">Manage customer information and contacts</p>
      </div>
      <Button 
        label="New Customer" 
        icon="pi pi-plus" 
        severity="success"
        @click="openCreateDialog"
      />
    </div>

    <div class="surface-card shadow-2 border-round p-4">
      <DataTable 
        :value="customers" 
        :loading="loading"
        stripedRows 
        paginator 
        :rows="25"
        selectionMode="single"
        dataKey="id"
        @rowDblclick="(e: any) => openEditDialog(e.data)"
      >
        <template #empty>
          <div class="p-4 text-center text-500">No customers found</div>
        </template>

        <Column field="name" header="Name" sortable>
          <template #body="{ data }">
            <div class="flex flex-column">
              <span class="font-semibold">{{ data.name }}</span>
              <span v-if="data.company" class="text-sm text-500">{{ data.company }}</span>
            </div>
          </template>
        </Column>
        
        <Column field="email" header="Email" sortable>
          <template #body="{ data }">
            <span v-if="data.email">{{ data.email }}</span>
            <span v-else class="text-300">-</span>
          </template>
        </Column>
        
        <Column field="phone" header="Phone" sortable>
          <template #body="{ data }">
            <span v-if="data.phone">{{ data.phone }}</span>
            <span v-else class="text-300">-</span>
          </template>
        </Column>

        <Column header="Actions" style="width: 10rem">
          <template #body="{ data }">
            <div class="flex gap-2">
              <Button 
                icon="pi pi-pencil" 
                text 
                rounded 
                severity="secondary"
                @click="openEditDialog(data)"
              />
              <Button 
                icon="pi pi-shopping-cart" 
                text 
                rounded 
                severity="info"
                @click="router.push({ name: 'sales-orders', query: { customer_id: data.id } })"
                v-tooltip.top="'View Orders'"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Create/Edit Dialog -->
    <Dialog 
      v-model:visible="showDialog" 
      :header="editMode ? 'Edit Customer' : 'New Customer'"
      :modal="true"
      :style="{ width: '600px' }"
      dismissableMask
    >
      <div class="flex flex-column gap-4 pt-4">
        <div class="flex flex-column gap-2">
          <label for="name" class="font-semibold">Name *</label>
          <InputText 
            id="name" 
            v-model="selectedCustomer.name" 
            placeholder="Customer name"
            autofocus
          />
        </div>

        <div class="flex flex-column gap-2">
          <label for="company" class="font-semibold">Company</label>
          <InputText 
            id="company" 
            v-model="selectedCustomer.company" 
            placeholder="Company name"
          />
        </div>

        <div class="grid">
          <div class="col-12 md:col-6">
            <div class="flex flex-column gap-2">
              <label for="email" class="font-semibold">Email</label>
              <InputText 
                id="email" 
                v-model="selectedCustomer.email" 
                type="email"
                placeholder="email@example.com"
              />
            </div>
          </div>
          
          <div class="col-12 md:col-6">
            <div class="flex flex-column gap-2">
              <label for="phone" class="font-semibold">Phone</label>
              <InputText 
                id="phone" 
                v-model="selectedCustomer.phone" 
                type="tel"
                placeholder="Phone number"
              />
            </div>
          </div>
        </div>

        <div class="flex flex-column gap-2">
          <label for="notes" class="font-semibold">Notes</label>
          <Textarea 
            id="notes" 
            v-model="selectedCustomer.notes" 
            rows="3"
            placeholder="Additional notes..."
          />
        </div>
      </div>

      <template #footer>
        <Button 
          label="Cancel" 
          severity="secondary" 
          @click="showDialog = false"
          :disabled="saving"
        />
        <Button 
          :label="editMode ? 'Update' : 'Create'" 
          severity="success" 
          @click="saveCustomer"
          :loading="saving"
          :disabled="!selectedCustomer.name"
        />
      </template>
    </Dialog>
  </div>
</template>
