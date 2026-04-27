import { createClient } from '@supabase/supabase-js'
import { supabase, serviceRoleSupabase } from '../config/supabase.js'

export const login = async (req, res) => {
    const { email, password } = req.body
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        })

        if (error) throw new Error(error.message)
        if (!data.user) throw new Error('Credenciales incorrectas')

        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', data.user.id)
            .single()
        if (profileError) throw new Error(profileError.message)

        const { data: businessData, error: businessError } = await supabase
            .from('businesses')
            .select('business_name, business_logo, owner_name, email, phone, ticket_footer, low_stock_notifications, user_id')
            .eq('user_id', data.user.id)
            .single()

        if (businessError) throw new Error(businessError.message)

        return res.json({
            status: 200,
            message: 'Login exitoso',
            data,
            profile: profileData,
            business: businessData,
            access_token: data.session?.access_token,
        })
    } catch (error) {
        return res.status(500).json({ error: error.message })
    }
}

export const confirmEmail = async (req, res) => {
    const { access_token, refresh_token } = req.body

    try {
        const supabaseClient = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                    detectSessionInUrl: false,
                },
            }
        )

        const { data, error } = await supabaseClient.auth.setSession({
            access_token,
            refresh_token,
        })

        if (error) {
            return res.status(400).json({ error: error.message })
        }

        if (!data.user) {
            return res.status(400).json({ error: 'Token inválido' })
        }

        return res.json({
            status: 200,
            message: 'Correo confirmado exitosamente',
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

        if (!data.user) {
            throw new Error('El usuario no se pudo crear. Revisa que el correo no esté registrado.')
        }

        const { error: profileError } = await serviceRoleSupabase.from('profiles').insert({
            user_id: data.user.id,
            display_name: '',
            role: 'admin',
        })
        if (profileError) throw new Error(profileError.message)

        const { error: businessError } = await serviceRoleSupabase
            .from('businesses')
            .insert({
                user_id: data.user.id,
                business_name: business_name,
                owner_name: owner_name,
                email: email,
                phone: phone,
            })
        if (businessError) throw new Error(businessError.message)

        const { error: categoryError } = await serviceRoleSupabase.from('categories').insert({
            business_id: data.user.id,
            name: 'General',
        })
        if (categoryError) throw new Error(categoryError.message)

        return res.json({
            status: 201,
            message: 'Usuario creado exitosamente',
            data,
            access_token: data.session?.access_token,
        })
    } catch (error) {
        return res.status(500).json({ error: error.message })
    }
}

export const forgotPassword = async (req, res) => {
    const { email } = req.body
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: 'http://localhost:5173/reset-password',
        })
        if (error) throw new Error(error.message)
        return res.json({
            status: 200,
            message: 'Correo enviado',
        })
    } catch (error) {
        return res.status(500).json({ error: error.message })
    }
}

export const resetPassword = async (req, res) => {
    const { access_token, refresh_token, password } = req.body
    try {
        const supabaseClient = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                    detectSessionInUrl: false,
                },
            }
        )
        const { error: sessionError } = await supabaseClient.auth.setSession({
            access_token,
            refresh_token,
        })
        if (sessionError) {
            return res.status(400).json({ error: sessionError.message })
        }
        const { data, error } = await supabaseClient.auth.updateUser({ password })
        if (error) throw new Error(error.message)
        return res.json({
            status: 200,
            message: 'Contraseña actualizada exitosamente',
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
