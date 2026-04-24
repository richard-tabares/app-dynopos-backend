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

    const { data, error } = await supabase
        .from('products')
        .delete()
        .eq('id', ProductId)
        .select()

    if (error) return res.status(500).json(error)
    res.json({ status: 200, message: 'Producto Eliminado', data })
}
