<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { formatCurrency } from '@/lib/formatCurrency'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'

// Custom Components
import StockAdjustDialog from '@/modules/inventory/components/StockAdjustDialog.vue'

// PrimeVue Components
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Panel from 'primevue/panel'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Card from 'primevue/card'
import Divider from 'primevue/divider'
import Textarea from 'primevue/textarea'
import InputNumber from 'primevue/inputnumber'

import TimelineSidebar from '@/modules/core/components/TimelineSidebar.vue'
import { getStatusSeverity } from '@/lib/statusHelpers'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const product = ref<any>(null)
const suppliers = ref<any[]>([])
const history = ref<any[]>([])
const allOrderLines = ref<any[]>([]) 
const incomingStock = ref<any[]>([]) 
const shopifyDomain = ref<string | null>(null)
const shopifyIntegrations = ref<any[]>([])
const productIntegrations = ref<any[]>([])
const loading = ref(true)
const saving = ref(false)
const uploadingImage = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const totalOnOrder = ref(0)
const totalRequired = ref(0) 

// Dialog States
const showAdjustDialog = ref(false)
const showStockDialog = ref(false)
const showReservedDialog = ref(false)
const showRequiredDialog = ref(false)
const showIncomingDialog = ref(false)

// --- COMPUTED LISTS ---

// 1. Physically Reserved Orders (Allocated)
// Only shows orders that are actively holding stock
const reservedLines = computed(() => {
    return allOrderLines.value.filter(line => 
        ['reserved', 'picking', 'packed', 'partially_shipped'].includes(line.sales_orders.status)
    )
})

// 2. Orders Waiting for Stock (Backordered / Demand)
// Shows orders that need stock to fulfill
const requiredLines = computed(() => {
    return allOrderLines.value.filter(line => 
        (line.quantity_ordered - (line.quantity_fulfilled || 0)) > 0
    )
})

