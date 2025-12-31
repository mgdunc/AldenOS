<script setup lang="ts">
import { ref } from 'vue'
import DataImportWizard from '@/modules/inventory/components/DataImportWizard.vue'
import { supabase } from '@/lib/supabase'
import { exportToExcel } from '@/lib/exportToExcel'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Card from 'primevue/card'

const toast = useToast()
const exporting = ref(false)

const exportData = async () => {
    exporting.value = true
    try {
        // Fetch ALL product data with inventory stats and supplier info
        const { data: viewData, error: viewError } = await supabase
            .from('product_inventory_view')
            .select('*')
            .order('sku')
        
        if (viewError) throw viewError
        if (!viewData) return

        // Fetch additional product fields not in the view (supplier_id, supplier_sku, carton_barcode, shopify IDs)
        const { data: productDetails, error: productError } = await supabase
            .from('products')
            .select('id, supplier_id, supplier_sku, carton_barcode, shopify_product_id, shopify_variant_id, created_at, updated_at')
            .order('sku')
        
        if (productError) throw productError

        // Fetch suppliers for name lookup
        const { data: suppliers } = await supabase
            .from('suppliers')
            .select('id, name')

        const supplierMap = new Map(suppliers?.map(s => [s.id, s.name]) || [])
        const detailsMap = new Map(productDetails?.map(p => [p.id, p]) || [])

        // Merge data
        const exportRows = viewData.map(row => {
            const details = detailsMap.get(row.product_id) || {}
            return {
                ...row,
                supplier_sku: details.supplier_sku || '',
                carton_barcode: details.carton_barcode || '',
                supplier_name: details.supplier_id ? (supplierMap.get(details.supplier_id) || '') : '',
                shopify_product_id: details.shopify_product_id || '',
                shopify_variant_id: details.shopify_variant_id || '',
                created_at: details.created_at || '',
                updated_at: details.updated_at || ''
            }
        })

        const columns = [
            // Core Product Info
            { header: 'SKU', key: 'sku', width: 15 },
            { header: 'Name', key: 'name', width: 35 },
            { header: 'Description', key: 'description', width: 40 },
            { header: 'Status', key: 'status', width: 10 },
            
            // Inventory Levels
            { header: 'On Hand', key: 'qoh', width: 10 },
            { header: 'Available', key: 'available', width: 10 },
            { header: 'Reserved', key: 'reserved', width: 10 },
            { header: 'On Order', key: 'on_order', width: 10 },
            { header: 'Demand', key: 'demand', width: 10 },
            { header: 'Net Required', key: 'net_required', width: 12 },
            { header: 'Supplier Stock', key: 'supplier_available', width: 14 },
            
            // Pricing
            { header: 'Cost Price', key: 'cost_price', width: 12 },
            { header: 'List Price', key: 'list_price', width: 12 },
            { header: 'Compare At Price', key: 'compare_at_price', width: 15 },
            { header: 'Retail Price', key: 'retail_price', width: 12 },
            
            // Identifiers
            { header: 'Barcode (UPC/EAN)', key: 'barcode', width: 18 },
            { header: 'Carton Barcode', key: 'carton_barcode', width: 15 },
            { header: 'Carton Qty', key: 'carton_qty', width: 10 },
            { header: 'Supplier SKU', key: 'supplier_sku', width: 15 },
            
            // Categorization
            { header: 'Vendor / Brand', key: 'vendor', width: 15 },
            { header: 'Product Type', key: 'product_type', width: 15 },
            { header: 'Supplier', key: 'supplier_name', width: 18 },
            
            // Shopify Integration
            { header: 'Shopify Product ID', key: 'shopify_product_id', width: 18 },
            { header: 'Shopify Variant ID', key: 'shopify_variant_id', width: 18 },
            
            // Timestamps
            { header: 'Created', key: 'created_at', width: 20 },
            { header: 'Updated', key: 'updated_at', width: 20 }
        ]

        await exportToExcel('Full_Product_Export', columns, exportRows)
        
        toast.add({ 
            severity: 'success', 
            summary: 'Export Complete', 
            detail: `Exported ${exportRows.length} products with all available data`,
            life: 3000
        })
    } catch (error: any) {
        console.error('Export failed:', error)
        toast.add({ 
            severity: 'error', 
            summary: 'Export Failed', 
            detail: error.message || 'Failed to export data',
            life: 5000
        })
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
                            <div class="mb-4">
                                <p class="text-gray-600 mb-3">Download a complete export of all products with full details.</p>
                                <div class="surface-ground border-round p-3">
                                    <div class="text-sm font-semibold text-700 mb-2">Export includes:</div>
                                    <div class="grid text-sm text-600">
                                        <div class="col-12 md:col-4">
                                            <ul class="list-none p-0 m-0">
                                                <li class="mb-1"><i class="pi pi-check text-green-500 mr-2"></i>SKU, Name, Description</li>
                                                <li class="mb-1"><i class="pi pi-check text-green-500 mr-2"></i>All inventory levels</li>
                                                <li class="mb-1"><i class="pi pi-check text-green-500 mr-2"></i>Supplier stock levels</li>
                                            </ul>
                                        </div>
                                        <div class="col-12 md:col-4">
                                            <ul class="list-none p-0 m-0">
                                                <li class="mb-1"><i class="pi pi-check text-green-500 mr-2"></i>All pricing fields</li>
                                                <li class="mb-1"><i class="pi pi-check text-green-500 mr-2"></i>Barcodes & identifiers</li>
                                                <li class="mb-1"><i class="pi pi-check text-green-500 mr-2"></i>Supplier & vendor info</li>
                                            </ul>
                                        </div>
                                        <div class="col-12 md:col-4">
                                            <ul class="list-none p-0 m-0">
                                                <li class="mb-1"><i class="pi pi-check text-green-500 mr-2"></i>Product categorization</li>
                                                <li class="mb-1"><i class="pi pi-check text-green-500 mr-2"></i>Shopify IDs</li>
                                                <li class="mb-1"><i class="pi pi-check text-green-500 mr-2"></i>Timestamps</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <Button 
                                label="Export All Products to Excel" 
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
