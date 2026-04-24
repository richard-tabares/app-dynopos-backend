import { supabase } from '../config/supabase.js'

export const updateInventory = async (req, res) => {
    const { productId } = req.params
    const { stock, min_stock } = req.body

    const { data, error } = await supabase
        .from('inventory')
        .update({ stock, min_stock })
        .eq('product_id', productId)
        .select()

    if (error) return res.status(500).json(error)
    
    // Obtener el producto actualizado con su inventario para devolverlo al frontend
    const { data: productData, error: productError } = await supabase
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