const loadData = async () => {
    loading.value = true
    try {
        const { id } = route.params

        // 1. Fetch Product (Basic Info Only)
        // We query the VIEW now to ensure stats match the dashboard exactly
        const productQuery = supabase
            .from('product_inventory_view')
            .select('*')
            .eq('product_id', id)
            .single()

        // 1b. Fetch Details from Table (Shopify IDs, etc not in view)
        const detailsQuery = supabase
            .from('products')
            .select('shopify_product_id, shopify_variant_id, supplier_id, carton_barcode, image_url')
            .eq('id', id)
            .single()

        // 2. Fetch Snapshots Separately (Avoids Join Duplication)
        const snapshotsQuery = supabase
            .from('inventory_snapshots')
            .select(`qoh, available, reserved, locations (id, name)`)
            .eq('product_id', id)

        // 3. Fetch History
        const historyQuery = supabase
            .from('inventory_ledger')
            .select(`created_at, transaction_type, reference_id, change_qoh, change_reserved, notes, locations (name)`)
            .eq('product_id', id)
            .order('created_at', { ascending: false })
            .limit(100)

        // 4. Fetch ALL Active Allocations/Demand
        const allocationsQuery = supabase
            .from('sales_order_lines')
            .select(`id, quantity_ordered, quantity_fulfilled, sales_orders!inner (id, order_number, customer_name, status, created_at, is_open)`)
            .eq('product_id', id)
            .eq('sales_orders.is_open', true)
            .order('created_at', { ascending: true })

        // 5. Fetch Incoming
        const poQuery = supabase
            .from('purchase_order_lines')
            .select(`id, quantity_ordered, quantity_received, purchase_orders!inner (id, po_number, status, expected_date)`)
            .eq('product_id', id)
            .in('purchase_orders.status', ['placed', 'partial_received']) 

        // 6. Fetch Suppliers
        const suppQuery = supabase.from('suppliers').select('id, name').order('name')

        // 7. Fetch Shopify Integrations (All)
        const shopifyQuery = supabase.from('integrations').select('id, settings').eq('provider', 'shopify')

        // 8. Fetch Product Integrations
        const productIntegrationsQuery = supabase.from('product_integrations').select('*').eq('product_id', id)

        const [prodRes, detailsRes, snapRes, histRes, allocRes, poRes, suppRes, shopifyRes, prodIntRes] = await Promise.all([
            productQuery, 
            detailsQuery,
            snapshotsQuery, 
            historyQuery, 
            allocationsQuery, 
            poQuery,
            suppQuery,
            shopifyQuery,
            productIntegrationsQuery
        ])

        if (prodRes.error) {
            toast.add({ severity: 'error', summary: 'Error', detail: 'Product not found' })
            router.push('/products')
        } else {
            const data = prodRes.data
            if (detailsRes.data) {
                Object.assign(data, detailsRes.data)
            }
            const snapshots = snapRes.data || []
            
            // Use View Data for Totals (Source of Truth)
            // The view calculates these globally, preventing drift from snapshot summation
            data.total_qoh = data.qoh
            data.total_reserved = data.reserved
            data.total_available = data.available
            
            data.inventory_snapshots = snapshots
            
            product.value = data
            history.value = histRes.data || []
            allOrderLines.value = allocRes.data || []
            incomingStock.value = poRes.data || []
            suppliers.value = suppRes.data || []
            
            shopifyIntegrations.value = shopifyRes.data || []
            productIntegrations.value = prodIntRes.data || []

            if (shopifyIntegrations.value.length > 0) {
                shopifyDomain.value = shopifyIntegrations.value[0].settings?.shop_url
            }

            // Calculate Demand from LINES (Outstanding Qty)
            totalRequired.value = allOrderLines.value.reduce((sum, line) => {
                const remaining = line.quantity_ordered - (line.quantity_fulfilled || 0)
                return sum + (remaining > 0 ? remaining : 0)
            }, 0)
            
            totalOnOrder.value = incomingStock.value.reduce((sum, line) => sum + (line.quantity_ordered - (line.quantity_received || 0)), 0)
        }
    } catch (e) {
        console.error(e)
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load product data' })
    } finally {
        loading.value = false
    }
}

const updateProduct = async () => {
    saving.value = true
    const { error } = await supabase.from('products').update({
        supplier_id: product.value.supplier_id,
        barcode: product.value.barcode,
        carton_barcode: product.value.carton_barcode,
        description: product.value.description,
        list_price: product.value.list_price,
        retail_price: product.value.retail_price,
        compare_at_price: product.value.compare_at_price,
        product_type: product.value.product_type,
        vendor: product.value.vendor,
        image_url: product.value.image_url
    }).eq('id', product.value.id)

    if (error) {
        toast.add({ severity: 'error', summary: 'Error', detail: error.message })
    } else {
        toast.add({ severity: 'success', summary: 'Saved', detail: 'Product updated successfully' })
    }
    saving.value = false
}

const triggerFileUpload = () => {
    fileInput.value?.click()
}

