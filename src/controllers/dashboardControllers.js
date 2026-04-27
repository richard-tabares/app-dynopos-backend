import { supabase } from '../config/supabase.js'

export const getDashboardMetrics = async (req, res) => {
    const { businessId } = req.params
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    try {
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        const sevenDaysAgoStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`

        // Run all independent queries in parallel
        const [
            { data: todaySalesData, error: todaySalesError },
            { count: activeProductsCount, error: productsError },
            { data: inventoryData, error: inventoryError },
            { data: weeklySalesData, error: weeklyError },
            { data: recentSales, error: recentError },
            { data: allSalesItems, error: itemsError }
        ] = await Promise.all([
            supabase
                .from('salesTickets')
                .select('total_amount')
                .eq('business_id', businessId)
                .eq('created_at', todayStr)
                .neq('status', 'returned'),
            supabase
                .from('products')
                .select('*', { count: 'exact', head: true })
                .eq('business_id', businessId)
                .eq('is_active', true),
            supabase
                .from('products')
                .select('id, name, inventory(stock, min_stock)')
                .eq('business_id', businessId)
                .eq('is_active', true),
            supabase
                .from('salesTickets')
                .select('total_amount, created_at')
                .eq('business_id', businessId)
                .gte('created_at', sevenDaysAgoStr)
                .neq('status', 'returned')
                .order('created_at', { ascending: true }),
            supabase
                .from('salesTickets')
                .select(`
                    id,
                    total_amount,
                    created_at,
                    payment_method,
                    salesItems(quantity, unit_price, subtotal, products(name))
                `)
                .eq('business_id', businessId)
                .order('id', { ascending: false })
                .limit(50),
            supabase
                .from('salesItems')
                .select('product_id, quantity, subtotal, unit_price, products!inner(name, business_id)')
                .eq('products.business_id', businessId)
        ])

        if (todaySalesError) throw todaySalesError
        if (productsError) throw productsError
        if (inventoryError) throw inventoryError
        if (weeklyError) throw weeklyError
        if (recentError) throw recentError

        // Process data (in-memory operations, no DB queries)
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
