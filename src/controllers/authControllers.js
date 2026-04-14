import { supabase } from '../config/supabase.js'

export const login = async (req, res) => {
    const { email, password } = req.body
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        })
        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
			.single()
        if (profileError) throw new Error(profileError)
        if (error) throw new Error(error)
        return res.json({
            status: 200,
            message: 'Login exitoso',
            data,
            profile: profileData,
        })
    } catch (error) {
        return res.status(500).json({ error: error.message })
    }
}

export const signup = async (req, res) => {
    const { email, password } = req.body

    try {
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
        })
		await supabase
			.from('profiles')
			.insert({
            id: data.user.id,
            display_name: 'Richard Tabares',
            role: 'admin',
            business_id: 1,
        })
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