const onFileSelect = async (event: Event) => {
    const input = event.target as HTMLInputElement
    if (!input.files || input.files.length === 0) return

    const file = input.files[0]
    if (!file) return
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
        toast.add({ severity: 'error', summary: 'Invalid File', detail: 'Please upload a valid image file (JPEG, PNG, WebP, or GIF)' })
        input.value = ''
        return
    }
    
    // Validate file size (5MB)
    if (file.size > 5242880) {
        toast.add({ severity: 'error', summary: 'File Too Large', detail: 'Image must be less than 5MB' })
        input.value = ''
        return
    }
    
    uploadingImage.value = true

    try {
        const fileExt = file.name.split('.').pop()
        const fileName = `${product.value.id}/${Date.now()}.${fileExt}`
        
        const { error: uploadError } = await supabase.storage
            .from('products')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false
            })

        if (uploadError) {
            console.error('Upload error:', uploadError)
            throw new Error(uploadError.message || 'Failed to upload file')
        }

        const { data: { publicUrl } } = supabase.storage
            .from('products')
            .getPublicUrl(fileName)

        // Save to database immediately
        const { error: updateError } = await supabase
            .from('products')
            .update({ image_url: publicUrl })
            .eq('id', product.value.id)

        if (updateError) throw new Error(updateError.message)

        product.value.image_url = publicUrl
        toast.add({ severity: 'success', summary: 'Uploaded', detail: 'Image uploaded successfully' })
        
    } catch (e: any) {
        console.error('Upload error:', e)
        toast.add({ 
            severity: 'error', 
            summary: 'Upload Failed', 
            detail: e.message || 'Failed to upload image. Please try again.',
            life: 5000
        })
    } finally {
        uploadingImage.value = false
        input.value = ''
    }
}

const onAdjustmentSaved = () => {
    loadData()
}

onMounted(() => {
    loadData()
})

const formatDate = (dateStr: string) => dateStr ? new Date(dateStr).toLocaleDateString() : '-'
const formatDateTime = (dateStr: string) => dateStr ? new Date(dateStr).toLocaleString() : '-'

const getTypeSeverity = (type: string) => {
    switch (type) {
        case 'purchase': case 'po_received': return 'success'
        case 'sale': return 'danger'
        case 'adjustment': return 'warn'
        default: return 'info'
    }
}

const getReferenceLink = (data: any) => {
    if (!data.reference_id) return null;
    const type = data.transaction_type?.toLowerCase();
    if (['sale', 'reserved', 'unreserved', 'picking', 'shipped', 'cancelled'].includes(type)) return `/sales/${data.reference_id}`;
    if (['purchase', 'po_placed', 'po_received'].includes(type)) return `/purchases/${data.reference_id}`;
    return null;
}

const getShopifyUrl = () => {
    if (!shopifyDomain.value || !product.value?.shopify_product_id) return undefined
    let url = `https://${shopifyDomain.value}/admin/products/${product.value.shopify_product_id}`
    if (product.value.shopify_variant_id) {
        url += `/variants/${product.value.shopify_variant_id}`
    }
    return url
}

const getIntegrationUrl = (link: any) => {
    const integration = shopifyIntegrations.value.find(i => i.id === link.integration_id)
    if (!integration || !integration.settings?.shop_url) return '#'
    
    let url = `https://${integration.settings.shop_url}/admin/products/${link.external_product_id}`
    if (link.external_variant_id) {
        url += `/variants/${link.external_variant_id}`
    }
    return url
}
</script>

