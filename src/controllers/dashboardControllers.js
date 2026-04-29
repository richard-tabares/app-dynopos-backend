import { supabase } from '../config/supabase.js'

const getClient = (req) => req.supabase || supabase

export const getDashboardMetrics = async (req, res) => {
    const { businessId } = req.params
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    try {
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        const sevenDaysAgoStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`

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
                .select('total_amount')
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
                .select('id, name, inventory(stock, min_stock)')
                .eq('business_id', businessId)
                .eq('is_active', true),
            client
                .from('salesTickets')
                .select('total_amount, created_at')
                .eq('business_id', businessId)
                .gte('created_at', sevenDaysAgoStr)
                .neq('status', 'returned')
                .order('created_at', { ascending: true }),
            client
                .from('vw_sales_history')
                .select('*')
                .eq('business_id', businessId)
                .order('id', { ascending: false })
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

        const todaySalesCount = todaySalesData.length
        const todayRevenue = todaySalesData.reduce((acc, sale) => acc + sale.total_amount, 0)

        const stockAlerts = inventoryData.filter(p => {
            const inv = p.inventory?.[0]
            return inv && inv.stock <= inv.min_stock && inv.min_stock > 0
        }).length

        const sortedLowStock = inventoryData
            .filter(p => {
                const inv = p.inventory?.[0]
                return inv && inv.stock <= inv.min_stock && inv.min_stock > 0
            })
            .sort((a, b) => a.inventory[0].stock - b.inventory[0].stock)
            .slice(0, 10)
            .map(p => ({
                id: p.id,
                name: p.name,
                stock: p.inventory[0].stock,
                min_stock: p.inventory[0].min_stock
            }))

        const topProducts = topProductsData.map(p => ({
            name: p.product_name,
            sales: p.total_quantity_sold,
            totalRevenue: p.total_revenue
        }))

        res.json({
            metrics: {
                todaySales: todaySalesCount,
                todayRevenue: todayRevenue,
                activeProducts: activeProductsCount,
                stockAlerts: stockAlerts
            },
            weeklySales: weeklySalesData,
            lowStockItems: sortedLowStock,
            recentSales: recentSales.map(s => ({
                id: s.id,
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
