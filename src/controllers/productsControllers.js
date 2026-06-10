import XLSX from 'xlsx'
import { supabase, serviceRoleSupabase } from '../config/supabase.js'
import { parseBarcode } from '../helpers/barcodeParser.js'

const getClient = (req) => req.user?.role !== 'admin' ? serviceRoleSupabase : (req.supabase || supabase)

const TEMPLATE_HEADERS = ['Codigo de Barras', 'SKU', 'Nombre', 'Tipo Variacion', 'Nombre Variacion', 'Costo Unitario', 'Precio', 'Categoria', 'Stock Inicial', 'Stock Minimo']

export const generateTemplate = async (req, res) => {
    try {
        const sampleData = [
            ['7701234567890', 'CAF-001', 'Café Premium 500g', '', '', 18000, 28500, 'Café', 50, 10],
            ['', 'CAM-S', 'Camiseta Deportiva', 'Talla', 'S', 15000, 25000, 'Ropa', 50, 10],
            ['', 'CAM-M', 'Camiseta Deportiva', 'Talla', 'M', 16000, 27000, 'Ropa', 40, 10],
            ['', 'CAM-L', 'Camiseta Deportiva', 'Talla', 'L', 17000, 29000, 'Ropa', 30, 5],
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

const getLocalDate = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
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
    'tipo variacion': 'variation_type',
    'nombre variacion': 'variation_name',
}

const normalizeRow = (row) => {
    const normalized = {}
    for (const [key, value] of Object.entries(row)) {
        const mapped = COLUMN_MAP[key.toLowerCase().trim()]
        if (mapped) normalized[mapped] = value
    }
    return normalized
}

const createSimpleProduct = async (client, businessId, row, results, categoryMap, seenSkus, seenBarcodes, rowNum) => {
    const name = String(row.name || '').trim()
    const price = Number(row.price)

    if (!name) {
        results.errors.push({ row: rowNum, error: 'El nombre es obligatorio' })
        return
    }
    if (!price || price <= 0) {
        results.errors.push({ row: rowNum, error: 'El precio debe ser mayor a 0' })
        return
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
            return
        }
        seenSkus.add(skuLower)

        const { data: existing } = await client
            .from('product_variations')
            .select('id, product_id')
            .eq('sku', sku)
            .maybeSingle()

        if (existing) {
            const { data: prod } = await client
                .from('products')
                .select('business_id')
                .eq('id', existing.product_id)
                .single()
            if (prod && prod.business_id === businessId) {
                results.errors.push({ row: rowNum, error: `Ya existe una variante con el SKU "${sku}"` })
                return
            }
        }
    }

    if (barcode) {
        const barcodeLower = barcode.toLowerCase()
        if (seenBarcodes.has(barcodeLower)) {
            results.errors.push({ row: rowNum, error: `Código de barras duplicado en el mismo archivo: "${barcode}"` })
            return
        }
        seenBarcodes.add(barcodeLower)

        const { data: existing } = await client
            .from('product_variations')
            .select('id, product_id')
            .eq('barcode', barcode)
            .maybeSingle()

        if (existing) {
            const { data: prod } = await client
                .from('products')
                .select('business_id')
                .eq('id', existing.product_id)
                .single()
            if (prod && prod.business_id === businessId) {
                results.errors.push({ row: rowNum, error: `Ya existe una variante con el código de barras "${barcode}"` })
                return
            }
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
                return
            }
            categoryId = newCat.id
            categoryMap[lowerName] = newCat.id
        }
    }

    const { data: product, error: productError } = await client
        .from('products')
        .insert({
            business_id: businessId,
            name,
            category_id: categoryId,
            variations_disabled: true,
        })
        .select('id, name')
        .single()

    if (productError) {
        results.errors.push({ row: rowNum, error: `Error al crear producto: ${productError.message}` })
        return
    }

    const { data: defaultVariation, error: varError } = await client
        .from('product_variations')
        .insert({
            product_id: product.id,
            variation_name: 'Default',
            price,
            unit_cost: unitCost ?? 0,
            sku: sku || null,
            barcode: parseBarcode(barcode || null),
            stock,
            min_stock: minStock,
            track_stock: stock > 0,
            is_active: true,
            sort_order: 0,
        })
        .select()
        .single()

    if (varError) {
        await client.from('products').delete().eq('id', product.id)
        results.errors.push({ row: rowNum, error: `Error al crear variante default: ${varError.message}` })
        return
    }

    const localDate = getLocalDate()

    if (stock > 0) {
        const { error: movError } = await client
            .from('inventory_movements')
            .insert({
                business_id: businessId,
                product_id: product.id,
                variation_id: defaultVariation.id,
                type: 'entry',
                quantity: stock,
                unit_cost: unitCost ?? 0,
                notes: 'Carga masiva inicial',
                created_at: localDate,
            })

        if (movError) {
            results.errors.push({ row: rowNum, error: `Producto creado pero error en inventario: ${movError.message}` })
        }
    }

    results.created++
}