<template>
    <div v-if="loading" class="flex justify-content-center p-6">
        <i class="pi pi-spin pi-spinner text-4xl text-500"></i>
    </div>

    <div v-else-if="product" class="flex flex-column gap-4">
        
        <!-- Header -->
        <div class="surface-card p-4 shadow-2 border-round flex justify-content-between align-items-center">
            <div>
                <div class="text-500 text-sm mb-1">SKU: {{ product.sku }}</div>
                <div class="flex align-items-center gap-3">
                    <h1 class="text-3xl font-bold m-0">{{ product.name }}</h1>
                    <Tag :value="product.status?.toUpperCase()" :severity="getStatusSeverity(product.status)" />
                </div>
            </div>
            <div class="flex gap-2">
                <Button label="Save Changes" icon="pi pi-save" @click="updateProduct" :loading="saving" />
                <Button label="Adjust Stock" icon="pi pi-sliders-h" severity="info" @click="showAdjustDialog = true" />
            </div>
        </div>

        <!-- Key Stats Row -->
        <div class="grid">
            <div class="col-12 md:col-2 lg:col">
                <div class="surface-card shadow-2 p-3 border-round border-left-3 border-blue-500 h-full">
                    <div class="flex justify-content-between mb-3">
                        <div class="text-500 font-medium">Total On Hand</div>
                        <Button icon="pi pi-search" text rounded size="small" class="p-0 w-2rem h-2rem" @click="showStockDialog = true" />
                    </div>
                    <div class="text-900 text-3xl font-bold">{{ product.total_qoh }}</div>
                </div>
            </div>

            <div class="col-12 md:col-2 lg:col">
                <div class="surface-card shadow-2 p-3 border-round border-left-3 border-green-500 h-full">
                    <div class="text-500 font-medium mb-3">Available to Sell</div>
                    <div class="text-900 text-3xl font-bold">{{ product.total_available }}</div>
                </div>
            </div>

            <div class="col-12 md:col-2 lg:col">
                <div class="surface-card shadow-2 p-3 border-round border-left-3 border-orange-500 h-full">
                    <div class="flex justify-content-between mb-3">
                        <div class="text-500 font-medium">Reserved</div>
                        <i class="pi pi-lock text-orange-500 text-xl"></i>
                    </div>
                    <div class="flex justify-content-between align-items-end">
                        <div class="text-900 text-3xl font-bold">{{ product.total_reserved }}</div>
                        <Button label="View" class="p-0" text size="small" @click="showReservedDialog = true" />
                    </div>
                </div>
            </div>

            <div class="col-12 md:col-2 lg:col">
                <div class="surface-card shadow-2 p-3 border-round border-left-3 border-purple-500 h-full">
                    <div class="flex justify-content-between mb-3">
                        <div class="text-500 font-medium">On Order</div>
                        <i class="pi pi-truck text-purple-500 text-xl"></i>
                    </div>
                    <div class="flex justify-content-between align-items-end">
                        <div class="text-900 text-3xl font-bold">{{ totalOnOrder }}</div>
                        <Button label="View" class="p-0" text size="small" @click="showIncomingDialog = true" />
                    </div>
                </div>
            </div>

            <div class="col-12 md:col-2 lg:col">
                <div class="surface-card shadow-2 p-3 border-round border-left-3 border-red-500 h-full">
                    <div class="flex justify-content-between mb-3">
                        <div class="text-500 font-medium">Required</div>
                        <i class="pi pi-exclamation-circle text-red-500 text-xl"></i>
                    </div>
                    <div class="flex justify-content-between align-items-end">
                        <div class="text-900 text-3xl font-bold">{{ totalRequired }}</div>
                        <Button label="View" class="p-0" text size="small" @click="showRequiredDialog = true" />
                    </div>
                </div>
            </div>
        </div>

        <!-- Main Content Grid -->
        <div class="grid">
            <!-- Left Column: Image & Details -->
            <div class="col-12 lg:col-4 flex flex-column gap-4">
                
                <!-- Image Card -->
                <div class="surface-card p-4 shadow-2 border-round">
                    <div class="text-xl font-bold mb-4">Product Image</div>
                    <div class="flex flex-column align-items-center gap-3">
                        <div class="w-full border-1 surface-border border-round surface-50 flex align-items-center justify-content-center overflow-hidden relative" style="height: 300px;">
                            <img v-if="product.image_url" :src="product.image_url" class="w-full h-full" style="object-fit: contain;" />
                            <i v-else class="pi pi-image text-400 text-6xl"></i>
                            
                            <div v-if="uploadingImage" class="absolute top-0 left-0 w-full h-full bg-black-alpha-50 flex align-items-center justify-content-center">
                                <i class="pi pi-spin pi-spinner text-white text-4xl"></i>
                            </div>
                        </div>
                        
                        <div class="flex gap-2 w-full">
                            <input type="file" ref="fileInput" class="hidden" accept="image/*" @change="onFileSelect" />
                            <Button v-if="!product.image_url" label="Upload Image" icon="pi pi-upload" class="w-full" outlined @click="triggerFileUpload" :loading="uploadingImage" />
                            <Button v-else label="Remove Image" icon="pi pi-trash" severity="danger" outlined class="w-full" @click="product.image_url = null" />
                        </div>
                        <InputText v-if="!product.image_url" v-model="product.image_url" placeholder="Or enter URL..." class="w-full text-sm" />
                    </div>
                </div>

                <!-- Product Details Card -->
                <div class="surface-card p-4 shadow-2 border-round">
                    <div class="text-xl font-bold mb-4">Product Details</div>
                    <div class="flex flex-column gap-3">
                        <div class="field mb-0 flex flex-column gap-2">
                            <label class="font-bold">Supplier</label>
                            <Select v-model="product.supplier_id" :options="suppliers" optionLabel="name" optionValue="id" placeholder="Select Supplier" filter showClear class="w-full" />
                        </div>
                        <div class="field mb-0 flex flex-column gap-2">
                            <label class="font-bold">Carton Quantity</label>
                            <InputNumber v-model="product.carton_qty" showButtons :min="1" suffix=" units" class="w-full" />
                        </div>
                        <div class="field mb-0 flex flex-column gap-2">
                            <label class="font-bold">Vendor / Brand</label>
                            <InputText v-model="product.vendor" class="w-full" />
                        </div>
                        <div class="field mb-0 flex flex-column gap-2">
                            <label class="font-bold">Product Type</label>
                            <InputText v-model="product.product_type" class="w-full" />
                        </div>
                        <div class="field mb-0 flex flex-column gap-2">
                            <label class="font-bold">Product Barcode (UPC/EAN)</label>
                            <div class="p-inputgroup">
                                <span class="p-inputgroup-addon"><i class="pi pi-barcode"></i></span>
                                <InputText v-model="product.barcode" />
                            </div>
                        </div>
                        <div class="field mb-0 flex flex-column gap-2">
                            <label class="font-bold">Carton Barcode (ITF-14)</label>
                            <div class="p-inputgroup">
                                <span class="p-inputgroup-addon"><i class="pi pi-box"></i></span>
                                <InputText v-model="product.carton_barcode" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right Column: Details, Pricing, Integrations -->
            <div class="col-12 lg:col-8 flex flex-column gap-4">
                
                <!-- General Info -->
                <div class="surface-card p-4 shadow-2 border-round">
                    <div class="text-xl font-bold mb-4">General Information</div>
                    <div class="grid formgrid p-fluid">
                        <div class="field col-12 flex flex-column gap-2">
                            <label class="font-bold">Description</label>
                            <Textarea v-model="product.description" rows="4" autoResize />
                        </div>
                    </div>
                </div>

                <!-- Pricing -->
                <div class="surface-card p-4 shadow-2 border-round">
                    <div class="text-xl font-bold mb-4">Pricing</div>
                    <div class="grid formgrid p-fluid">
                        <div class="field col-12 md:col-6 flex flex-column gap-2">
                            <label class="font-bold">List Price</label>
                            <InputNumber v-model="product.retail_price" mode="currency" currency="USD" locale="en-US" />
                        </div>
                        <div class="field col-12 md:col-6 flex flex-column gap-2">
                            <label class="font-bold">Cost Price</label>
                            <InputNumber v-model="product.cost_price" mode="currency" currency="USD" locale="en-US" />
                        </div>
                        <div class="field col-12 md:col-6 flex flex-column gap-2">
                            <label class="font-bold">Sale Price</label>
                            <InputNumber v-model="product.list_price" mode="currency" currency="USD" locale="en-US" />
                        </div>
                        <div class="field col-12 md:col-6 flex flex-column gap-2">
                            <label class="font-bold">Compare-at Price</label>
                            <InputNumber v-model="product.compare_at_price" mode="currency" currency="USD" locale="en-US" />
                        </div>
                    </div>
                </div>

                <!-- Integrations -->
                <div class="surface-card p-4 shadow-2 border-round">
                    <div class="text-xl font-bold mb-4">Integrations</div>
                    <div class="flex flex-column gap-2">
                        <div v-if="product.shopify_product_id && getShopifyUrl()" class="flex align-items-center justify-content-between p-3 border-1 border-green-200 bg-green-50 border-round">
                            <div class="flex align-items-center gap-3">
                                <i class="pi pi-shopping-bag text-green-600 text-xl"></i>
                                <div>
                                    <div class="font-bold text-green-900">Shopify (Legacy)</div>
                                    <div class="text-sm text-green-700">ID: {{ product.shopify_variant_id || product.shopify_product_id }}</div>
                                </div>
                            </div>
                            <a :href="getShopifyUrl()" target="_blank" class="p-button p-component p-button-text p-button-sm p-button-success no-underline">
                                <span class="p-button-icon p-button-icon-left pi pi-external-link"></span>
                                <span class="p-button-label">View in Admin</span>
                            </a>
                        </div>

                        <div v-for="link in productIntegrations" :key="link.id" class="flex align-items-center justify-content-between p-3 border-1 border-green-200 bg-green-50 border-round">
                            <div class="flex align-items-center gap-3">
                                <i class="pi pi-shopping-bag text-green-600 text-xl"></i>
                                <div>
                                    <div class="font-bold text-green-900">Shopify Store</div>
                                    <div class="text-sm text-green-700">Linked</div>
                                </div>
                            </div>
                            <a :href="getIntegrationUrl(link)" target="_blank" class="p-button p-component p-button-text p-button-sm p-button-success no-underline">
                                <span class="p-button-icon p-button-icon-left pi pi-external-link"></span>
                                <span class="p-button-label">View in Admin</span>
                            </a>
                        </div>

                        <div v-if="!product.shopify_product_id && productIntegrations.length === 0" class="p-3 border-1 surface-border surface-50 border-round text-center text-500">
                            No active integrations linked to this product.
                        </div>
                    </div>
                </div>

            </div>
        </div>

        <!-- Movement History -->
        <Panel header="Movement History">
            <DataTable :value="history" size="small" stripedRows paginator :rows="15">
                <template #empty>No movement history found.</template>
                <Column field="created_at" header="Date"><template #body="{ data }"><span class="text-sm">{{ formatDateTime(data.created_at) }}</span></template></Column>
                <Column field="transaction_type" header="Type"><template #body="{ data }"><Tag :value="data.transaction_type" :severity="getTypeSeverity(data.transaction_type)" /></template></Column>
                <Column field="locations.name" header="Loc" />
                <Column field="change_qoh" header="Qty"><template #body="{ data }"><span :class="data.change_qoh > 0 ? 'text-green-600' : 'text-red-500'">{{ data.change_qoh }}</span></template></Column>
                <Column field="reference_id" header="Ref"><template #body="{ data }"><router-link v-if="getReferenceLink(data)" :to="getReferenceLink(data) as string" class="text-primary">{{ data.reference_id ? 'View' : '-' }}</router-link></template></Column>
            </DataTable>
        </Panel>

        <!-- Timeline Section -->
        <div class="surface-card shadow-2 border-round overflow-hidden" style="height: 600px;">
            <TimelineSidebar 
                v-if="product" 
                :entity-id="product.id" 
                entity-type="product" 
            />
        </div>
    </div>

    <Dialog v-model:visible="showStockDialog" header="Current Stock Breakdown" :modal="true" :style="{ width: '50vw' }">
        <DataTable :value="product?.inventory_snapshots" stripedRows size="small">
            <template #empty>No stock in any location.</template>
            <Column field="locations.name" header="Location" sortable />
            <Column field="qoh" header="On Hand" sortable />
            <Column field="reserved" header="Allocated" class="text-orange-500 font-bold" />
            <Column field="available" header="Available" class="text-green-600 font-bold" />
        </DataTable>
        <template #footer>
            <Button label="Close" icon="pi pi-times" text @click="showStockDialog = false" />
        </template>
    </Dialog>

    <Dialog v-model:visible="showReservedDialog" header="Active Allocations (Reserved)" :modal="true" :style="{ width: '60vw' }">
        <DataTable :value="reservedLines" size="small" stripedRows paginator :rows="5">
            <template #empty>No active orders are holding stock.</template>
            <Column field="sales_orders.order_number" header="Order #"><template #body="{ data }"><router-link :to="`/sales/${data.sales_orders.id}`" class="text-primary font-bold">{{ data.sales_orders.order_number }}</router-link></template></Column>
            <Column field="sales_orders.customer_name" header="Customer" />
            <Column field="sales_orders.status" header="Status"><template #body="{ data }"><Tag :value="data.sales_orders.status" :severity="getStatusSeverity(data.sales_orders.status)" class="text-xs" /></template></Column>
            <Column header="Qty Reserved" class="text-center font-bold"><template #body="{ data }">{{ data.quantity_ordered - (data.quantity_fulfilled || 0) }}</template></Column>
        </DataTable>
        <template #footer>
            <Button label="Close" icon="pi pi-times" text @click="showReservedDialog = false" />
        </template>
    </Dialog>

    <Dialog v-model:visible="showRequiredDialog" header="Outstanding Sales Demand" :modal="true" :style="{ width: '60vw' }">
        <DataTable :value="requiredLines" size="small" stripedRows paginator :rows="5">
            <template #empty>No outstanding orders found.</template>
            <Column field="sales_orders.order_number" header="Order #"><template #body="{ data }"><router-link :to="`/sales/${data.sales_orders.id}`" class="text-primary font-bold">{{ data.sales_orders.order_number }}</router-link></template></Column>
            <Column field="sales_orders.customer_name" header="Customer" />
            <Column field="sales_orders.status" header="Status"><template #body="{ data }"><Tag :value="data.sales_orders.status" :severity="getStatusSeverity(data.sales_orders.status)" class="text-xs" /></template></Column>
            <Column header="Qty Needed" class="text-center font-bold"><template #body="{ data }">{{ data.quantity_ordered - (data.quantity_fulfilled || 0) }}</template></Column>
        </DataTable>
        <template #footer>
            <Button label="Close" icon="pi pi-times" text @click="showRequiredDialog = false" />
        </template>
    </Dialog>

    <Dialog v-model:visible="showIncomingDialog" header="Incoming Purchase Orders" :modal="true" :style="{ width: '60vw' }">
        <DataTable :value="incomingStock" size="small" stripedRows paginator :rows="5">
            <template #empty>No active POs found.</template>
            <Column field="purchase_orders.po_number" header="PO #"><template #body="{ data }"><router-link :to="`/purchases/${data.purchase_orders.id}`" class="text-primary font-bold">{{ data.purchase_orders.po_number }}</router-link></template></Column>
            <Column field="purchase_orders.expected_date" header="Expected"><template #body="{ data }">{{ formatDate(data.purchase_orders.expected_date) }}</template></Column>
            <Column field="purchase_orders.status" header="Status"><template #body="{ data }"><Tag :value="data.purchase_orders.status" :severity="getStatusSeverity(data.purchase_orders.status)" class="text-xs" /></template></Column>
            <Column header="On Order" class="text-center font-bold"><template #body="{ data }">{{ data.quantity_ordered - (data.quantity_received || 0) }}</template></Column>
        </DataTable>
        <template #footer>
            <Button label="Close" icon="pi pi-times" text @click="showIncomingDialog = false" />
        </template>
    </Dialog>

    <StockAdjustDialog 
        v-model:visible="showAdjustDialog" 
        :product="product"
        @saved="onAdjustmentSaved"
    />
</template>