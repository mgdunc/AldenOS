import { ref, computed } from 'vue'
import Papa from 'papaparse'
import ExcelJS from 'exceljs'
import { z } from 'zod'
import { logger } from '@/lib/logger'

// --- TYPES ---
export interface ImportField {
    key: string
    label: string
    required: boolean
    aliases: string[] // For smart matching
}

export interface MappedColumn {
    systemField: string | null
    fileHeader: string
    sampleValue: any
}

// --- CONFIGURATION ---
const INVENTORY_FIELDS: ImportField[] = [
    { key: 'sku', label: 'Product SKU', required: true, aliases: ['sku', 'product', 'item', 'part number'] },
    { key: 'location', label: 'Location Name', required: true, aliases: ['location', 'bin', 'shelf', 'loc'] },
    { key: 'quantity', label: 'Quantity Change', required: true, aliases: ['qty', 'quantity', 'count', 'amount', 'change'] },
    { key: 'notes', label: 'Notes', required: false, aliases: ['notes', 'comment', 'description', 'reason'] }
]

const PRODUCT_FIELDS: ImportField[] = [
    { key: 'sku', label: 'SKU', required: true, aliases: ['sku', 'part number', 'item number', 'product code'] },
    { key: 'name', label: 'Name', required: true, aliases: ['name', 'title', 'product name', 'product title'] },
    { key: 'description', label: 'Description', required: false, aliases: ['description', 'desc', 'details'] },
    { key: 'cost_price', label: 'Cost Price', required: false, aliases: ['cost', 'cost price', 'buy price', 'unit cost'] },
    { key: 'list_price', label: 'List Price', required: false, aliases: ['price', 'list price', 'sell price', 'rrp', 'retail price'] },
    { key: 'compare_at_price', label: 'Compare At Price', required: false, aliases: ['compare at', 'compare price', 'was price', 'original price'] },
    { key: 'barcode', label: 'Barcode (UPC/EAN)', required: false, aliases: ['barcode', 'upc', 'ean', 'gtin'] },
    { key: 'carton_barcode', label: 'Carton Barcode', required: false, aliases: ['carton barcode', 'case barcode', 'itf', 'outer barcode'] },
    { key: 'carton_qty', label: 'Carton Qty', required: false, aliases: ['carton qty', 'pack size', 'inner qty', 'case qty', 'units per case'] },
    { key: 'supplier_sku', label: 'Supplier SKU', required: false, aliases: ['supplier sku', 'vendor sku', 'supplier code', 'vendor code', 'manufacturer part'] },
    { key: 'vendor', label: 'Brand / Vendor', required: false, aliases: ['vendor', 'brand', 'manufacturer'] },
    { key: 'product_type', label: 'Product Type', required: false, aliases: ['product type', 'category', 'type'] },
    { key: 'supplier', label: 'Supplier Name', required: false, aliases: ['supplier', 'supplier name'] },
    { key: 'status', label: 'Status', required: false, aliases: ['status', 'active', 'enabled'] }
]

const LOCATION_FIELDS: ImportField[] = [
    { key: 'name', label: 'Location Name', required: true, aliases: ['name', 'location', 'bin', 'shelf'] },
    { key: 'description', label: 'Description', required: false, aliases: ['description', 'desc', 'details'] },
    { key: 'is_sellable', label: 'Is Sellable', required: false, aliases: ['sellable', 'pickable', 'active'] },
    { key: 'is_default', label: 'Is Default', required: false, aliases: ['default', 'primary'] }
]

// Zod Schemas
const InventoryImportSchema = z.object({
    sku: z.string().min(1, "SKU is required"),
    location: z.string().min(1, "Location is required"),
    quantity: z.number({ invalid_type_error: "Quantity must be a number" } as any).int("Quantity must be an integer"),
    notes: z.string().optional()
})

const ProductImportSchema = z.object({
    sku: z.string().min(1, "SKU is required"),
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    cost_price: z.number().optional(),
    list_price: z.number().optional(),
    compare_at_price: z.number().optional(),
    barcode: z.string().optional(),
    carton_barcode: z.string().optional(),
    carton_qty: z.number().int().optional(),
    supplier_sku: z.string().optional(),
    vendor: z.string().optional(),
    product_type: z.string().optional(),
    supplier: z.string().optional(),
    status: z.string().optional()
})

const LocationImportSchema = z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    is_sellable: z.boolean().optional(),
    is_default: z.boolean().optional()
})

