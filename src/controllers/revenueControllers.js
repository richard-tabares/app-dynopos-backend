import { supabase, serviceRoleSupabase } from '../config/supabase.js'

const getClient = (req) => req.user?.role !== 'admin' ? serviceRoleSupabase : (req.supabase || supabase)

export const getTodayRevenue = async (req, res) => {
    const { businessId } = req.params
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())

    try {
        const client = getClient(req)
        const { data: todaySales, error } = await client
            .from('vw_sales_history')
            .select('id, total_amount')
            .eq('business_id', businessId)
            .eq('created_at', todayStr)
            .neq('status', 'returned')

        if (error) throw error

        let revenue = todaySales.reduce((acc, s) => acc + s.total_amount, 0)
        const todaySaleIds = todaySales.map(s => s.id)

        if (todaySaleIds.length > 0) {
            const { data: todayReturns, error: returnsError } = await client
                .from('returns')
                .select('total_amount')
                .in('sale_id', todaySaleIds)
                .eq('created_at', todayStr)

            if (!returnsError && todayReturns) {
                const returnedAmount = todayReturns.reduce((acc, r) => acc + Number(r.total_amount), 0)
                revenue -= returnedAmount
            }
        }

        res.json({ todayRevenue: revenue, todaySales: todaySales.length })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}
