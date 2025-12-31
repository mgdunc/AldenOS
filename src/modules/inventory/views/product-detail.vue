<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { formatCurrency } from '@/lib/formatCurrency'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'
import { useInventory } from '../composables/useInventory'
import { useSupplierStock } from '../composables/useSupplierStock'
import { logger } from '@/lib/logger'

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
import Chart from 'primevue/chart'

import TimelineSidebar from '@/modules/core/components/TimelineSidebar.vue'
import { getStatusSeverity } from '@/lib/statusHelpers'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { loadSuppliers, updateProduct: updateProductComposable } = useInventory()
const { getProductSupplierStock, getProductSupplierStockHistory } = useSupplierStock()
const id = route.params.id as string

const product = ref<any>(null)
const suppliers = ref<any[]>([])
const history = ref<any[]>([])
const allOrderLines = ref<any[]>([]) 
const incomingStock = ref<any[]>([]) 
const shopifyDomain = ref<string | null>(null)
const loading = ref(true)
const saving = ref(false)
const uploadingImage = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const editMode = ref(false)

const totalOnOrder = ref(0)
const totalRequired = ref(0)

// Supplier Stock
const supplierStock = ref<{ quantity: number; stock_date: string; supplier_name: string } | null>(null)
const showSupplierStockDialog = ref(false)
const supplierStockHistory = ref<Array<{ stock_date: string; quantity: number }>>([])
const loadingSupplierHistory = ref(false) 

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
            .select('shopify_product_id, shopify_variant_id, supplier_id, supplier_sku, carton_barcode, image_url')
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
        const suppQuery = loadSuppliers()

        // 7. Fetch Shopify Integration (single store)
        const shopifyQuery = supabase
            .from('integrations')
            .select('id, name, settings')
            .eq('provider', 'shopify')
            .limit(1)
            .maybeSingle()

        const [prodRes, detailsRes, snapRes, histRes, allocRes, poRes, suppRes, shopifyRes] = await Promise.all([
            productQuery, 
            detailsQuery,
            snapshotsQuery, 
            historyQuery, 
            allocationsQuery, 
            poQuery,
            suppQuery,
            shopifyQuery
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
            suppliers.value = suppRes || []
            
            // Get Shopify domain from single integration
            const shopifySettings = shopifyRes.data?.settings as { shop_url?: string } | null
            if (shopifySettings?.shop_url) {
                shopifyDomain.value = shopifySettings.shop_url
            }

            // Calculate Demand from LINES (Outstanding Qty)
            totalRequired.value = allOrderLines.value.reduce((sum, line) => {
                const remaining = line.quantity_ordered - (line.quantity_fulfilled || 0)
                return sum + (remaining > 0 ? remaining : 0)
            }, 0)
            
            totalOnOrder.value = incomingStock.value.reduce((sum, line) => sum + (line.quantity_ordered - (line.quantity_received || 0)), 0)
            
            // Load supplier stock (async, don't block)
            loadSupplierStock()
        }
    } catch (e) {
        logger.error('Failed to load product data', e as Error)
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to load product data' })
    } finally {
        loading.value = false
    }
}

const loadSupplierStock = async () => {
    const stock = await getProductSupplierStock(id)
    supplierStock.value = stock
}

const openSupplierStockHistory = async () => {
    showSupplierStockDialog.value = true
    loadingSupplierHistory.value = true
    
    const historyData = await getProductSupplierStockHistory(id, 90) // 90 days
    supplierStockHistory.value = historyData
    loadingSupplierHistory.value = false
}

const supplierStockChartData = computed(() => {
    if (!supplierStockHistory.value.length) return null
    
    return {
        labels: supplierStockHistory.value.map(h => {
            const d = new Date(h.stock_date)
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
        }),
        datasets: [
            {
                label: 'Supplier Stock',
                data: supplierStockHistory.value.map(h => h.quantity),
                fill: true,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#10b981'
            }
        ]
    }
})

const supplierStockChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: false
        }
    },
    scales: {
        y: {
            beginAtZero: true,
            ticks: {
                stepSize: 1
            }
        }
    }
}

const updateProduct = async () => {
    const success = await updateProductComposable(id, {
        supplier_id: product.value.supplier_id,
        supplier_sku: product.value.supplier_sku,
        barcode: product.value.barcode,
        description: product.value.description,
        list_price: product.value.list_price,
        compare_at_price: product.value.compare_at_price,
        product_type: product.value.product_type,
        vendor: product.value.vendor,
        image_url: product.value.image_url
    } as any)

    if (success) {
        editMode.value = false
    }
}

const cancelEdit = () => {
    editMode.value = false
    loadData() // Reload to discard changes
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
            logger.error('Upload error', uploadError)
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
        logger.error('Upload error', e)
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

const isLinkedToShopify = computed(() => {
    return !!product.value?.shopify_product_id
})
</script>

<template>
    <div v-if="loading" class="flex justify-content-center p-6">
        <i class="pi pi-spin pi-spinner text-4xl text-500"></i>
    </div>

    <div v-else-if="product" class="flex flex-column gap-4">
        
        <!-- Header with Hero Image -->
        <div class="surface-card shadow-2 border-round overflow-hidden">
            <div class="flex flex-column md:flex-row">
                <!-- Product Image Section -->
                <div class="w-full md:w-15rem lg:w-20rem surface-100 flex align-items-center justify-content-center p-4 relative" style="min-height: 200px;">
                    <img v-if="product.image_url" :src="product.image_url" class="max-w-full max-h-12rem" style="object-fit: contain;" />
                    <i v-else class="pi pi-box text-400 text-6xl"></i>
                    <div v-if="uploadingImage" class="absolute top-0 left-0 w-full h-full bg-black-alpha-50 flex align-items-center justify-content-center">
                        <i class="pi pi-spin pi-spinner text-white text-4xl"></i>
                    </div>
                    <input type="file" ref="fileInput" class="hidden" accept="image/*" @change="onFileSelect" />
                    <Button icon="pi pi-camera" rounded class="absolute" style="bottom: 1rem; right: 1rem;" @click="triggerFileUpload" :loading="uploadingImage" v-tooltip="'Change Image'" />
                </div>
                
                <!-- Product Info Section -->
                <div class="flex-1 p-4 flex flex-column justify-content-between">
                    <div>
                        <div class="flex align-items-center gap-2 mb-2">
                            <span class="text-500 font-mono text-sm bg-gray-100 px-2 py-1 border-round">{{ product.sku }}</span>
                            <Tag :value="product.status?.toUpperCase()" :severity="getStatusSeverity(product.status)" />
                        </div>
                        <h1 class="text-2xl md:text-3xl font-bold m-0 text-900 mb-2">{{ product.name }}</h1>
                        <p v-if="product.description" class="text-600 m-0 line-clamp-2 text-sm">{{ product.description }}</p>
                    </div>
                    <div class="flex flex-wrap gap-2 mt-3">
                        <Button v-if="!editMode" label="Edit Product" icon="pi pi-pencil" severity="secondary" outlined @click="editMode = true" />
                        <Button v-if="editMode" label="Save Changes" icon="pi pi-save" @click="updateProduct" :loading="saving" />
                        <Button v-if="editMode" label="Cancel" icon="pi pi-times" severity="secondary" text @click="cancelEdit" />
                        <Button label="Adjust Stock" icon="pi pi-sliders-h" severity="secondary" outlined @click="showAdjustDialog = true" />
                    </div>
                </div>
            </div>
        </div>

        <!-- Key Stats Row - Compact Cards -->
        <div class="grid">
            <div class="col-6 md:col-4 lg:col">
                <div class="surface-card shadow-1 p-3 border-round h-full cursor-pointer hover:shadow-3 transition-all transition-duration-200" @click="showStockDialog = true">
                    <div class="flex align-items-center gap-3">
                        <div class="flex align-items-center justify-content-center bg-blue-100 border-round" style="width: 3rem; height: 3rem;">
                            <i class="pi pi-box text-blue-600 text-xl"></i>
                        </div>
                        <div class="flex-1">
                            <div class="text-500 text-sm font-medium">On Hand</div>
                            <div class="text-900 text-2xl font-bold">{{ product.total_qoh }}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="col-6 md:col-4 lg:col">
                <div class="surface-card shadow-1 p-3 border-round h-full">
                    <div class="flex align-items-center gap-3">
                        <div class="flex align-items-center justify-content-center bg-green-100 border-round" style="width: 3rem; height: 3rem;">
                            <i class="pi pi-check-circle text-green-600 text-xl"></i>
                        </div>
                        <div class="flex-1">
                            <div class="text-500 text-sm font-medium">Available</div>
                            <div class="text-green-600 text-2xl font-bold">{{ product.total_available }}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="col-6 md:col-4 lg:col">
                <div class="surface-card shadow-1 p-3 border-round h-full cursor-pointer hover:shadow-3 transition-all transition-duration-200" @click="showReservedDialog = true">
                    <div class="flex align-items-center gap-3">
                        <div class="flex align-items-center justify-content-center bg-orange-100 border-round" style="width: 3rem; height: 3rem;">
                            <i class="pi pi-lock text-orange-600 text-xl"></i>
                        </div>
                        <div class="flex-1">
                            <div class="text-500 text-sm font-medium">Reserved</div>
                            <div class="text-orange-600 text-2xl font-bold">{{ product.total_reserved }}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="col-6 md:col-4 lg:col">
                <div class="surface-card shadow-1 p-3 border-round h-full cursor-pointer hover:shadow-3 transition-all transition-duration-200" @click="showIncomingDialog = true">
                    <div class="flex align-items-center gap-3">
                        <div class="flex align-items-center justify-content-center bg-purple-100 border-round" style="width: 3rem; height: 3rem;">
                            <i class="pi pi-truck text-purple-600 text-xl"></i>
                        </div>
                        <div class="flex-1">
                            <div class="text-500 text-sm font-medium">On Order</div>
                            <div class="text-purple-600 text-2xl font-bold">{{ totalOnOrder }}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="col-6 md:col-4 lg:col">
                <div class="surface-card shadow-1 p-3 border-round h-full cursor-pointer hover:shadow-3 transition-all transition-duration-200" @click="showRequiredDialog = true">
                    <div class="flex align-items-center gap-3">
                        <div class="flex align-items-center justify-content-center border-round" :class="totalRequired > product.total_available ? 'bg-red-100' : 'bg-gray-100'" style="width: 3rem; height: 3rem;">
                            <i class="pi pi-exclamation-circle text-xl" :class="totalRequired > product.total_available ? 'text-red-600' : 'text-gray-500'"></i>
                        </div>
                        <div class="flex-1">
                            <div class="text-500 text-sm font-medium">Required</div>
                            <div class="text-2xl font-bold" :class="totalRequired > product.total_available ? 'text-red-600' : 'text-900'">{{ totalRequired }}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="col-6 md:col-4 lg:col">
                <div class="surface-card shadow-1 p-3 border-round h-full cursor-pointer hover:shadow-3 transition-all transition-duration-200" @click="openSupplierStockHistory">
                    <div class="flex align-items-center gap-3">
                        <div class="flex align-items-center justify-content-center bg-teal-100 border-round" style="width: 3rem; height: 3rem;">
                            <i class="pi pi-building text-teal-600 text-xl"></i>
                        </div>
                        <div class="flex-1">
                            <div class="text-500 text-sm font-medium">Supplier Stock</div>
                            <div class="text-teal-600 text-2xl font-bold">{{ supplierStock?.quantity ?? '-' }}</div>
                            <div v-if="supplierStock?.stock_date" class="text-400 text-xs">
                                as of {{ new Date(supplierStock.stock_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Main Content Grid -->
        <div class="grid">
            <!-- Left Column: Details -->
            <div class="col-12 lg:col-8 flex flex-column gap-4">
                
                <!-- Product Details & Pricing Combined -->
                <div class="surface-card p-4 shadow-2 border-round">
                    <div class="flex align-items-center justify-content-between mb-4">
                        <div class="flex align-items-center gap-2">
                            <i class="pi pi-info-circle text-primary text-xl"></i>
                            <span class="text-xl font-bold">Product Information</span>
                        </div>
                        <Tag v-if="editMode" value="EDITING" severity="warn" icon="pi pi-pencil" />
                    </div>
                    
                    <!-- READ-ONLY VIEW -->
                    <div v-if="!editMode" class="grid">
                        <div class="col-12 mb-3" v-if="product.description">
                            <div class="text-500 text-sm font-medium mb-1">Description</div>
                            <div class="text-900">{{ product.description }}</div>
                        </div>
                        
                        <Divider class="col-12 my-2" />
                        
                        <div class="col-12">
                            <div class="text-sm font-bold text-500 mb-3">PRICING</div>
                        </div>
                        <div class="col-6 md:col-3 mb-3">
                            <div class="text-500 text-sm font-medium mb-1">Cost Price</div>
                            <div class="text-900 font-bold">{{ formatCurrency(product.cost_price) }}</div>
                        </div>
                        <div class="col-6 md:col-3 mb-3">
                            <div class="text-500 text-sm font-medium mb-1">List Price</div>
                            <div class="text-900 font-bold">{{ formatCurrency(product.retail_price) }}</div>
                        </div>
                        <div class="col-6 md:col-3 mb-3">
                            <div class="text-500 text-sm font-medium mb-1">Sale Price</div>
                            <div class="text-900 font-bold">{{ formatCurrency(product.list_price) }}</div>
                        </div>
                        <div class="col-6 md:col-3 mb-3">
                            <div class="text-500 text-sm font-medium mb-1">Compare-at</div>
                            <div class="text-900 font-bold">{{ formatCurrency(product.compare_at_price) }}</div>
                        </div>
                        
                        <Divider class="col-12 my-2" />
                        
                        <div class="col-12">
                            <div class="text-sm font-bold text-500 mb-3">IDENTIFIERS & ATTRIBUTES</div>
                        </div>
                        <div class="col-6 md:col-4 mb-3">
                            <div class="text-500 text-sm font-medium mb-1">Supplier</div>
                            <div class="text-900">{{ suppliers.find(s => s.id === product.supplier_id)?.name || '-' }}</div>
                        </div>
                        <div class="col-6 md:col-4 mb-3">
                            <div class="text-500 text-sm font-medium mb-1">Supplier SKU</div>
                            <div class="text-900 font-mono">{{ product.supplier_sku || '-' }}</div>
                        </div>
                        <div class="col-6 md:col-4 mb-3">
                            <div class="text-500 text-sm font-medium mb-1">Vendor / Brand</div>
                            <div class="text-900">{{ product.vendor || '-' }}</div>
                        </div>
                        <div class="col-6 md:col-4 mb-3">
                            <div class="text-500 text-sm font-medium mb-1">Product Type</div>
                            <div class="text-900">{{ product.product_type || '-' }}</div>
                        </div>
                        <div class="col-6 md:col-4 mb-3">
                            <div class="text-500 text-sm font-medium mb-1"><i class="pi pi-barcode mr-1"></i>UPC/EAN</div>
                            <div class="text-900 font-mono">{{ product.barcode || '-' }}</div>
                        </div>
                        <div class="col-6 md:col-4 mb-3">
                            <div class="text-500 text-sm font-medium mb-1"><i class="pi pi-box mr-1"></i>Carton Barcode</div>
                            <div class="text-900 font-mono">{{ product.carton_barcode || '-' }}</div>
                        </div>
                        <div class="col-6 md:col-4 mb-3">
                            <div class="text-500 text-sm font-medium mb-1">Carton Quantity</div>
                            <div class="text-900">{{ product.carton_qty || '-' }} units</div>
                        </div>
                    </div>
                    
                    <!-- EDIT MODE -->
                    <div v-else class="grid formgrid">
                        <div class="field col-12">
                            <label class="font-bold text-sm text-500 mb-2 block">Description</label>
                            <Textarea v-model="product.description" rows="3" autoResize class="w-full" placeholder="Enter product description..." />
                        </div>
                        
                        <Divider class="col-12 my-2" />
                        
                        <div class="col-12">
                            <div class="text-sm font-bold text-500 mb-3">PRICING</div>
                        </div>
                        <div class="field col-6 md:col-3">
                            <label class="font-medium text-sm text-700 mb-2 block">Cost Price</label>
                            <InputNumber v-model="product.cost_price" mode="currency" currency="GBP" locale="en-GB" class="w-full" inputClass="text-right" />
                        </div>
                        <div class="field col-6 md:col-3">
                            <label class="font-medium text-sm text-700 mb-2 block">List Price</label>
                            <InputNumber v-model="product.retail_price" mode="currency" currency="GBP" locale="en-GB" class="w-full" inputClass="text-right" />
                        </div>
                        <div class="field col-6 md:col-3">
                            <label class="font-medium text-sm text-700 mb-2 block">Sale Price</label>
                            <InputNumber v-model="product.list_price" mode="currency" currency="GBP" locale="en-GB" class="w-full" inputClass="text-right" />
                        </div>
                        <div class="field col-6 md:col-3">
                            <label class="font-medium text-sm text-700 mb-2 block">Compare-at</label>
                            <InputNumber v-model="product.compare_at_price" mode="currency" currency="GBP" locale="en-GB" class="w-full" inputClass="text-right" />
                        </div>
                        
                        <Divider class="col-12 my-2" />
                        
                        <div class="col-12">
                            <div class="text-sm font-bold text-500 mb-3">IDENTIFIERS & ATTRIBUTES</div>
                        </div>
                        <div class="field col-12 md:col-6">
                            <label class="font-medium text-sm text-700 mb-2 block">Supplier</label>
                            <Select v-model="product.supplier_id" :options="suppliers" optionLabel="name" optionValue="id" placeholder="Select Supplier" filter showClear class="w-full" />
                        </div>
                        <div class="field col-12 md:col-6">
                            <label class="font-medium text-sm text-700 mb-2 block">Supplier SKU</label>
                            <InputText v-model="product.supplier_sku" class="w-full font-mono" placeholder="Supplier's part number" />
                        </div>
                        <div class="field col-6 md:col-3">
                            <label class="font-medium text-sm text-700 mb-2 block">Vendor / Brand</label>
                            <InputText v-model="product.vendor" class="w-full" />
                        </div>
                        <div class="field col-6 md:col-3">
                            <label class="font-medium text-sm text-700 mb-2 block">Product Type</label>
                            <InputText v-model="product.product_type" class="w-full" />
                        </div>
                        <div class="field col-6 md:col-4">
                            <label class="font-medium text-sm text-700 mb-2 block">
                                <i class="pi pi-barcode mr-1"></i>UPC/EAN Barcode
                            </label>
                            <InputText v-model="product.barcode" class="w-full font-mono" />
                        </div>
                        <div class="field col-6 md:col-4">
                            <label class="font-medium text-sm text-700 mb-2 block">
                                <i class="pi pi-box mr-1"></i>Carton Barcode
                            </label>
                            <InputText v-model="product.carton_barcode" class="w-full font-mono" />
                        </div>
                        <div class="field col-6 md:col-4">
                            <label class="font-medium text-sm text-700 mb-2 block">Carton Quantity</label>
                            <InputNumber v-model="product.carton_qty" showButtons :min="1" suffix=" units" class="w-full" />
                        </div>
                    </div>
                </div>

                <!-- Movement History -->
                <div class="surface-card shadow-2 border-round overflow-hidden">
                    <div class="flex align-items-center justify-content-between p-4 border-bottom-1 surface-border">
                        <div class="flex align-items-center gap-2">
                            <i class="pi pi-history text-primary text-xl"></i>
                            <span class="text-xl font-bold">Movement History</span>
                        </div>
                    </div>
                    <DataTable :value="history" size="small" stripedRows paginator :rows="10" class="border-noround">
                        <template #empty><div class="text-center text-500 py-4">No movement history found.</div></template>
                        <Column field="created_at" header="Date" style="width: 180px"><template #body="{ data }"><span class="text-sm">{{ formatDateTime(data.created_at) }}</span></template></Column>
                        <Column field="transaction_type" header="Type" style="width: 120px"><template #body="{ data }"><Tag :value="data.transaction_type" :severity="getTypeSeverity(data.transaction_type)" class="text-xs" /></template></Column>
                        <Column field="locations.name" header="Location" />
                        <Column field="change_qoh" header="Qty" style="width: 80px"><template #body="{ data }"><span class="font-bold" :class="data.change_qoh > 0 ? 'text-green-600' : 'text-red-500'">{{ data.change_qoh > 0 ? '+' : '' }}{{ data.change_qoh }}</span></template></Column>
                        <Column field="reference_id" header="Reference" style="width: 100px"><template #body="{ data }"><router-link v-if="getReferenceLink(data)" :to="getReferenceLink(data) as string" class="text-primary no-underline hover:underline">View</router-link><span v-else class="text-400">-</span></template></Column>
                    </DataTable>
                </div>
            </div>

            <!-- Right Column: Integrations & Timeline -->
            <div class="col-12 lg:col-4 flex flex-column gap-4">
                
                <!-- Shopify Integration Card -->
                <div class="surface-card p-4 shadow-2 border-round">
                    <div class="flex align-items-center gap-2 mb-4">
                        <i class="pi pi-shopping-bag text-primary text-xl"></i>
                        <span class="text-xl font-bold">Shopify</span>
                    </div>
                    
                    <!-- Linked State -->
                    <div v-if="isLinkedToShopify" class="flex flex-column gap-3">
                        <div class="flex align-items-center gap-2">
                            <Tag value="LINKED" severity="success" icon="pi pi-check-circle" />
                            <span class="text-500 text-sm">Synced from Shopify</span>
                        </div>
                        
                        <div class="surface-ground border-round p-3">
                            <div class="grid">
                                <div class="col-12 mb-2" v-if="product.shopify_product_id">
                                    <div class="text-500 text-xs font-medium mb-1">Product ID</div>
                                    <div class="text-900 font-mono text-sm">{{ product.shopify_product_id }}</div>
                                </div>
                                <div class="col-12" v-if="product.shopify_variant_id">
                                    <div class="text-500 text-xs font-medium mb-1">Variant ID</div>
                                    <div class="text-900 font-mono text-sm">{{ product.shopify_variant_id }}</div>
                                </div>
                            </div>
                        </div>
                        
                        <a 
                            v-if="getShopifyUrl()" 
                            :href="getShopifyUrl()" 
                            target="_blank" 
                            class="flex align-items-center justify-content-center gap-2 p-3 bg-green-500 hover:bg-green-600 border-round no-underline text-white font-medium transition-colors transition-duration-200"
                        >
                            <i class="pi pi-external-link"></i>
                            <span>View in Shopify Admin</span>
                        </a>
                        <div v-else class="text-500 text-sm text-center p-2">
                            <i class="pi pi-info-circle mr-1"></i>
                            Configure Shopify settings to view product
                        </div>
                    </div>
                    
                    <!-- Not Linked State -->
                    <div v-else class="flex flex-column align-items-center gap-3 py-4">
                        <div class="flex align-items-center justify-content-center bg-gray-100 border-round-xl" style="width: 4rem; height: 4rem;">
                            <i class="pi pi-link-off text-400 text-3xl"></i>
                        </div>
                        <div class="text-center">
                            <div class="font-medium text-700 mb-1">Not linked to Shopify</div>
                            <div class="text-500 text-sm">This product was created manually or hasn't been synced yet.</div>
                        </div>
                        <router-link to="/settings/shopify" class="no-underline">
                            <Button label="Go to Shopify Settings" icon="pi pi-cog" severity="secondary" outlined size="small" />
                        </router-link>
                    </div>
                </div>

                <!-- Timeline Section -->
                <div class="surface-card shadow-2 border-round overflow-hidden flex-1" style="min-height: 400px;">
                    <TimelineSidebar 
                        v-if="product" 
                        :entity-id="product.id" 
                        entity-type="product" 
                    />
                </div>
            </div>
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

    <Dialog v-model:visible="showSupplierStockDialog" header="Supplier Stock History" :modal="true" :style="{ width: '700px' }">
        <div v-if="loadingSupplierHistory" class="flex justify-content-center py-6">
            <i class="pi pi-spin pi-spinner text-4xl text-500"></i>
        </div>
        <div v-else-if="supplierStockHistory.length === 0" class="flex flex-column align-items-center gap-3 py-6">
            <i class="pi pi-chart-line text-4xl text-300"></i>
            <div class="text-center">
                <p class="text-600 font-medium mb-1">No supplier stock history</p>
                <p class="text-500 text-sm">Upload supplier stock files to track availability over time</p>
            </div>
            <router-link to="/inventory/supplier-stock" class="no-underline">
                <Button label="Go to Supplier Stock" icon="pi pi-upload" severity="secondary" outlined size="small" />
            </router-link>
        </div>
        <div v-else>
            <!-- Current Stock Summary -->
            <div class="surface-ground border-round p-3 mb-4">
                <div class="grid">
                    <div class="col-6">
                        <div class="text-500 text-sm">Current Stock</div>
                        <div class="text-2xl font-bold text-teal-600">{{ supplierStock?.quantity ?? 0 }}</div>
                    </div>
                    <div class="col-6">
                        <div class="text-500 text-sm">Last Updated</div>
                        <div class="text-lg font-medium">
                            {{ supplierStock?.stock_date ? new Date(supplierStock.stock_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-' }}
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Chart -->
            <div class="mb-3">
                <div class="text-sm font-medium text-700 mb-2">Last 90 Days</div>
                <div style="height: 250px;">
                    <Chart v-if="supplierStockChartData" type="line" :data="supplierStockChartData" :options="supplierStockChartOptions" />
                </div>
            </div>
            
            <!-- History Table -->
            <div>
                <div class="text-sm font-medium text-700 mb-2">History</div>
                <DataTable :value="supplierStockHistory" size="small" stripedRows :rows="5" paginator>
                    <Column field="stock_date" header="Date" sortable>
                        <template #body="{ data }">
                            {{ new Date(data.stock_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }}
                        </template>
                    </Column>
                    <Column field="quantity" header="Quantity" sortable>
                        <template #body="{ data }">
                            <span class="font-bold">{{ data.quantity }}</span>
                        </template>
                    </Column>
                </DataTable>
            </div>
        </div>
        <template #footer>
            <div class="flex justify-content-between w-full">
                <router-link to="/inventory/supplier-stock" class="no-underline">
                    <Button label="Manage Uploads" icon="pi pi-upload" severity="secondary" text />
                </router-link>
                <Button label="Close" icon="pi pi-times" text @click="showSupplierStockDialog = false" />
            </div>
        </template>
    </Dialog>
</template>