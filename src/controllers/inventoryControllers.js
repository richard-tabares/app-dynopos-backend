import { supabase } from '../config/supabase.js'

const getClient = (req) => req.supabase || supabase

export const updateInventory = async (req, res) => {
    const client = getClient(req)
    const { productId } = req.params
    const { stock, min_stock } = req.body

    const { data, error } = await client
        .from('inventory')
        .update({ stock, min_stock })
        .eq('product_id', productId)
        .select()

    if (error) return res.status(500).json(error)
    
    const { data: productData, error: productError } = await client
        .from('products')
        .select(
            `id,
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
        .eq('id', productId)
        .single()

    if (productError) return res.status(500).json(productError)

    res.json({ status: 200, message: 'Inventario Actualizado', data: productData })
}
