import { supabase } from '../config/supabase.js'

export const getDashboardMetrics = async (req, res) => {
    const { businessId } = req.params
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayISO = today.toISOString()

    try {
        // 1. Metrics: Today's Sales & Revenue
        const { data: todaySalesData, error: todaySalesError } = await supabase
            .from('salesTickets')
            .select('total_amount')
            .eq('business_id', businessId)
            .gte('created_at', todayISO)
            .neq('status', 'returned')

        if (todaySalesError) throw todaySalesError

        const todaySalesCount = todaySalesData.length
        const todayRevenue = todaySalesData.reduce((acc, sale) => acc + sale.total_amount, 0)

        // 2. Metrics: Active Products Count
        const { count: activeProductsCount, error: productsError } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
            .eq('is_active', true)

        if (productsError) throw productsError

        // 3. Metrics: Stock Alerts (Stock <= Min Stock)
        const { data: inventoryData, error: inventoryError } = await supabase
            .from('products')
            .select('id, name, inventory(stock, min_stock)')
            .eq('business_id', businessId)
            .eq('is_active', true)

        if (inventoryError) throw inventoryError

        const stockAlerts = inventoryData.filter(p => {
            const inv = p.inventory?.[0]
            // Solo contar como alerta si el stock es menor o igual al mínimo Y el mínimo es mayor a 0
            return inv && inv.stock <= inv.min_stock && inv.min_stock > 0
        }).length

        // 4. Weekly Sales (Last 7 days)
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        sevenDaysAgo.setHours(0, 0, 0, 0)

        const { data: weeklySalesData, error: weeklyError } = await supabase
            .from('salesTickets')
            .select('total_amount, created_at')
            .eq('business_id', businessId)
            .gte('created_at', sevenDaysAgo.toISOString())
            .neq('status', 'returned')
            .order('created_at', { ascending: true })

        if (weeklyError) throw weeklyError

        // 5. Low Stock Items (Top 10)
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

        // 6. Recent Sales (Last 50 for pagination)
        const { data: recentSales, error: recentError } = await supabase
            .from('salesTickets')
            .select(`
                id,
                total_amount,
                created_at,
                payment_method,
                salesItems(quantity, unit_price, subtotal, products(name))
            `)
            .eq('business_id', businessId)
            .order('id', { ascending: false }) // Order by ID descending for most recent first
            .limit(50)

        if (recentError) throw recentError

        // 7. Top Products (Top 10 by volume)
        const { data: allSalesItems, error: itemsError } = await supabase
            .from('salesItems')
            .select('product_id, quantity, subtotal, unit_price, products!inner(name, business_id)')
            .eq('products.business_id', businessId)

        let topProducts = []
        if (!itemsError) {
            const productSales = {}
            allSalesItems.forEach(item => {
                const id = item.product_id
                if (!productSales[id]) {
                    productSales[id] = { 
                        name: item.products.name, 
                        sales: 0,
                        totalRevenue: 0 
                    }
                }
                const quantity = Number(item.quantity) || 0
                const subtotal = Number(item.subtotal) || (Number(item.unit_price) * quantity) || 0
                
                productSales[id].sales += quantity
                productSales[id].totalRevenue += subtotal
            })

            topProducts = Object.values(productSales)
                .sort((a, b) => b.sales - a.sales)
                .slice(0, 10)
        }

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
                items: s.salesItems.map(item => ({
                    quantity: item.quantity,
                    price: item.unit_price,
                    subtotal: item.subtotal,
                    name: item.products?.name || 'Producto eliminado'
                })),
                itemsCount: s.salesItems.reduce((acc, i) => acc + i.quantity, 0)
            })),
            topProducts
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ error: error.message })
    }
}
