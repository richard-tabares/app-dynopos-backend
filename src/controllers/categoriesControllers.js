import { supabase } from '../config/supabase.js'

export const getCategories = async (req, res) => {
	const { data, error } = await supabase.from('categories').select('*')

	if (error) return res.status(500).json(error)
	res.json(data)
}

export const createCategory = async (req, res) => {
	const { data, error } = await supabase
		.from('categories')
		.insert(req.body)
		.select()

	if (error) return res.status(500).json(error)
	res.status(201).json({ status: 201, message: 'Categoría Creada', data })
}

export const updateCategory = async (req, res) => {
	const { id } = req.params
	const { data, error } = await supabase
		.from('categories')
		.update(req.body)
		.eq('id', id)
		.select()

	if (error) return res.status(500).json(error)
	res.json({ status: 200, message: 'Categoría Actualizada', data })
}

export const deleteCategory = async (req, res) => {
	const { id } = req.params
	const { data, error } = await supabase
		.from('categories')
		.delete()
		.eq('id', id)
		.select()

	if (error) return res.status(500).json(error)
	res.json({ status: 200, message: 'Categoría Eliminada', data })
}