const createVariationProduct = async (client, businessId, group, results, categoryMap) => {
    const { name: productName, variationType, variations } = group

    const { data: existing } = await client
        .from('products')
        .select('id')
        .eq('name', productName)
        .eq('business_id', businessId)
        .maybeSingle()

    if (existing) {
        results.errors.push({ error: `Ya existe un producto llamado "${productName}"` })
        return
    }

    let categoryId = null
    const firstVar = variations[0]
    const categoryName = String(firstVar.category || '').trim()
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

            if (!catError) {
                categoryId = newCat.id
                categoryMap[lowerName] = newCat.id
            }
        }
    }

    const { data: product, error: productError } = await client
        .from('products')
        .insert({
            business_id: businessId,
            name: productName,
            category_id: categoryId,
            variation_type: variationType,
        })
        .select('id, name')
        .single()

    if (productError) {
        results.errors.push({ error: `Error al crear producto "${productName}": ${productError.message}` })
        return
    }

    await client
        .from('product_variations')
        .insert({
            product_id: product.id,
            variation_name: 'Default',
            price: 0,
            unit_cost: 0,
            stock: 0,
            min_stock: 0,
            is_active: false,
            sort_order: 0,
        })

    const variationInserts = variations.map((v, i) => ({
        product_id: product.id,
        variation_name: String(v.variation_name || '').trim(),
        price: Number(v.price) || 0,
        unit_cost: Number(v.unit_cost) || 0,
        sku: v.sku ? String(v.sku).trim() : null,
        barcode: parseBarcode(v.barcode ? String(v.barcode).trim() : null),
        stock: Number(v.stock) || 0,
        min_stock: Number(v.min_stock) || 0,
        track_stock: true,
        sort_order: i + 1,
        is_active: true,
    }))

    const { data: createdVariations, error: varError } = await client
        .from('product_variations')
        .insert(variationInserts)
        .select()

    if (varError) {
        results.errors.push({ error: `Error al crear variaciones para "${productName}": ${varError.message}` })
        return
    }

    if (createdVariations) {
        const localDate = getLocalDate()
        const movInserts = createdVariations
            .filter(v => v.stock > 0)
            .map(v => ({
                business_id: businessId,
                product_id: product.id,
                variation_id: v.id,
                type: 'entry',
                quantity: v.stock,
                unit_cost: v.unit_cost || 0,
                notes: 'Carga masiva inicial',
                created_at: localDate,
            }))

        if (movInserts.length > 0) {
            const { error: movError } = await client
                .from('inventory_movements')
                .insert(movInserts)

            if (movError) {
                results.errors.push({ error: `Producto "${productName}" creado pero error en movimientos de inventario: ${movError.message}` })
            }
        }
    }

    results.created++
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
        const variationGroups = {}

        for (let i = 0; i < rows.length; i++) {
            const row = normalizeRow(rows[i])
            const rowNum = i + 2

            const variationType = row.variation_type ? String(row.variation_type).trim() : ''
            const variationName = row.variation_name ? String(row.variation_name).trim() : ''

            if (variationType && variationName) {
                const name = String(row.name || '').trim()
                if (!name) {
                    results.errors.push({ row: rowNum, error: 'El nombre del producto es obligatorio para variaciones' })
                    continue
                }
                if (!row.price || Number(row.price) <= 0) {
                    results.errors.push({ row: rowNum, error: 'El precio de la variación debe ser mayor a 0' })
                    continue
                }

                const key = `${name.toLowerCase()}|${variationType.toLowerCase()}`
                if (!variationGroups[key]) {
                    variationGroups[key] = { name, variationType, variations: [] }
                }
                variationGroups[key].variations.push({ ...row, variation_name: variationName })
            } else {
                await createSimpleProduct(client, businessId, row, results, categoryMap, seenSkus, seenBarcodes, rowNum)
            }
        }

        for (const [, group] of Object.entries(variationGroups)) {
            await createVariationProduct(client, businessId, group, results, categoryMap)
        }

        res.json(results)
    } catch (error) {
        console.error('Bulk upload error:', error)
        res.status(500).json({ error: error.message })
    }
}

