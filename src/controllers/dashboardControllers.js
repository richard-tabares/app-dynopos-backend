import { supabase, serviceRoleSupabase } from '../config/supabase.js'

const getClient = (req) => req.user?.role !== 'admin' ? serviceRoleSupabase : (req.supabase || supabase)

export const getDashboardMetrics = async (req, res) => {
    const { businessId } = req.params
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())

    try {
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        const sevenDaysAgoStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(sevenDaysAgo)

        const client = getClient(req)
        const [
            { data: todaySalesData, error: todaySalesError },
            { count: activeProductsCount, error: productsError },
            { data: inventoryData, error: inventoryError },
            { data: weeklySalesData, error: weeklyError },
            { data: recentSales, error: recentError },
            { data: topProductsData, error: topError }
        ] = await Promise.all([
            client
                .from('salesTickets')
                .select('id, total_amount')
                .eq('business_id', businessId)
                .eq('created_at', todayStr)
                .neq('status', 'returned'),
            client
                .from('products')
                .select('*', { count: 'exact', head: true })
                .eq('business_id', businessId)
                .eq('is_active', true),
            client
                .from('products')
                .select('id, name, variation_type, variations_disabled, product_variations(id, stock, min_stock, unit_cost, variation_name, is_active)')
                .eq('business_id', businessId)
                .eq('is_active', true),
            client
                .from('salesTickets')
                .select('id, total_amount, created_at')
                .eq('business_id', businessId)
                .gte('created_at', sevenDaysAgoStr)
                .neq('status', 'returned')
                .order('created_at', { ascending: true }),
            client
                .from('vw_sales_history')
                .select('*')
                .eq('business_id', businessId)
                .order('created_at', { ascending: false })
                .limit(10),
            client
                .from('vw_top_products')
                .select('product_name, total_quantity_sold, total_revenue')
                .eq('business_id', businessId)
                .order('total_quantity_sold', { ascending: false })
                .limit(10)
        ])

        if (todaySalesError) throw todaySalesError
        if (productsError) throw productsError
        if (inventoryError) throw inventoryError
        if (weeklyError) throw weeklyError
        if (recentError) throw recentError
        if (topError) throw topError

        const todaySaleIds = todaySalesData.map(s => s.id)
        let todayRevenue = todaySalesData.reduce((acc, sale) => acc + sale.total_amount, 0)

        if (todaySaleIds.length > 0) {
            const { data: todayReturns, error: returnsError } = await client
                .from('returns')
                .select('total_amount')
                .in('sale_id', todaySaleIds)
                .eq('created_at', todayStr)

            if (!returnsError && todayReturns) {
                const returnedAmount = todayReturns.reduce((acc, r) => acc + Number(r.total_amount), 0)
                todayRevenue -= returnedAmount
            }
        }

        let todayCost = 0
        if (todaySaleIds.length > 0) {
            const { data: todayItems, error: itemsError } = await client
                .from('salesItems')
                .select('unit_cost, quantity')
                .in('sale_id', todaySaleIds)

            if (!itemsError) {
                todayCost = todayItems.reduce((acc, item) => {
                    return acc + ((item.unit_cost || 0) * item.quantity)
                }, 0)
            }
        }

        const todayProfit = todayRevenue - todayCost
        const todayMargin = todayRevenue > 0 ? Math.round((todayProfit / todayRevenue) * 100) : 0

        const isProductLowStock = (p) => {
            return (p.product_variations || []).some(pv =>
                pv.is_active !== false && pv.stock <= pv.min_stock && pv.min_stock > 0
            )
        }

        const stockAlerts = inventoryData.filter(isProductLowStock).length

        const inventoryValue = inventoryData.reduce((acc, p) => {
            return acc + (p.product_variations || []).reduce((sum, pv) => {
                return sum + ((pv.stock || 0) * (pv.unit_cost || 0))
            }, 0)
        }, 0)

        const sortedLowStock = inventoryData
            .flatMap(p => {
                return (p.product_variations || [])
                    .filter(pv => pv.is_active !== false && pv.stock <= pv.min_stock && pv.min_stock > 0)
                    .map(pv => ({
                        id: `var_${pv.id}`,
                        productId: p.id,
                        name: p.name,
                        variationName: pv.variation_name,
                        stock: pv.stock,
                        min_stock: pv.min_stock
                    }))
            })
            .sort((a, b) => a.stock - b.stock)
            .slice(0, 10)

        const topProducts = topProductsData.map(p => ({
            name: p.product_name,
            sales: p.total_quantity_sold,
            totalRevenue: p.total_revenue
        }))

        res.json({
            metrics: {
                todaySales: todaySaleIds.length,
                todayRevenue: todayRevenue,
                todayCost: todayCost,
                todayProfit: todayProfit,
                todayMargin: todayMargin,
                activeProducts: activeProductsCount,
                stockAlerts: stockAlerts,
                inventoryValue: inventoryValue
            },
            weeklySales: weeklySalesData,
            lowStockItems: sortedLowStock,
            recentSales: recentSales.map(s => ({
                id: s.id,
                ticketNumber: s.ticket_number,
                total: s.total_amount,
                date: s.created_at,
                paymentMethod: s.payment_method,
                items: s.items,
                itemsCount: s.items_count
            })),
            topProducts
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ error: error.message })
    }
}
