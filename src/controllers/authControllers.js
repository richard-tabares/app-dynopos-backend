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
            .eq('user_id', data.user.id)
            .single()
        if (profileError) throw new Error(profileError)

        const { data: businessData, error: businessError } = await supabase
            .from('businesses')
            .select('id, business_name, business_logo, owner_name, email, phone, ticket_footer, low_stock_notifications')
            .eq('user_id', data.user.id)
            .single()

        if (businessError) throw new Error(businessError)

        if (error) throw new Error(error)
        return res.json({
            status: 200,
            message: 'Login exitoso',
            data,
            profile: profileData,
            business: businessData,
        })
    } catch (error) {
        return res.status(500).json({ error: error.message })
    }
}

export const signup = async (req, res) => {
    const { business_name, owner_name, email, password, phone } = req.body

    try {
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
        })
		if (error) throw new Error(error.message)
        const { error: profileError } = await supabase.from('profiles').insert({
            user_id: data.user.id,
            display_name: 'Richard Tabares',
            role: 'admin',
		})
		if (profileError) throw new Error(profileError.message)
        const { error: businessError } = await supabase.from('businesses').insert({
            user_id: data.user.id,
            business_name: business_name,
            owner_name: owner_name,
            email: email,
            phone: phone,
        })
		if (businessError) throw new Error(businessError.message)
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