const PRODUCT_SELECT = `
    id,
    business_id,
    created_at,
    name,
    is_active,
    variation_type,
    variations_disabled,
    categories (
        id,
        name
    ),
    product_variations (
        id,
        variation_name,
        price,
        unit_cost,
        sku,
        barcode,
        stock,
        is_active,
        sort_order,
        min_stock,
        track_stock
    )
`

export const getProducts = async (req, res) => {
    const client = getClient(req)
    const { data, error } = await client
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('business_id', req.params.businessId)
        .order('created_at', { ascending: false })

    if (error) return res.status(500).json(error)
    res.json(data)
}
export const getProductById = async (req, res) => {
    const client = getClient(req)
    const { data, error } = await client
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('id', req.params.ProductId)
        .single()

    if (error) return res.status(500).json(error)
    res.json(data)
}

export const createProduct = async (req, res) => {
    try {
        const client = getClient(req)
        const { sku, business_id, barcode, variations, variation_type, initial_stock, min_stock_inicial, price, unit_cost, track_stock, ...productFields } = req.body

        if (sku) {
            const { data: existing } = await client
                .from('product_variations')
                .select('id, product_id')
                .eq('sku', sku)
                .maybeSingle()

            if (existing) {
                const { data: prod } = await client
                    .from('products')
                    .select('business_id')
                    .eq('id', existing.product_id)
                    .single()
                if (prod && prod.business_id === business_id) {
                    return res.status(409).json({ error: 'Ya existe una variante con este SKU' })
                }
            }
        }

        const hasVariations = variations && variations.length > 0

        const { data, error } = await client
            .from('products')
            .insert({
                ...productFields,
                business_id,
                variation_type: hasVariations ? (variation_type || null) : null,
            })
            .select(PRODUCT_SELECT)

        if (error) throw error

        const product = Array.isArray(data) ? data[0] : data
        const localDate = getLocalDate()

        if (hasVariations) {
            const { data: defaultVarData } = await client
                .from('product_variations')
                .insert({
                    product_id: product.id,
                    variation_name: 'Default',
                    price: 0,
                    unit_cost: 0,
                    stock: 0,
                    min_stock: 0,
                    is_active: false,
                    sort_order: 0,
                })
                .select()
                .single()

            const variationInserts = variations.map((v, i) => ({
                product_id: product.id,
                variation_name: v.variation_name,
                price: v.price,
                unit_cost: v.unit_cost || 0,
                sku: v.sku || null,
                barcode: parseBarcode(v.barcode || null),
                stock: v.stock || 0,
                min_stock: v.min_stock || 0,
                track_stock: v.track_stock ?? true,
                sort_order: i + 1,
                is_active: v.is_active !== false,
            }))

            const { data: createdVariations, error: varError } = await client
                .from('product_variations')
                .insert(variationInserts)
                .select()

            if (varError) {
                await client.from('products').delete().eq('id', product.id)
                throw varError
            }

            product.product_variations = [defaultVarData, ...(createdVariations || [])]

            for (const v of createdVariations || []) {
                if (v.stock > 0) {
                    await client.from('inventory_movements').insert({
                        business_id,
                        product_id: product.id,
                        variation_id: v.id,
                        type: 'entry',
                        quantity: v.stock,
                        unit_cost: v.unit_cost ?? 0,
                        notes: 'Stock inicial de variación',
                        created_at: localDate,
                    })
                }
            }
        } else {
            const initStock = Number(initial_stock) || 0
            const initMinStock = Number(min_stock_inicial) || 0

            const { data: defaultVariation, error: varError } = await client
                .from('product_variations')
                .insert({
                    product_id: product.id,
                    variation_name: 'Default',
                    price: price ?? 0,
                    unit_cost: unit_cost ?? 0,
                    sku: sku || null,
                    barcode: parseBarcode(barcode || null),
                    stock: initStock,
                    min_stock: initMinStock,
                    track_stock: track_stock ?? true,
                    is_active: true,
                    sort_order: 0,
                })
                .select()
                .single()

            if (varError) {
                await client.from('products').delete().eq('id', product.id)
                throw varError
            }

            product.product_variations = [defaultVariation]

            if (initStock > 0) {
                await client.from('inventory_movements').insert({
                    business_id,
                    product_id: product.id,
                    variation_id: defaultVariation.id,
                    type: 'entry',
                    quantity: initStock,
                    unit_cost: defaultVariation.unit_cost ?? 0,
                    notes: 'Stock inicial',
                    created_at: localDate,
                })
            }
        }

        res.status(201).json({ status: 201, message: 'Producto Creado', data: product })
    } catch (error) {
        console.error('Create product error:', error)
        res.status(500).json({ error: error.message })
    }
}
export const updateProduct = async (req, res) => {
    try {
        const client = getClient(req)
        const { ProductId } = req.params
        const { sku, business_id, barcode, variations, variation_type, price, unit_cost, initial_stock, min_stock_inicial, track_stock, ...productFields } = req.body

        if (sku && business_id) {
            const { data: existing } = await client
                .from('product_variations')
                .select('id')
                .eq('sku', sku)
                .neq('product_id', ProductId)
                .maybeSingle()

            if (existing) {
                return res.status(409).json({ error: 'Ya existe otra variante con este SKU' })
            }
        }

        const { data, error } = await client
            .from('products')
            .update({ ...productFields, variation_type: variation_type || null })
            .eq('id', ProductId)
            .select(PRODUCT_SELECT)

        if (error) throw error

        const product = data[0]

        if (variations !== undefined && variations.length > 0) {
            await client
                .from('product_variations')
                .update({ is_active: false })
                .eq('product_id', ProductId)
                .eq('variation_name', 'Default')

            const keepIds = variations.filter(v => v.id).map(v => v.id)
            if (keepIds.length > 0) {
                await client
                    .from('product_variations')
                    .delete()
                    .eq('product_id', ProductId)
                    .neq('variation_name', 'Default')
                    .not('id', 'in', `(${keepIds.map(id => `'${id}'`).join(',')})`)
            } else {
                await client
                    .from('product_variations')
                    .delete()
                    .eq('product_id', ProductId)
                    .neq('variation_name', 'Default')
            }

            const localDate = getLocalDate()

            for (let i = 0; i < variations.length; i++) {
                const v = variations[i]
                const varData = {
                    product_id: ProductId,
                    variation_name: v.variation_name,
                    price: v.price,
                    unit_cost: v.unit_cost || 0,
                    sku: v.sku || null,
                    barcode: parseBarcode(v.barcode || null),
                    stock: v.stock || 0,
                    min_stock: v.min_stock || 0,
                    track_stock: v.track_stock ?? true,
                    sort_order: i + 1,
                    is_active: v.is_active !== false,
                }

                if (v.id) {
                    await client
                        .from('product_variations')
                        .update(varData)
                        .eq('id', v.id)
                } else {
                    const { data: newVar, error: newVarError } = await client
                        .from('product_variations')
                        .insert(varData)
                        .select()

                    if (newVarError) throw newVarError

                    if (newVar?.[0]?.stock > 0) {
                        await client.from('inventory_movements').insert({
                            business_id: product.business_id,
                            product_id: ProductId,
                            variation_id: newVar[0].id,
                            type: 'entry',
                            quantity: newVar[0].stock,
                            unit_cost: newVar[0].unit_cost ?? 0,
                            notes: 'Stock inicial de variación',
                            created_at: localDate,
                        })
                    }
                }
            }

            const { data: updatedProduct } = await client
                .from('products')
                .select(PRODUCT_SELECT)
                .eq('id', ProductId)
                .single()

            return res.json({ status: 200, message: 'Producto Actualizado', data: updatedProduct })
        }

        if (variations !== undefined && variations.length === 0) {
            const localDate = getLocalDate()

            await client
                .from('product_variations')
                .update({ is_active: false })
                .eq('product_id', ProductId)
                .neq('variation_name', 'Default')

            const { data: existingDefault } = await client
                .from('product_variations')
                .select('id')
                .eq('product_id', ProductId)
                .eq('variation_name', 'Default')
                .maybeSingle()

            if (existingDefault) {
                const varUpdate = {}
                if (price !== undefined) varUpdate.price = price
                if (unit_cost !== undefined) varUpdate.unit_cost = unit_cost
                if (sku !== undefined) varUpdate.sku = sku
                if (barcode !== undefined) varUpdate.barcode = parseBarcode(barcode)
                if (initial_stock !== undefined) varUpdate.stock = Number(initial_stock)
                if (min_stock_inicial !== undefined) varUpdate.min_stock = Number(min_stock_inicial)
                if (track_stock !== undefined) varUpdate.track_stock = track_stock
                varUpdate.is_active = true

                await client
                    .from('product_variations')
                    .update(varUpdate)
                    .eq('id', existingDefault.id)
            } else {
                const { error: newDefaultError } = await client
                    .from('product_variations')
                    .insert({
                        product_id: ProductId,
                        variation_name: 'Default',
                        price: price ?? 0,
                        unit_cost: unit_cost ?? 0,
                        sku: sku || null,
                        barcode: parseBarcode(barcode || null),
                        stock: Number(initial_stock) || 0,
                        min_stock: Number(min_stock_inicial) || 0,
                        track_stock: track_stock ?? true,
                        is_active: true,
                        sort_order: 0,
                    })

                if (newDefaultError) throw newDefaultError
            }

            const { data: refreshedProduct } = await client
                .from('products')
                .select(PRODUCT_SELECT)
                .eq('id', ProductId)
                .single()

            return res.json({ status: 200, message: 'Producto Actualizado', data: refreshedProduct })
        }

        // Si no se enviaron variaciones, actualizar la variante default
        const localDate = getLocalDate()
        const { data: defaultVar } = await client
            .from('product_variations')
            .select('id')
            .eq('product_id', ProductId)
            .eq('sort_order', 0)
            .maybeSingle()

        if (defaultVar) {
            const varUpdate = {}
            if (price !== undefined) varUpdate.price = price
            if (unit_cost !== undefined) varUpdate.unit_cost = unit_cost
            if (sku !== undefined) varUpdate.sku = sku
            if (barcode !== undefined) varUpdate.barcode = parseBarcode(barcode)
            if (initial_stock !== undefined) varUpdate.stock = Number(initial_stock)
            if (min_stock_inicial !== undefined) varUpdate.min_stock = Number(min_stock_inicial)
            if (track_stock !== undefined) varUpdate.track_stock = track_stock

            if (Object.keys(varUpdate).length > 0) {
                await client.from('product_variations').update(varUpdate).eq('id', defaultVar.id)
            }
        }

        const { data: refreshedProduct } = await client
            .from('products')
            .select(PRODUCT_SELECT)
            .eq('id', ProductId)
            .single()

        res.json({ status: 200, message: 'Producto Actualizado', data: refreshedProduct })
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

        res.json({ status: 200, message: 'Producto Eliminado permanentemente', data: data[0] })
    } catch (error) {
        console.error('Delete error:', error)
        res.status(500).json({ error: error.message })
    }
}

