import { supabase } from '../config/supabase.js'

export const getProducts = async (req, res) => {
    const { data, error } = await supabase
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
    const { data, error } = await supabase
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
    const { data, error } = await supabase
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

    if (error) return res.status(500).json(error)
    res.status(201).json({ status: 201, message: 'Producto Creado', data })
}
export const updateProduct = async (req, res) => {
    const { ProductId } = req.params
    const { data, error } = await supabase
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

    if (error) return res.status(500).json(error)
    res.json({ status: 200, message: 'Producto Actualizado', data: data[0] })
}
export const deleteProduct = async (req, res) => {
    const { ProductId } = req.params

    try {
        // 1. Primero eliminamos la referencia en la tabla inventory
        const { error: invError } = await supabase
            .from('inventory')
            .delete()
            .eq('product_id', ProductId)

        if (invError) throw invError

        // 2. Luego intentamos eliminar el producto
        const { data, error } = await supabase
            .from('products')
            .delete()
            .eq('id', ProductId)
            .select()

        if (error) {
            // Si el error es por restricción de llave foránea (ej. tiene ventas asociadas)
            if (error.code === '23503') {
                // Hacemos un "soft delete" desactivando el producto
                const { data: updatedData, error: updateError } = await supabase
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
