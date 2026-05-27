import XLSX from 'xlsx'
import { supabase, serviceRoleSupabase } from '../config/supabase.js'
import { parseBarcode } from '../helpers/barcodeParser.js'

const getClient = (req) => req.user?.role !== 'admin' ? serviceRoleSupabase : (req.supabase || supabase)

const TEMPLATE_HEADERS = ['Codigo de Barras', 'SKU', 'Nombre', 'Costo Unitario', 'Precio', 'Categoria', 'Stock Minimo', 'Stock Inicial']

export const generateTemplate = async (req, res) => {
    try {
        const sampleData = [
            ['7701234567890', 'CAF-001', 'Café Premium 500g', 18000, 28500, 'Café', 10, 50],
        ]

        const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...sampleData])
        ws['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 22 }))
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Productos')

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        res.setHeader('Content-Disposition', 'attachment; filename="plantilla-carga-masiva.xlsx"')
        res.send(buffer)
    } catch (error) {
        console.error('Template generation error:', error)
        res.status(500).json({ error: error.message })
    }
}

const COLUMN_MAP = {
    'nombre': 'name',
    'sku': 'sku',
    'codigo de barras': 'barcode',
    'precio': 'price',
    'costo unitario': 'unit_cost',
    'categoria': 'category',
    'stock inicial': 'stock',
    'stock minimo': 'min_stock',
}

const normalizeRow = (row) => {
    const normalized = {}
    for (const [key, value] of Object.entries(row)) {
        const mapped = COLUMN_MAP[key.toLowerCase().trim()]
        if (mapped) normalized[mapped] = value
    }
    return normalized
}

export const bulkCreateProducts = async (req, res) => {
    try {
        const client = getClient(req)
        const businessId = req.body.business_id

        if (!req.file) {
            return res.status(400).json({ error: 'No se ha subido ningún archivo' })
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
        const sheetName = workbook.SheetNames[0]
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName])

        if (!rows || rows.length === 0) {
            return res.status(400).json({ error: 'El archivo está vacío' })
        }

        const { data: existingCategories } = await client
            .from('categories')
            .select('id, name')
            .eq('business_id', businessId)

        const categoryMap = {}
        for (const cat of existingCategories || []) {
            categoryMap[cat.name.toLowerCase()] = cat.id
        }

        const seenSkus = new Set()
        const seenBarcodes = new Set()
        const results = { created: 0, errors: [], total: rows.length }

        for (let i = 0; i < rows.length; i++) {
            const row = normalizeRow(rows[i])
            const rowNum = i + 2

            try {
                const name = String(row.name || '').trim()
                const price = Number(row.price)

                if (!name) {
                    results.errors.push({ row: rowNum, error: 'El nombre es obligatorio' })
                    continue
                }
                if (!price || price <= 0) {
                    results.errors.push({ row: rowNum, error: 'El precio debe ser mayor a 0' })
                    continue
                }

                const sku = row.sku ? String(row.sku).trim() : ''
                const barcode = row.barcode ? String(row.barcode).trim() : ''
                const unitCost = row.unit_cost ? Number(row.unit_cost) : null
                const stock = row.stock ? Number(row.stock) : 0
                const minStock = row.min_stock ? Number(row.min_stock) : 0
                const categoryName = row.category ? String(row.category).trim() : ''

                if (sku) {
                    const skuLower = sku.toLowerCase()
                    if (seenSkus.has(skuLower)) {
                        results.errors.push({ row: rowNum, error: `SKU duplicado en el mismo archivo: "${sku}"` })
                        continue
                    }
                    seenSkus.add(skuLower)

                    const { data: existing } = await client
                        .from('products')
                        .select('id')
                        .eq('sku', sku)
                        .eq('business_id', businessId)
                        .maybeSingle()

                    if (existing) {
                        results.errors.push({ row: rowNum, error: `Ya existe un producto con el SKU "${sku}"` })
                        continue
                    }
                }

                if (barcode) {
                    const barcodeLower = barcode.toLowerCase()
                    if (seenBarcodes.has(barcodeLower)) {
                        results.errors.push({ row: rowNum, error: `Código de barras duplicado en el mismo archivo: "${barcode}"` })
                        continue
                    }
                    seenBarcodes.add(barcodeLower)

                    const { data: existing } = await client
                        .from('products')
                        .select('id')
                        .eq('barcode', barcode)
                        .eq('business_id', businessId)
                        .maybeSingle()

                    if (existing) {
                        results.errors.push({ row: rowNum, error: `Ya existe un producto con el código de barras "${barcode}"` })
                        continue
                    }
                }

                let categoryId = null
                if (categoryName) {
                    const lowerName = categoryName.toLowerCase()
                    if (categoryMap[lowerName]) {
                        categoryId = categoryMap[lowerName]
                    } else {
                        const { data: newCat, error: catError } = await client
                            .from('categories')
                            .insert({ business_id: businessId, name: categoryName })
                            .select('id, name')
                            .single()

                        if (catError) {
                            results.errors.push({ row: rowNum, error: `Error al crear categoría "${categoryName}"` })
                            continue
                        }
                        categoryId = newCat.id
                        categoryMap[lowerName] = newCat.id
                    }
                }

                const productData = {
                    business_id: businessId,
                    name,
                    price,
                    sku: sku || null,
                    barcode: parseBarcode(barcode || null),
                    unit_cost: unitCost,
                    category_id: categoryId,
                    track_stock: stock > 0,
                }

                const { data: product, error: productError } = await client
                    .from('products')
                    .insert(productData)
                    .select('id, name, track_stock')
                    .single()

                if (productError) {
                    results.errors.push({ row: rowNum, error: `Error al crear producto: ${productError.message}` })
                    continue
                }

                if (stock > 0) {
                    const now = new Date()
                    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

                    const { error: movError } = await client
                        .from('inventory_movements')
                        .insert({
                            business_id: businessId,
                            product_id: product.id,
                            type: 'entry',
                            quantity: stock,
                            unit_cost: unitCost ?? 0,
                            notes: 'Carga masiva inicial',
                            created_at: localDate,
                        })

                    if (movError) {
                        results.errors.push({ row: rowNum, error: `Producto creado pero error en inventario: ${movError.message}` })
                    } else {
                        const { error: stockUpdateError } = await client
                            .from('inventory')
                            .update({ stock })
                            .eq('product_id', product.id)

                        if (stockUpdateError) {
                            results.errors.push({ row: rowNum, error: `Producto creado pero error al actualizar stock: ${stockUpdateError.message}` })
                        }
                    }
                }

                if (minStock > 0) {
                    const { error: minStockError } = await client
                        .from('inventory')
                        .update({ min_stock: minStock })
                        .eq('product_id', product.id)

                    if (minStockError) {
                        results.errors.push({ row: rowNum, error: `Producto creado pero error al actualizar stock mínimo: ${minStockError.message}` })
                    }
                }

                results.created++
            } catch (rowError) {
                results.errors.push({ row: rowNum, error: rowError.message })
            }
        }

        res.json(results)
    } catch (error) {
        console.error('Bulk upload error:', error)
        res.status(500).json({ error: error.message })
    }
}

