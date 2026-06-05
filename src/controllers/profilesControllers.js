import { supabase } from '../config/supabase.js'

const getClient = (req) => req.supabase || supabase

export const updateProfile = async (req, res) => {
    const client = getClient(req)
    const { id } = req.params
    try {
        const { data, error } = await client
            .from('profiles')
            .update(req.body)
            .eq('id', id)
            .select()
            .single()
        if (error) throw new Error(error)
        res.json({ status: 200, message: 'Perfil actualizado', data })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}
