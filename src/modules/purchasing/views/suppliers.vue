<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { usePurchaseOrders } from '../composables/usePurchaseOrders'
import { FilterMatchMode } from '@primevue/core/api'

// PrimeVue
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'

const toast = useToast()
const { loadSuppliers, createSupplier, loading, saving } = usePurchaseOrders()
const suppliers = ref<any[]>([])
const showDialog = ref(false)

// Form
const form = ref({
    name: '',
    contact_name: '',
    email: '',
    phone: ''
})

const filters = ref({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS }
})

const fetchSuppliers = async () => {
    const data = await loadSuppliers()
    suppliers.value = data
}

const saveSupplier = async () => {
    if (!form.value.name) return;
    
    const result = await createSupplier(form.value)
    
    if (result) {
        showDialog.value = false
        form.value = { name: '', contact_name: '', email: '', phone: '' } // Reset
        await fetchSuppliers()
    }
}

onMounted(fetchSuppliers)
</script>

<template>
    <div class="flex flex-column gap-4">
        <div class="surface-card p-4 shadow-2 border-round flex justify-content-between align-items-center">
            <h1 class="text-3xl font-bold m-0">Suppliers</h1>
            <Button label="Add Supplier" icon="pi pi-plus" @click="showDialog = true" />
        </div>

        <div class="card shadow-2 p-0 border-round overflow-hidden surface-card">
            <DataTable :value="suppliers" :loading="loading" stripedRows :filters="filters" paginator :rows="10">
                <template #header>
                    <div class="flex justify-content-end">
                        <span class="p-input-icon-left">
                            <i class="pi pi-search" />
                            <InputText v-model="filters['global'].value" placeholder="Search..." />
                        </span>
                    </div>
                </template>
                <template #empty>No suppliers found.</template>
                
                <Column field="name" header="Company Name" sortable class="font-bold" />
                <Column field="contact_name" header="Contact Person" sortable />
                <Column field="email" header="Email" />
                <Column field="phone" header="Phone" />
            </DataTable>
        </div>
    </div>

    <Dialog v-model:visible="showDialog" header="New Supplier" modal :style="{ width: '400px' }">
        <div class="flex flex-column gap-3">
            <div class="flex flex-column gap-2">
                <label class="font-bold">Company Name</label>
                <InputText v-model="form.name" />
            </div>
            <div class="flex flex-column gap-2">
                <label>Contact Person</label>
                <InputText v-model="form.contact_name" />
            </div>
            <div class="flex flex-column gap-2">
                <label>Email</label>
                <InputText v-model="form.email" />
            </div>
            <div class="flex flex-column gap-2">
                <label>Phone</label>
                <InputText v-model="form.phone" />
            </div>
        </div>
        <template #footer>
            <Button label="Cancel" text @click="showDialog = false" />
            <Button label="Save Supplier" @click="saveSupplier" :loading="processing" :disabled="!form.name" />
        </template>
    </Dialog>
</template>