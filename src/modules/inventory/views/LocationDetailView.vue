<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { FilterMatchMode } from '@primevue/core/api'

// Components
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Tag from 'primevue/tag'
import Card from 'primevue/card'
import LocationCreateDialog from '../components/LocationCreateDialog.vue'

const route = useRoute()
const router = useRouter()
const locationId = route.params.id as string

const location = ref<any>(null)
const inventory = ref<any[]>([])
const loading = ref(false)
const showEditDialog = ref(false)

const filters = ref({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS }
})

const fetchLocation = async () => {
    const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('id', locationId)
        .single()
    
    if (data) location.value = data
    else router.push('/inventory/locations')
}

const fetchInventory = async () => {
    loading.value = true
    const { data, error } = await supabase
        .from('location_inventory_view')
        .select('*')
        .eq('location_id', locationId)
        .order('product_name')
    
    if (data) inventory.value = data
    loading.value = false
}

const onLocationUpdated = () => {
    fetchLocation()
}

onMounted(() => {
    fetchLocation()
    fetchInventory()
})
</script>

<template>
    <div class="flex flex-column gap-4" v-if="location">
        <!-- Header / Details -->
        <div class="surface-card p-4 shadow-2 border-round flex justify-content-between align-items-start">
            <div>
                <div class="text-500 mb-2">Location</div>
                <div class="text-3xl font-bold text-900 mb-2">{{ location.name }}</div>
                <div class="text-500">{{ location.description || 'No description' }}</div>
                <div class="flex gap-2 mt-3">
                    <Tag :severity="location.is_sellable ? 'success' : 'warning'" :value="location.is_sellable ? 'Sellable' : 'Non-Sellable'" />
                    <Tag v-if="location.is_default" severity="info" value="Default Location" />
                </div>
            </div>
            <Button label="Edit" icon="pi pi-pencil" severity="secondary" @click="showEditDialog = true" />
        </div>

        <!-- Inventory Table -->
        <div class="card">
            <div class="flex justify-content-between align-items-center mb-4">
                <div class="text-xl font-bold">Current Stock</div>
                <IconField iconPosition="left">
                    <InputIcon class="pi pi-search" />
                    <InputText v-model="filters['global'].value" placeholder="Search SKU/Name..." />
                </IconField>
            </div>

            <DataTable 
                :value="inventory" 
                :loading="loading" 
                :filters="filters"
                :globalFilterFields="['sku', 'product_name']"
                paginator 
                :rows="20" 
                stripedRows
                class="p-datatable-sm"
            >
                <template #empty>
                    <div class="text-center p-4 text-500">No stock currently in this location.</div>
                </template>
                <Column field="sku" header="SKU" sortable>
                    <template #body="{ data }">
                        <router-link :to="`/product/${data.product_id}`" class="text-primary font-bold hover:underline cursor-pointer no-underline">
                            {{ data.sku }}
                        </router-link>
                    </template>
                </Column>
                <Column field="product_name" header="Product" sortable />
                <Column field="quantity" header="Quantity" sortable>
                    <template #body="{ data }">
                        <span :class="{'text-red-500 font-bold': data.quantity < 0, 'text-green-600 font-bold': data.quantity > 0}">
                            {{ data.quantity }}
                        </span>
                    </template>
                </Column>
            </DataTable>
        </div>

        <LocationCreateDialog 
            v-model:visible="showEditDialog" 
            :location-to-edit="location"
            @saved="onLocationUpdated"
        />
    </div>
</template>