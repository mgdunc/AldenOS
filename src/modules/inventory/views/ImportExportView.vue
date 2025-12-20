<script setup lang="ts">
import { ref } from 'vue'
import DataImportWizard from '@/modules/inventory/components/DataImportWizard.vue'
import { supabase } from '@/lib/supabase'
import { exportToExcel } from '@/lib/exportToExcel'
import Button from 'primevue/button'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Card from 'primevue/card'

const exporting = ref(false)

const exportData = async () => {
    exporting.value = true
    try {
        // Fetch ALL data for export
        const { data } = await supabase
            .from('product_inventory_view')
            .select('*')
            .order('sku')
        
        if (!data) return

        const columns = [
            { header: 'SKU', key: 'sku', width: 15 },
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Status', key: 'status', width: 10 },
            { header: 'On Hand', key: 'total_qoh', width: 10 },
            { header: 'Available', key: 'total_available', width: 10 },
            { header: 'Reserved', key: 'total_reserved', width: 10 },
            { header: 'Cost', key: 'cost_price', width: 10 },
            { header: 'Price', key: 'list_price', width: 10 }
        ]

        await exportToExcel('Inventory_Export', columns, data)
    } finally {
        exporting.value = false
    }
}
</script>

<template>
    <div class="p-4">
        <div class="mb-4">
            <h2 class="text-2xl font-bold m-0">Import / Export</h2>
            <p class="text-gray-600 mt-1">Manage bulk data operations for products and inventory.</p>
        </div>

        <div class="card">
            <Tabs value="0">
                <TabList>
                    <Tab value="0">Import Products</Tab>
                    <Tab value="1">Import Inventory</Tab>
                    <Tab value="2">Export Data</Tab>
                </TabList>
                <TabPanels>
                    <TabPanel value="0">
                        <div class="p-3">
                            <p class="mb-4 text-gray-600">Upload a CSV file to create or update products in bulk.</p>
                            <DataImportWizard mode="products" />
                        </div>
                    </TabPanel>
                    <TabPanel value="1">
                        <div class="p-3">
                            <p class="mb-4 text-gray-600">Upload a CSV file to adjust inventory levels for existing products.</p>
                            <DataImportWizard mode="inventory" />
                        </div>
                    </TabPanel>
                    <TabPanel value="2">
                        <div class="p-3">
                            <p class="mb-4 text-gray-600">Download a complete report of all products and their current inventory status.</p>
                            <Button 
                                label="Export Inventory to Excel" 
                                icon="pi pi-download" 
                                :loading="exporting"
                                @click="exportData" 
                            />
                        </div>
                    </TabPanel>
                </TabPanels>
            </Tabs>
        </div>
    </div>
</template>