export const getProducts = async (req, res) => {
    const client = getClient(req)
    const { data, error } = await client
        .from('products')
        .select(
            `id,
            business_id,
            created_at,
            name,
            sku,
            barcode,
            price,
            unit_cost,
            is_active,
            track_stock,
            categories (
                id,
                name
            ),
            inventory (
                stock,
                min_stock
            )`
        )
        .eq('business_id', req.params.businessId)

    if (error) return res.status(500).json(error)
    res.json(data)
}
export const getProductById = async (req, res) => {
    const client = getClient(req)
    const { data, error } = await client
        .from('products')
        .select(
            `id,
            business_id,
            created_at,
            name,
            sku,
            barcode,
            price,
            unit_cost,
            is_active,
            track_stock,
            categories (
                id,
                name
            ),
            inventory (
                stock,
                min_stock
            )`
        )
        .eq('id', req.params.ProductId)
        .single()

    if (error) return res.status(500).json(error)
    res.json(data)
}

export const createProduct = async (req, res) => {
    try {
        const client = getClient(req)
        const { sku, business_id, barcode } = req.body
        req.body.barcode = parseBarcode(barcode)

        if (sku) {
            const { data: existing } = await client
                .from('products')
                .select('id')
                .eq('sku', sku)
                .eq('business_id', business_id)
                .maybeSingle()

            if (existing) {
                return res.status(409).json({ error: 'Ya existe un producto con este SKU' })
            }
        }

        const { data, error } = await client
            .from('products')
            .insert(req.body)
            .select(
                `id,
                business_id,
                created_at,
                name,
                sku,
                barcode,
                price,
                unit_cost,
                is_active,
                track_stock,
                categories (
                    id,
                    name
                ),
                inventory (
                    stock,
                    min_stock
                )`
            )

        if (error) throw error
        res.status(201).json({ status: 201, message: 'Producto Creado', data })
    } catch (error) {
        console.error('Create product error:', error)
        res.status(500).json({ error: error.message })
    }
}
export const updateProduct = async (req, res) => {
    try {
        const client = getClient(req)
        const { ProductId } = req.params
        const { sku, business_id, barcode } = req.body
        req.body.barcode = parseBarcode(barcode)

        if (sku && business_id) {
            const { data: existing } = await client
                .from('products')
                .select('id')
                .eq('sku', sku)
                .eq('business_id', business_id)
                .neq('id', ProductId)
                .maybeSingle()

            if (existing) {
                return res.status(409).json({ error: 'Ya existe otro producto con este SKU' })
            }
        }

        const { data, error } = await client
            .from('products')
            .update(req.body)
            .eq('id', ProductId)
            .select(
                `id,
                business_id,
                created_at,
                name,
                sku,
                barcode,
                price,
                unit_cost,
                is_active,
                track_stock,
                categories (
                    id,
                    name
                ),
                inventory (
                    stock,
                    min_stock
                )`
            )

        if (error) throw error
        res.json({ status: 200, message: 'Producto Actualizado', data: data[0] })
    } catch (error) {
        console.error('Update product error:', error)
        res.status(500).json({ error: error.message })
    }
}
export const deleteProduct = async (req, res) => {
    const client = getClient(req)
    const { ProductId } = req.params

    try {
        const { data, error } = await client
            .from('products')
            .delete()
            .eq('id', ProductId)
            .select()

        if (error) {
            if (error.code === '23503') {
                const { data: updatedData, error: updateError } = await client
                    .from('products')
                    .update({ is_active: false })
                    .eq('id', ProductId)
                    .select()
                
                if (updateError) throw updateError
                return res.json({ 
                    status: 200, 
                    message: 'Producto con historial de ventas: se ha marcado como inactivo', 
                    data: updatedData[0],
                    softDeleted: true 
                })
            }
            throw error
        }

        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' })
        }

        const { error: invError } = await client
            .from('inventory')
            .delete()
            .eq('product_id', ProductId)

        if (invError) throw invError

        res.json({ status: 200, message: 'Producto Eliminado permanentemente', data: data[0] })
    } catch (error) {
        console.error('Delete error:', error)
        res.status(500).json({ error: error.message })
    }
}
