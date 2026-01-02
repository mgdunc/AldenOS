<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { FilterMatchMode } from '@primevue/core/api'
import { exportToExcel } from '@/lib/exportToExcel'

// Components
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Toolbar from 'primevue/toolbar'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import LocationCreateDialog from '../components/LocationCreateDialog.vue'
import DataImportWizard from '../components/DataImportWizard.vue'

const locations = ref<any[]>([])
const loading = ref(false)
const showDialog = ref(false)
const showImportDialog = ref(false)
const selectedLocation = ref<any>(null)

const stats = ref({
    total: 0,
    sellable: 0,
    non_sellable: 0,
    default_loc: 'None'
})

const filters = ref({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS }
})

const fetchLocations = async () => {
    loading.value = true
    const { data, error } = await supabase
        .from('locations')
        .select('*')
        .order('name')
    
    if (data) {
        locations.value = data
        calculateStats(data)
    }
    loading.value = false
}

const calculateStats = (data: any[]) => {
    stats.value.total = data.length
    stats.value.sellable = data.filter(l => l.is_sellable).length
    stats.value.non_sellable = data.filter(l => !l.is_sellable).length
    const def = data.find(l => l.is_default)
    stats.value.default_loc = def ? def.name : 'None'
}

const openCreate = () => {
    selectedLocation.value = null
    showDialog.value = true
}

const openEdit = (loc: any) => {
    selectedLocation.value = loc
    showDialog.value = true
}

const exportData = async () => {
    const columns = [
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Description', key: 'description', width: 30 },
        { header: 'Is Sellable', key: 'is_sellable', width: 15 },
        { header: 'Is Default', key: 'is_default', width: 15 }
    ]
    await exportToExcel('Locations_Export', columns, locations.value)
}

onMounted(() => {
    fetchLocations()
})
</script>

<template>
    <div class="flex flex-column gap-4">
        <!-- Stats Cards -->
        <div class="grid">
            <div class="col-12 md:col-6 lg:col-3">
                <div class="surface-card shadow-2 p-3 border-round">
                    <div class="flex justify-content-between mb-3">
                        <div>
                            <span class="block text-500 font-medium mb-3">Total Locations</span>
                            <div class="text-900 font-medium text-xl">{{ stats.total }}</div>
                        </div>
                        <div class="flex align-items-center justify-content-center bg-blue-100 border-round" style="width:2.5rem;height:2.5rem">
                            <i class="pi pi-map-marker text-blue-500 text-xl"></i>
                        </div>
                    </div>
                    <span class="text-500">Warehouse bins</span>
                </div>
            </div>
            <div class="col-12 md:col-6 lg:col-3">
                <div class="surface-card shadow-2 p-3 border-round">
                    <div class="flex justify-content-between mb-3">
                        <div>
                            <span class="block text-500 font-medium mb-3">Sellable</span>
                            <div class="text-900 font-medium text-xl">{{ stats.sellable }}</div>
                        </div>
                        <div class="flex align-items-center justify-content-center bg-green-100 border-round" style="width:2.5rem;height:2.5rem">
                            <i class="pi pi-check-circle text-green-500 text-xl"></i>
                        </div>
                    </div>
                    <span class="text-500">Active for picking</span>
                </div>
            </div>
            <div class="col-12 md:col-6 lg:col-3">
                <div class="surface-card shadow-2 p-3 border-round">
                    <div class="flex justify-content-between mb-3">
                        <div>
                            <span class="block text-500 font-medium mb-3">Non-Sellable</span>
                            <div class="text-900 font-medium text-xl">{{ stats.non_sellable }}</div>
                        </div>
                        <div class="flex align-items-center justify-content-center bg-orange-100 border-round" style="width:2.5rem;height:2.5rem">
                            <i class="pi pi-lock text-orange-500 text-xl"></i>
                        </div>
                    </div>
                    <span class="text-500">Quarantine / Holding</span>
                </div>
            </div>
            <div class="col-12 md:col-6 lg:col-3">
                <div class="surface-card shadow-2 p-3 border-round">
                    <div class="flex justify-content-between mb-3">
                        <div>
                            <span class="block text-500 font-medium mb-3">Default Location</span>
                            <div class="text-900 font-medium text-xl white-space-nowrap overflow-hidden text-overflow-ellipsis" style="max-width: 12rem" :title="stats.default_loc">{{ stats.default_loc }}</div>
                        </div>
                        <div class="flex align-items-center justify-content-center bg-purple-100 border-round" style="width:2.5rem;height:2.5rem">
                            <i class="pi pi-star text-purple-500 text-xl"></i>
                        </div>
                    </div>
                    <span class="text-500">Primary receiving</span>
                </div>
            </div>
        </div>

        <div class="card shadow-2 p-4 border-round surface-card">
            <Toolbar class="mb-4 border-none p-0 bg-transparent">
                <template #start>
                    <div class="flex gap-2">
                        <Button label="New Location" icon="pi pi-plus" severity="success" @click="openCreate" />
                        <Button label="Import" icon="pi pi-download" severity="info" @click="showImportDialog = true" />
                        <Button label="Export" icon="pi pi-upload" severity="secondary" @click="exportData" />
                    </div>
                </template>
                <template #end>
                    <div class="flex gap-2">
                        <IconField iconPosition="left">
                            <InputIcon class="pi pi-search" />
                            <InputText v-model="filters['global'].value" placeholder="Search..." />
                        </IconField>
                    </div>
                </template>
            </Toolbar>

            <DataTable 
                :value="locations" 
                :loading="loading" 
                :filters="filters"
                paginator 
                :rows="20" 
                stripedRows
                class="p-datatable-sm"
            >
                <Column field="name" header="Name" sortable>
                    <template #body="{ data }">
                        <router-link :to="`/inventory/locations/${data.id}`" class="text-primary font-bold hover:underline cursor-pointer no-underline">
                            {{ data.name }}
                        </router-link>
                    </template>
                </Column>
                <Column field="description" header="Description" />
                <Column field="is_sellable" header="Type" sortable>
                    <template #body="{ data }">
                        <Tag :severity="data.is_sellable ? 'success' : 'warning'" :value="data.is_sellable ? 'Sellable' : 'Non-Sellable'" />
                    </template>
                </Column>
                <Column field="is_default" header="Default" sortable>
                    <template #body="{ data }">
                        <i v-if="data.is_default" class="pi pi-check text-green-500 font-bold"></i>
                    </template>
                </Column>
                <Column header="Actions" :exportable="false" style="min-width:8rem">
                    <template #body="{ data }">
                        <Button icon="pi pi-pencil" text rounded severity="secondary" @click="openEdit(data)" />
                    </template>
                </Column>
            </DataTable>
        </div>

        <LocationCreateDialog 
            v-model:visible="showDialog" 
            :location-to-edit="selectedLocation"
            @saved="fetchLocations"
        />

        <Dialog v-model:visible="showImportDialog" header="Import Locations" :modal="true" :style="{ width: '70vw' }" :maximizable="true" dismissableMask>
            <DataImportWizard mode="locations" />
        </Dialog>
    </div>
</template>