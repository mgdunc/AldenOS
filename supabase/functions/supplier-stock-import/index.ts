import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ImportResult {
  success: boolean
  uploadId?: string
  totalRows: number
  matchedCount: number
  unmatchedCount: number
  matched: Array<{ sku: string; productName: string; quantity: number }>
  unmatched: Array<{ sku: string; productName?: string; quantity: number }>
  error?: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get authorization header for user context
    const authHeader = req.headers.get('Authorization')
    let userId: string | null = null
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user } } = await supabase.auth.getUser(token)
      userId = user?.id || null
    }

    // Parse form data
    const formData = await req.formData()
    const file = formData.get('file') as File
    const supplierId = formData.get('supplierId') as string
    const stockDateStr = formData.get('stockDate') as string
    const skuColumn = formData.get('skuColumn') as string || 'SKU'
    const qtyColumn = formData.get('qtyColumn') as string || 'Quantity'
    const nameColumn = formData.get('nameColumn') as string || 'Product Name'

    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: 'No file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const stockDate = stockDateStr || new Date().toISOString().split('T')[0]

    console.log(`[supplier-stock-import] Processing file: ${file.name}, size: ${file.size}, stockDate: ${stockDate}`)

    // Create upload record
    const { data: upload, error: uploadError } = await supabase
      .from('supplier_stock_uploads')
      .insert({
        supplier_id: supplierId || null,
        stock_date: stockDate,
        file_name: file.name,
        status: 'processing',
        created_by: userId
      })
      .select()
      .single()

    if (uploadError) {
      console.error('[supplier-stock-import] Failed to create upload record:', uploadError)
      throw new Error('Failed to create upload record')
    }

    const uploadId = upload.id

    try {
      // Read file as array buffer
      const arrayBuffer = await file.arrayBuffer()
      const data = new Uint8Array(arrayBuffer)

      // Parse spreadsheet
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet)

      console.log(`[supplier-stock-import] Parsed ${rows.length} rows from sheet: ${sheetName}`)

      if (rows.length === 0) {
        throw new Error('No data found in spreadsheet')
      }

      // Log first row to help with debugging column names
      console.log('[supplier-stock-import] First row columns:', Object.keys(rows[0]))

      // Get all products with supplier_sku for matching
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, sku, name, supplier_sku, supplier_id')

      if (productsError) {
        throw new Error('Failed to fetch products for matching')
      }

      // Create lookup maps for matching
      const productsBySupplierSku = new Map<string, any>()
      const productsBySku = new Map<string, any>()

      for (const product of products || []) {
        if (product.supplier_sku) {
          productsBySupplierSku.set(product.supplier_sku.toLowerCase().trim(), product)
        }
        if (product.sku) {
          productsBySku.set(product.sku.toLowerCase().trim(), product)
        }
      }

      const matched: Array<{ sku: string; productName: string; quantity: number; productId: string }> = []
      const unmatched: Array<{ sku: string; productName?: string; quantity: number; rawData: any }> = []

      // Process each row
      for (const row of rows) {
        // Try to find SKU column (case-insensitive)
        const skuValue = findColumnValue(row, [skuColumn, 'SKU', 'sku', 'Sku', 'supplier_sku', 'Supplier SKU', 'Part Number', 'Item Code', 'Code'])
        const qtyValue = findColumnValue(row, [qtyColumn, 'Quantity', 'quantity', 'Qty', 'qty', 'QTY', 'Stock', 'Available', 'On Hand'])
        const nameValue = findColumnValue(row, [nameColumn, 'Product Name', 'Name', 'name', 'Description', 'Product', 'Item'])

        if (!skuValue) {
          continue // Skip rows without SKU
        }

        const sku = String(skuValue).trim()
        const quantity = parseInt(String(qtyValue || 0).replace(/[^0-9-]/g, '')) || 0

        // Try to match by supplier_sku first, then by regular sku
        const normalizedSku = sku.toLowerCase()
        let product = productsBySupplierSku.get(normalizedSku) || productsBySku.get(normalizedSku)

        if (product) {
          matched.push({
            sku,
            productName: product.name,
            quantity,
            productId: product.id
          })
        } else {
          unmatched.push({
            sku,
            productName: nameValue ? String(nameValue) : undefined,
            quantity,
            rawData: row
          })
        }
      }

      console.log(`[supplier-stock-import] Matched: ${matched.length}, Unmatched: ${unmatched.length}`)

      // Insert matched stock levels (upsert to handle duplicates)
      if (matched.length > 0) {
        const stockLevels = matched.map(m => ({
          product_id: m.productId,
          supplier_id: supplierId || null,
          quantity: m.quantity,
          stock_date: stockDate,
          upload_id: uploadId
        }))

        const { error: stockError } = await supabase
          .from('supplier_stock_levels')
          .upsert(stockLevels, {
            onConflict: 'product_id,supplier_id,stock_date',
            ignoreDuplicates: false
          })

        if (stockError) {
          console.error('[supplier-stock-import] Failed to insert stock levels:', stockError)
          throw new Error('Failed to save stock levels')
        }
      }

      // Insert unmatched for review
      if (unmatched.length > 0) {
        const unmatchedRecords = unmatched.map(u => ({
          upload_id: uploadId,
          supplier_sku: u.sku,
          product_name: u.productName,
          quantity: u.quantity,
          raw_data: u.rawData
        }))

        const { error: unmatchedError } = await supabase
          .from('supplier_stock_unmatched')
          .insert(unmatchedRecords)

        if (unmatchedError) {
          console.error('[supplier-stock-import] Failed to insert unmatched:', unmatchedError)
        }
      }

      // Update upload record with stats
      await supabase
        .from('supplier_stock_uploads')
        .update({
          status: 'completed',
          total_rows: rows.length,
          matched_count: matched.length,
          unmatched_count: unmatched.length
        })
        .eq('id', uploadId)

      const result: ImportResult = {
        success: true,
        uploadId,
        totalRows: rows.length,
        matchedCount: matched.length,
        unmatchedCount: unmatched.length,
        matched: matched.map(m => ({ sku: m.sku, productName: m.productName, quantity: m.quantity })),
        unmatched: unmatched.map(u => ({ sku: u.sku, productName: u.productName, quantity: u.quantity }))
      }

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } catch (processError: any) {
      // Update upload record with error
      await supabase
        .from('supplier_stock_uploads')
        .update({
          status: 'failed',
          error_message: processError.message
        })
        .eq('id', uploadId)

      throw processError
    }

  } catch (error: any) {
    console.error('[supplier-stock-import] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Helper to find a column value with multiple possible names
function findColumnValue(row: any, possibleNames: string[]): any {
  for (const name of possibleNames) {
    if (row[name] !== undefined) {
      return row[name]
    }
  }
  // Try case-insensitive match
  const rowKeys = Object.keys(row)
  for (const name of possibleNames) {
    const found = rowKeys.find(k => k.toLowerCase() === name.toLowerCase())
    if (found && row[found] !== undefined) {
      return row[found]
    }
  }
  return undefined
}