export function useImportMapper(mode: 'inventory' | 'products' | 'locations' = 'inventory') {
    const rawData = ref<any[]>([])
    const fileHeaders = ref<string[]>([])
    const columnMapping = ref<Record<string, string>>({}) // systemField -> fileHeader
    const validationErrors = ref<any[]>([])
    const validRows = ref<any[]>([])
    const isParsing = ref(false)

    const SYSTEM_FIELDS = computed(() => {
        if (mode === 'inventory') return INVENTORY_FIELDS
        if (mode === 'products') return PRODUCT_FIELDS
        return LOCATION_FIELDS
    })
    
    const Schema = computed(() => {
        if (mode === 'inventory') return InventoryImportSchema
        if (mode === 'products') return ProductImportSchema
        return LocationImportSchema
    })

    // --- 1. PARSING ---
    const parseFile = async (file: File) => {
        isParsing.value = true
        rawData.value = []
        fileHeaders.value = []
        columnMapping.value = {}
        validationErrors.value = []

        try {
            if (file.name.endsWith('.csv')) {
                await parseCSV(file)
            } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                await parseExcel(file)
            } else {
                throw new Error('Unsupported file type')
            }
            
            // Auto-Map Columns
            smartMapColumns()
        } catch (e) {
            logger.error('Error parsing file', e as Error)
            throw e
        } finally {
            isParsing.value = false
        }
    }

    const parseCSV = (file: File) => {
        return new Promise<void>((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    if (results.meta.fields) {
                        fileHeaders.value = results.meta.fields
                        rawData.value = results.data
                    }
                    resolve()
                },
                error: (err) => reject(err)
            })
        })
    }

    const parseExcel = async (file: File) => {
        const buffer = await file.arrayBuffer()
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(buffer)
        const worksheet = workbook.worksheets[0]
        if (!worksheet) return
        
        const jsonData: any[] = []
        const headers: string[] = []

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) {
                // Headers
                row.eachCell((cell, colNumber) => {
                    headers.push(cell.text)
                })
                fileHeaders.value = headers
            } else {
                // Data
                const rowData: any = {}
                row.eachCell((cell, colNumber) => {
                    const header = headers[colNumber - 1]
                    if (header) {
                        rowData[header] = cell.value
                    }
                })
                jsonData.push(rowData)
            }
        })
        rawData.value = jsonData
    }

    // --- 2. MAPPING ---
    const smartMapColumns = () => {
        const mapping: Record<string, string> = {}
        
        SYSTEM_FIELDS.value.forEach(field => {
            // Find best match in file headers
            const match = fileHeaders.value.find(header => {
                const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '')
                return field.aliases.some(alias => normalizedHeader.includes(alias))
            })
            
            if (match) {
                mapping[field.key] = match
            }
        })
        
        columnMapping.value = mapping
    }

    const getMappedData = () => {
        return rawData.value.map((row, index) => {
            const mappedRow: any = { _row: index + 1 }
            Object.entries(columnMapping.value).forEach(([systemKey, fileHeader]) => {
                if (fileHeader) {
                    let val = row[fileHeader]
                    
                    // Type coercion
                    if (['quantity', 'cost_price', 'list_price', 'compare_at_price', 'carton_qty'].includes(systemKey)) {
                        if (val === null || val === undefined || val === '') {
                            val = undefined
                        } else if (typeof val === 'string') {
                            // Remove currency symbols if present
                            const cleanVal = val.replace(/[^0-9.-]/g, '')
                            if (cleanVal.trim() === '') {
                                val = undefined
                            } else {
                                const num = parseFloat(cleanVal)
                                val = isNaN(num) ? undefined : num
                            }
                        }
                    } else if (['is_sellable', 'is_default'].includes(systemKey)) {
                        if (typeof val === 'string') {
                            const lower = val.toLowerCase().trim()
                            val = ['true', 'yes', '1', 'y'].includes(lower)
                        } else if (typeof val === 'number') {
                            val = val === 1
                        }
                    }
                    
                    mappedRow[systemKey] = val
                }
            })
            return mappedRow
        })
    }

    // --- 3. VALIDATION ---
    const validateData = () => {
        const data = getMappedData()
        const errors: any[] = []
        const valid: any[] = []

        data.forEach((row) => {
            const result = Schema.value.safeParse(row)
            if (result.success) {
                valid.push(result.data)
            } else {
                errors.push({
                    row: row._row,
                    data: row,
                    issues: result.error.issues.map(i => i.message)
                })
            }
        })

        validationErrors.value = errors
        validRows.value = valid
        return errors.length === 0
    }

    return {
        SYSTEM_FIELDS,
        rawData,
        fileHeaders,
        columnMapping,
        validationErrors,
        validRows,
        isParsing,
        parseFile,
        validateData
    }
}