export const updateVariation = async (req, res) => {
    const client = getClient(req)
    const { variationId } = req.params
    const { unit_cost, price, stock, min_stock, ...rest } = req.body

    try {
        const updateData = {
            ...rest,
            price: price !== undefined ? price : undefined,
            unit_cost: unit_cost !== undefined ? unit_cost : undefined,
            stock: stock !== undefined ? Number(stock) : undefined,
            min_stock: min_stock !== undefined ? Number(min_stock) : undefined,
        }

        Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key])

        const { data, error } = await client
            .from('product_variations')
            .update(updateData)
            .eq('id', variationId)
            .select()

        if (error) throw error
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Variación no encontrada' })
        }

        res.json({ status: 200, message: 'Variación actualizada', data: data[0] })
    } catch (error) {
        console.error('Update variation error:', error)
        res.status(500).json({ error: error.message })
    }
}

export const deleteVariation = async (req, res) => {
    const client = getClient(req)
    const { variationId } = req.params

    try {
        const { data, error } = await client
            .from('product_variations')
            .delete()
            .eq('id', variationId)
            .select()

        if (error) {
            if (error.code === '23503') {
                const { data: updatedData, error: updateError } = await client
                    .from('product_variations')
                    .update({ is_active: false })
                    .eq('id', variationId)
                    .select()

                if (updateError) throw updateError
                return res.json({ 
                    status: 200, 
                    message: 'Variación con movimientos de inventario: se ha marcado como inactiva', 
                    data: updatedData[0],
                    softDeleted: true 
                })
            }
            throw error
        }

        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Variación no encontrada' })
        }

        res.json({ status: 200, message: 'Variación eliminada', data: data[0] })
    } catch (error) {
        console.error('Delete variation error:', error)
        res.status(500).json({ error: error.message })
    }
}
