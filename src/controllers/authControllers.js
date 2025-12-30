import { supabase } from '../config/supabase.js'

export const login = async (req, res) => {
	const { user, pass } = req.body
	try {
		const { data, error } = await supabase.auth.signInWithPassword({
			email: user,
			password: pass,
		})
		if (error) throw new Error(error)
		return res.json({ status: 200, message: 'Login exitoso', data })
	} catch (error) {
		return res.status(500).json({ error: error.message })
	}
}

export const signup = async (req, res) => {
	const { user, pass } = req.body

	try {
		const { data, error } = await supabase.auth.signUp({
			email: user,
			password: pass,
		})
		await supabase
			.from('profiles')
			.insert({ id: data.user.id, role: 'admin' })
		if (error) throw new Error(error)
		return res.json({
			status: 201,
			message: 'Usuario creado exitosamente',
			data,
		})
	} catch (error) {
		return res.status(500).json({ error: error.message })
	}
}

export const logout = async (req, res) => {
	try {
		const { error } = await supabase.auth.signOut()
		if (error) throw new Error(error)
		return res.json({
			status: 200,
			message: 'Se ha cerrado sesión exitosamente',
		})
	} catch (error) {
		return res.status(500).json({ error: error.message })
	}
}