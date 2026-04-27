import { supabase } from '../config/supabase.js'

const getClient = (req) => req.supabase || supabase

export const getProducts = async (req, res) => {
    const client = getClient(req)
    const { data, error } = await client
        .from('products')
        .select(
            `id,
            business_id,
            name,
            sku,
            price,
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
            name,
            sku,
            price,
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
        .eq('id', req.params.ProductId)
        .single()

    if (error) return res.status(500).json(error)
    res.json(data)
}

export const createProduct = async (req, res) => {
    try {
        const client = getClient(req)
        const { sku, business_id } = req.body

        const { data: existing } = await client
            .from('products')
            .select('id')
            .eq('sku', sku)
            .eq('business_id', business_id)
            .maybeSingle()

        if (existing) {
            return res.status(409).json({ error: 'Ya existe un producto con este SKU' })
        }

        const { data, error } = await client
            .from('products')
            .insert(req.body)
            .select(
                `id,
                business_id,
                name,
                sku,
                price,
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
        const { sku, business_id } = req.body

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
                name,
                sku,
                price,
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
