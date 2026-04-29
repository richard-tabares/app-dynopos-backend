import { supabase } from '../config/supabase.js'

const getClient = (req) => req.supabase || supabase

export const getTodayRevenue = async (req, res) => {
    const { businessId } = req.params
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    try {
        const client = getClient(req)
        const { data: todaySales, error } = await client
            .from('vw_sales_history')
            .select('total_amount')
            .eq('business_id', businessId)
            .eq('created_at', todayStr)
            .neq('status', 'returned')

        if (error) throw error

        const revenue = todaySales.reduce((acc, s) => acc + s.total_amount, 0)

        res.json({ todayRevenue: revenue, todaySales: todaySales.length })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}
