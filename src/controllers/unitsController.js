import { supabase, serviceRoleSupabase } from '../config/supabase.js'

export const getUnits = async (req, res) => {
    try {
        const client = req.supabase || supabase
        const { data, error } = await client
            .from('units_of_measure')
            .select('*')
            .order('id', { ascending: true })

        if (error) throw error
        res.json(data || [])
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}
