import { supabase } from "../config/supabase.js";

export const getProducts = async (req, res) => {

    const { data, error } = await supabase
        .from('products')
        .select('*')
    
    if(error) return res.status(500).json(error)
    res.json(data)

}

export const createProduct = async (req, res) => {
   
    const { data, error } = await supabase
        .from('products')
        .insert(req.body)
        .select()
    
    res.status(201).json({ status: 201, message: 'Producto Creado', data })
    
    if (error) return res.status(500).json(error)
    
}
export const updateProduct = async (req, res) => {

    const { id } = req.params
    const { data, error } = await supabase
        .from('products')
        .update(req.body)
        .eq('id', id)
        .select()
    
    if (error) return res.status(500).json(error)
    res.json({ status: 200, message: 'Producto Actualizado', data })
    
}
export const deleteProduct = async (req, res) => {
    const { id } = req.params

    const { data, error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)
        .select()
    
    if (error) return res.status(500).json(error)
    res.json({ status: 200, message: 'Producto Eliminado', data })
    
}