import { supabase } from '../config/supabase.js'

const getClient = (req) => req.supabase || supabase

export const adjustInventory = async (req, res) => {
    const client = getClient(req)
    const { productId } = req.params
    const { movement_type, quantity, unit_cost, min_stock, notes, business_id } = req.body

    if (!movement_type || !['entry', 'exit'].includes(movement_type)) {
        return res.status(400).json({ error: 'Tipo de movimiento inválido. Use entry o exit' })
    }

    if (!quantity || quantity <= 0) {
        return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' })
    }

    try {
        const { data: product, error: productError } = await client
            .from('products')
            .select(`id, name, business_id, unit_cost, inventory(stock, min_stock)`)
            .eq('id', productId)
            .single()

        if (productError) throw new Error(productError)

        const currentStock = product.inventory?.[0]?.stock || 0
        const newStock = movement_type === 'entry'
            ? currentStock + quantity
            : currentStock - quantity

        if (newStock < 0) {
            return res.status(400).json({
                error: `Stock insuficiente. Stock actual: ${currentStock}, intentaste sacar: ${quantity}`
            })
        }

        const updateFields = { stock: newStock }
        if (min_stock !== undefined) {
            updateFields.min_stock = min_stock
        }

        const { error: updateError } = await client
            .from('inventory')
            .update(updateFields)
            .eq('product_id', productId)

        if (updateError) throw new Error(updateError)

        const now = new Date()
        const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

        const { error: movementError } = await client
            .from('inventory_movements')
            .insert({
                business_id: business_id || product.business_id,
                product_id: productId,
                type: movement_type,
                quantity,
                unit_cost: unit_cost ?? product.unit_cost ?? null,
                notes: notes || null,
                created_at: localDate
            })

        if (movementError) throw new Error(movementError)

        if (unit_cost !== undefined && unit_cost !== product.unit_cost) {
            const { error: costError } = await client
                .from('products')
                .update({ unit_cost })
                .eq('id', productId)

            if (costError) throw new Error(costError)
        }

        const { data: productData, error: fetchError } = await client
            .from('products')
            .select(
                `id,
                name,
                sku,
                price,
                unit_cost,
                is_active,
                categories (
                    id,
                    name
                ),
                inventory (
                    stock,
                    min_stock
                )`
            )
            .eq('id', productId)
            .single()

        if (fetchError) throw new Error(fetchError)

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

        if (error) throw new Error(error)

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

        if (error) throw new Error(error)

        res.json(data || [])
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}
