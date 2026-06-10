import { supabase, serviceRoleSupabase } from '../config/supabase.js'

const getClient = (req) => req.user?.role !== 'admin' ? serviceRoleSupabase : (req.supabase || supabase)

const getLocalDate = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
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

export const adjustInventory = async (req, res) => {
    const client = getClient(req)
    const { productId } = req.params
    const { movement_type, quantity, unit_cost, min_stock, notes, business_id, variation_id } = req.body

    if (!movement_type || !['entry', 'exit'].includes(movement_type)) {
        return res.status(400).json({ error: 'Tipo de movimiento inválido. Use entry o exit' })
    }

    if (!quantity || quantity <= 0) {
        return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' })
    }

    if (!variation_id) {
        return res.status(400).json({ error: 'variation_id es obligatorio' })
    }

    try {
        const { data: variation, error: varFetchError } = await client
            .from('product_variations')
            .select('stock, min_stock, unit_cost')
            .eq('id', variation_id)
            .single()

        if (varFetchError) {
            throw new Error(varFetchError.message || JSON.stringify(varFetchError))
        }

        const currentStock = variation?.stock || 0
        const newStock = movement_type === 'entry'
            ? currentStock + quantity
            : currentStock - quantity

        if (newStock < 0) {
            return res.status(400).json({
                error: `Stock insuficiente. Stock actual: ${currentStock}, intentaste sacar: ${quantity}`
            })
        }

        const { error: updateVarError } = await client
            .from('product_variations')
            .update({ stock: newStock })
            .eq('id', variation_id)

        if (updateVarError) {
            throw new Error(updateVarError.message || JSON.stringify(updateVarError))
        }

        if (min_stock !== undefined) {
            const { error: minStockError } = await client
                .from('product_variations')
                .update({ min_stock })
                .eq('id', variation_id)

            if (minStockError) {
                throw new Error(minStockError.message || JSON.stringify(minStockError))
            }
        }

        const localDate = getLocalDate()

        const { error: movementError } = await client
            .from('inventory_movements')
            .insert({
                business_id: business_id,
                product_id: productId,
                variation_id: variation_id,
                type: movement_type,
                quantity,
                unit_cost: unit_cost ?? variation.unit_cost ?? 0,
                notes: notes || null,
                created_at: localDate
            })

        if (movementError) {
            console.error('inventory_movements insert error:', movementError)
            throw new Error(movementError.message || JSON.stringify(movementError))
        }

        if (unit_cost !== undefined) {
            const { error: costError } = await client
                .from('product_variations')
                .update({ unit_cost })
                .eq('id', variation_id)

            if (costError) {
                console.error('Variation cost update error:', costError)
                throw new Error(costError.message || JSON.stringify(costError))
            }
        }

        const { data: productData, error: fetchError } = await client
            .from('products')
            .select(PRODUCT_SELECT)
            .eq('id', productId)
            .single()

        if (fetchError) {
            console.error('Product fetch error:', fetchError)
            throw new Error(fetchError.message || JSON.stringify(fetchError))
        }

        res.json({ status: 200, message: 'Inventario Actualizado', data: productData })
    } catch (error) {
        console.error('Adjust inventory error:', error)
        res.status(500).json({ error: error.message })
    }
}

export const getMovements = async (req, res) => {
    const client = getClient(req)
    const { productId } = req.params
    const { limit = 50 } = req.query

    try {
        let query = client
            .from('inventory_movements')
            .select('*')
            .eq('product_id', productId)
            .order('created_at', { ascending: false })

        if (limit) query = query.limit(parseInt(limit))

        const { data, error } = await query

        if (error) {
            console.error('getMovements error:', error)
            throw new Error(error.message || JSON.stringify(error))
        }

        res.json(data || [])
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const getAllMovements = async (req, res) => {
    const client = getClient(req)
    const { businessId } = req.params
    const { limit = 50, type, startDate, endDate } = req.query

    try {
        let query = client
            .from('inventory_movements')
            .select('*, products(name, sku)')
            .eq('business_id', businessId)

        if (type) query = query.eq('type', type)
        if (startDate) query = query.gte('created_at', startDate)
        if (endDate) query = query.lte('created_at', endDate)

        query = query.order('created_at', { ascending: false })

        if (limit) query = query.limit(parseInt(limit))

        const { data, error } = await query

        if (error) {
            console.error('getAllMovements error:', error)
            throw new Error(error.message || JSON.stringify(error))
        }

        res.json(data || [])
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}
