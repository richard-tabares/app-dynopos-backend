import { supabase } from '../config/supabase.js'

export const createBusiness = async (req, res) => {
	try {
		const { data, error } = await supabase
			.from('businesses')
			.insert(req.body)
			.select()
		if (error) throw new Error(error)
		res.status(201).json({ status: 201, message: 'Negocio Creado', data })
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
}

export const updateBusiness = async (req, res) => {
    const { id } = req.params
    try {
        const { data, error } = await supabase
            .from('businesses')
            .update(req.body)
            .eq('id', id)
            .select()
        if (error) throw new Error(error)
        res.json({ status: 200, message: 'Negocio Actualizado', data })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const deleteBusiness = async (req, res) => {
    const { id } = req.params
    try {
        const { data, error } = await supabase
            .from('businesses')
            .delete()
            .eq('id', id)
            .select()
        if (error) throw new Error(error)
        res.json({ status: 200, message: 'Negocio Eliminado', data })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export const getBusiness = async (req, res) => {
    const { id } = req.params
    try {
        const { data, error } = await supabase
            .from('businesses')
            .select()
            .eq('id', id)
        if (error) throw new Error(error)
        res.json({ status: 200, message: 'Negocio Obtenido', data })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}