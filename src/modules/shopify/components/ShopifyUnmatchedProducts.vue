<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Toolbar from 'primevue/toolbar'
import { formatCurrency } from '@/lib/formatCurrency'

const props = defineProps<{
    integrationId: string
}>()

const toast = useToast()
const loading = ref(false)
const importing = ref(false)
const unmatchedProducts = ref<any[]>([])
const selectedProducts = ref<any[]>([])

const fetchUnmatched = async () => {
    if (!props.integrationId) return
    
    loading.value = true
    const { data, error } = await supabase
        .from('integration_unmatched_products')
        .select('*')
        .eq('integration_id', props.integrationId)
        .order('created_at', { ascending: false })
        
    if (error) {
        console.error('Error fetching unmatched:', error)
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load unmatched products' })
    } else {
        unmatchedProducts.value = data || []
    }
    loading.value = false
}

watch(() => props.integrationId, () => {
    fetchUnmatched()
})

const importSelected = async () => {
    if (selectedProducts.value.length === 0) return
    
    importing.value = true
    const ids = selectedProducts.value.map(p => p.id)
    
    const { data, error } = await supabase.rpc('import_unmatched_products', {
        p_unmatched_ids: ids,
        p_supplier_id: null // Optional: Add supplier selection later
    })
    
    if (error) {
        console.error('Import error:', error)
        toast.add({ severity: 'error', summary: 'Import Failed', detail: error.message })
    } else {
        toast.add({ severity: 'success', summary: 'Import Successful', detail: `Imported ${data} products.` })
        selectedProducts.value = []
        fetchUnmatched()
    }
    importing.value = false
}

const importAll = async () => {
    if (unmatchedProducts.value.length === 0) return
    selectedProducts.value = [...unmatchedProducts.value]
    await importSelected()
}

const deleteSelected = async () => {
    if (selectedProducts.value.length === 0) return
    
    importing.value = true
    const ids = selectedProducts.value.map(p => p.id)
    
    const { error } = await supabase
        .from('integration_unmatched_products')
        .delete()
        .in('id', ids)
    
    if (error) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete products' })
    } else {
        toast.add({ severity: 'success', summary: 'Deleted', detail: `Removed ${ids.length} products` })
        selectedProducts.value = []
        fetchUnmatched()
    }
    importing.value = false
}

onMounted(() => {
    fetchUnmatched()
})
</script>

<template>
    <div class="card">
        <Toolbar class="mb-4">
            <template #start>
                <div class="flex gap-2">
                    <Button 
                        label="Import Selected" 
                        icon="pi pi-plus" 
                        severity="success" 
                        :disabled="!selectedProducts || selectedProducts.length === 0" 
                        :loading="importing"
                        @click="importSelected"
                    />
                    <Button 
                        label="Import All" 
                        icon="pi pi-check-circle" 
                        severity="success" 
                        outlined
                        :disabled="unmatchedProducts.length === 0" 
                        :loading="importing"
                        @click="importAll"
                    />
                    <Button 
                        label="Delete Selected" 
                        icon="pi pi-trash" 
                        severity="danger" 
                        outlined
                        :disabled="!selectedProducts || selectedProducts.length === 0" 
                        :loading="importing"
                        @click="deleteSelected"
                    />
                </div>
            </template>
            <template #end>
                <Button 
                    icon="pi pi-refresh" 
                    text 
                    rounded 
                    @click="fetchUnmatched" 
                    :loading="loading"
                />
            </template>
        </Toolbar>

        <DataTable 
            v-model:selection="selectedProducts" 
            :value="unmatchedProducts" 
            dataKey="id" 
            :paginator="true" 
            :rows="10"
            :loading="loading"
            tableStyle="min-width: 50rem"
        >
            <template #empty>No unmatched products found.</template>
            
            <Column selectionMode="multiple" headerStyle="width: 3rem"></Column>
            
            <Column field="sku" header="SKU" sortable></Column>
            
            <Column field="variant_name" header="Name" sortable>
                <template #body="slotProps">
                    <div class="flex flex-column">
                        <span class="font-bold">{{ slotProps.data.variant_name }}</span>
                        <span class="text-sm text-500">ID: {{ slotProps.data.external_variant_id }}</span>
                    </div>
                </template>
            </Column>
            
            <Column field="price" header="Price" sortable>
                <template #body="slotProps">
                    {{ formatCurrency(slotProps.data.price) }}
                </template>
            </Column>
            
            <Column header="Status">
                <template #body>
                    <Tag value="Unmatched" severity="warning" />
                </template>
            </Column>
        </DataTable>
    </div>
</template>
