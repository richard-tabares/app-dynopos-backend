import { supabase } from '../config/supabase.js'

export const getProducts = async (req, res) => {
    const { data, error } = await supabase
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
            name,
            sku,
            price,
            is_active,
            categories (
                id,
                name
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
            name,
            sku,
            price,
            is_active,
            categories (
                id,
                name
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
        .select()

    if (error) return res.status(500).json(error)
    res.json({ status: 200, message: 'Producto Actualizado', data })
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
