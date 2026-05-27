import { supabase, serviceRoleSupabase } from '../config/supabase.js'

const getClient = (req) => req.user?.role !== 'admin' ? serviceRoleSupabase : (req.supabase || supabase)

const addDateRange = (query, start, end) => {
    if (start) query = query.gte('sale_date', start)
    if (end) query = query.lte('sale_date', end)
    return query
}

const addReturnDateRange = (query, start, end) => {
    if (start) query = query.gte('return_date', start)
    if (end) query = query.lte('return_date', end)
    return query
}

export const getReports = async (req, res) => {
    try {
        const { businessId } = req.params
        const { section = 'sales', filter = 'month', startDate, endDate, categoryId } = req.query
        const client = getClient(req)

        const now = new Date()
        let start = ''
        let end = ''

        if (filter === 'day') {
            start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
            end = start
        } else if (filter === 'week') {
            const weekAgo = new Date()
            weekAgo.setDate(weekAgo.getDate() - 7)
            start = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, '0')}-${String(weekAgo.getDate()).padStart(2, '0')}`
            end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        } else if (filter === 'month') {
            const monthAgo = new Date()
            monthAgo.setMonth(monthAgo.getMonth() - 1)
            start = `${monthAgo.getFullYear()}-${String(monthAgo.getMonth() + 1).padStart(2, '0')}-${String(monthAgo.getDate()).padStart(2, '0')}`
            end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        } else if (filter === 'range') {
            start = startDate
            end = endDate
        }

        if (section === 'profitability') {
            const { data: sales, error: salesError } = await client
                .from('salesTickets')
                .select('id, total_amount, created_at')
                .eq('business_id', businessId)
                .neq('status', 'returned')

            if (salesError) throw salesError

            let filteredSales = sales
            if (start) filteredSales = filteredSales.filter(s => s.created_at >= start)
            if (end) filteredSales = filteredSales.filter(s => s.created_at <= end)

            const saleIds = filteredSales.map(s => s.id)
            let costByDate = {}
            let revenueByDate = {}

            if (saleIds.length > 0) {
                const { data: items, error: itemsError } = await client
                    .from('salesItems')
                    .select('sale_id, unit_cost, quantity, subtotal, created_at')
                    .in('sale_id', saleIds)

                if (itemsError) throw itemsError

                for (const item of items || []) {
                    const date = item.created_at || filteredSales.find(s => s.id === item.sale_id)?.created_at
                    if (!date) continue

                    if (!costByDate[date]) costByDate[date] = 0
                    if (!revenueByDate[date]) revenueByDate[date] = 0

                    costByDate[date] += (item.unit_cost || 0) * item.quantity
                    revenueByDate[date] += item.subtotal
                }
            }

            const dailyProfit = Object.keys(costByDate).map(date => ({
                date,
                revenue: revenueByDate[date] || 0,
                cost: costByDate[date] || 0,
                profit: (revenueByDate[date] || 0) - (costByDate[date] || 0)
            })).sort((a, b) => a.date.localeCompare(b.date))

            const totalRevenue = Object.values(revenueByDate).reduce((a, b) => a + b, 0)
            const totalCost = Object.values(costByDate).reduce((a, b) => a + b, 0)
            const totalProfit = totalRevenue - totalCost
            const overallMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0

            const { data: products, error: prodError } = await client
                .from('products')
                .select(`id, name, unit_cost, inventory(stock)`)
                .eq('business_id', businessId)
                .eq('is_active', true)

            if (prodError) throw prodError

            const inventoryValue = products.reduce((acc, p) => {
                const stock = p.inventory?.[0]?.stock || 0
                return acc + (stock * (p.unit_cost || 0))
            }, 0)

            const { data: salesItemsData, error: itemsErr } = await client
                .from('salesItems')
                .select('product_id, unit_cost, quantity, subtotal, products(name)')
                .in('sale_id', saleIds)

            if (itemsErr) throw itemsErr

            const productAgg = {}
            for (const item of salesItemsData || []) {
                const pid = item.product_id
                if (!productAgg[pid]) {
                    productAgg[pid] = { name: item.products?.name || 'Producto', totalQuantity: 0, totalRevenue: 0, totalCost: 0 }
                }
                productAgg[pid].totalQuantity += item.quantity
                productAgg[pid].totalRevenue += item.subtotal
                productAgg[pid].totalCost += (item.unit_cost || 0) * item.quantity
            }

            const productMargins = Object.entries(productAgg)
                .map(([id, p]) => ({
                    id,
                    name: p.name,
                    totalQuantity: p.totalQuantity,
                    totalRevenue: p.totalRevenue,
                    totalCost: p.totalCost,
                    avgUnitPrice: p.totalQuantity > 0 ? Math.round(p.totalRevenue / p.totalQuantity) : 0,
                    avgUnitCost: p.totalQuantity > 0 ? Math.round(p.totalCost / p.totalQuantity) : 0,
                    margin: p.totalRevenue > 0
                        ? Math.round(((p.totalRevenue - p.totalCost) / p.totalRevenue) * 100)
                        : 0
                }))
                .sort((a, b) => b.margin - a.margin)

            return res.json({
                section: 'profitability',
                data: {
                    dailyProfit,
                    summary: {
                        totalRevenue,
                        totalCost,
                        totalProfit,
                        overallMargin,
                        periodStart: start,
                        periodEnd: end
                    },
                    inventoryValue,
                    productMargins
                }
            })
        }

        if (section === 'movements') {
            const { type, startDate: mStart, endDate: mEnd, limit = 100 } = req.query

            let query = client
                .from('inventory_movements')
                .select('*, products(name, sku, barcode)')
                .eq('business_id', businessId)

            if (type) query = query.eq('type', type)
            if (mStart) query = query.gte('created_at', mStart)
            if (mEnd) query = query.lte('created_at', mEnd)

            const { data, error } = await query
                .order('created_at', { ascending: false })
                .limit(parseInt(limit))

            if (error) throw error

            return res.json({
                section: 'movements',
                data: data || []
            })
        }

        if (section === 'sales') {
            const queries = []

            let dailyQuery = client
                .from('vw_daily_sales')
                .select('*')
                .eq('business_id', businessId)
            dailyQuery = addDateRange(dailyQuery, start, end)
            queries.push(dailyQuery.order('sale_date', { ascending: true }))

            let paymentQuery = client
                .from('vw_sales_by_payment')
                .select('*')
                .eq('business_id', businessId)
            paymentQuery = addDateRange(paymentQuery, start, end)
            queries.push(paymentQuery)

            let catQuery = client
                .from('vw_sales_by_category')
                .select('*')
                .eq('business_id', businessId)
            catQuery = addDateRange(catQuery, start, end)
            if (categoryId) {
                catQuery = catQuery.eq('category_id', categoryId)
            }
            queries.push(catQuery)

            const [
                { data: dailySales, error: dailyError },
                { data: salesByPayment, error: paymentError },
                { data: salesByCategory, error: categoryError }
            ] = await Promise.all(queries)

            if (dailyError) throw dailyError
            if (paymentError) throw paymentError
            if (categoryError) throw categoryError

            const aggregatedPayments = (salesByPayment || []).reduce((acc, item) => {
                const existing = acc.find(a => a.payment_method === item.payment_method)
                if (existing) {
                    existing.total_amount += Number(item.total_amount)
                    existing.sale_count += Number(item.sale_count)
                } else {
                    acc.push({
                        business_id: item.business_id,
                        payment_method: item.payment_method,
                        sale_date: item.sale_date,
                        sale_count: Number(item.sale_count),
                        total_amount: Number(item.total_amount)
                    })
                }
                return acc
            }, [])

            const aggregatedCategories = (salesByCategory || []).reduce((acc, item) => {
                const existing = acc.find(a => a.category_id === item.category_id)
                if (existing) {
                    existing.total_amount += Number(item.total_amount)
                    existing.total_quantity += Number(item.total_quantity)
                    existing.sale_count += Number(item.sale_count)
                } else {
                    acc.push({
                        business_id: item.business_id,
                        category_id: item.category_id,
                        category_name: item.category_name,
                        sale_date: item.sale_date,
                        sale_count: Number(item.sale_count),
                        total_amount: Number(item.total_amount),
                        total_quantity: Number(item.total_quantity)
                    })
                }
                return acc
            }, [])

            const dailySalesNormalized = (dailySales || []).map(d => ({
                ...d,
                total_amount: Number(d.total_amount),
                sale_count: Number(d.sale_count)
            }))

            return res.json({
                section: 'sales',
                data: {
                    dailySales: dailySalesNormalized,
                    salesByPayment: aggregatedPayments,
                    salesByCategory: aggregatedCategories
                }
            })
        }

        if (section === 'recent_sales') {
            let query = client
                .from('vw_sales_history')
                .select('*')
                .eq('business_id', businessId)
            if (start) query = query.gte('created_at', start)
            if (end) query = query.lte('created_at', end)

            const { data, error } = await query.order('ticket_number', { ascending: false }).limit(50)
            if (error) throw error

            const saleIds = (data || []).map(s => s.id)
            const returnedPerProduct = {}

            if (saleIds.length > 0) {
                const { data: returns } = await client
                    .from('returns')
                    .select('id, sale_id')
                    .in('sale_id', saleIds)

                if (returns && returns.length > 0) {
                    const returnIds = returns.map(r => r.id)
                    const saleOfReturn = {}
                    returns.forEach(r => { saleOfReturn[r.id] = r.sale_id })

                    const { data: returnedItems } = await client
                        .from('returns_items')
                        .select('return_id, product_id, quantity')
                        .in('return_id', returnIds)

                    if (returnedItems) {
                        returnedItems.forEach(item => {
                            const sid = saleOfReturn[item.return_id]
                            if (!returnedPerProduct[sid]) returnedPerProduct[sid] = {}
                            returnedPerProduct[sid][item.product_id] = (returnedPerProduct[sid][item.product_id] || 0) + item.quantity
                        })
                    }
                }
            }

            return res.json({
                section: 'recent_sales',
                data: (data || []).map(s => ({
                    id: s.id,
                    ticketNumber: s.ticket_number,
                    total: s.total_amount,
                    date: s.created_at,
                    paymentMethod: s.payment_method,
                    status: s.status,
                    items: (s.items || []).map(item => ({
                        ...item,
                        already_returned: returnedPerProduct[s.id]?.[item.product_id] || 0
                    })),
                    itemsCount: s.items_count
                }))
            })
        }

        if (section === 'inventory') {
            const queries = []

            queries.push(
                client
                    .from('vw_stock_status')
                    .select('*')
                    .eq('business_id', businessId)
                    .order('stock_status', { ascending: true })
                    .order('current_stock', { ascending: true })
            )

            queries.push(
                client
                    .from('vw_inventory_valuation')
                    .select('*')
                    .eq('business_id', businessId)
                    .order('total_value', { ascending: false })
            )

            const [
                { data: stockData, error: stockError },
                { data: valuationData, error: valuationError }
            ] = await Promise.all(queries)

            if (stockError) throw stockError
            if (valuationError) throw valuationError

            return res.json({
                section: 'inventory',
                data: {
                    stockStatus: stockData || [],
                    inventoryValuation: valuationData || []
                }
            })
        }

        if (section === 'performance') {
            const queries = []

            queries.push(
                client
                    .from('vw_top_products')
                    .select('*')
                    .eq('business_id', businessId)
                    .order('total_quantity_sold', { ascending: false })
                    .limit(10)
            )

            queries.push(
                client
                    .from('vw_bottom_products')
                    .select('*')
                    .eq('business_id', businessId)
                    .gt('total_quantity_sold', 0)
                    .order('total_quantity_sold', { ascending: true })
                    .limit(10)
            )

            let avgQuery = client
                .from('vw_avg_ticket')
                .select('*')
                .eq('business_id', businessId)
            avgQuery = addDateRange(avgQuery, start, end)
            queries.push(avgQuery.order('sale_date', { ascending: false }))

            const [
                { data: topProducts, error: topError },
                { data: bottomProducts, error: bottomError },
                { data: avgTickets, error: avgError }
            ] = await Promise.all(queries)

            if (topError) throw topError
            if (bottomError) throw bottomError
            if (avgError) throw avgError

            const overallAvg = avgTickets && avgTickets.length > 0
                ? avgTickets.reduce((sum, t) => sum + Number(t.total_amount), 0) / avgTickets.length
                : 0

            return res.json({
                section: 'performance',
                data: {
                    topProducts: topProducts || [],
                    bottomProducts: bottomProducts || [],
                    avgTickets: avgTickets || [],
                    overallAvgTicket: Math.round(overallAvg)
                }
            })
        }

        if (section === 'returns') {
            const buildSummaryQuery = () => {
                let q = client.from('vw_returns_summary').select('*').eq('business_id', businessId)
                q = addReturnDateRange(q, start, end)
                return q.order('return_date', { ascending: false })
            }

            const buildListQuery = () => {
                let q = client.from('vw_returns_list').select('*').eq('business_id', businessId)
                q = addReturnDateRange(q, start, end)
                return q.order('return_date', { ascending: false })
            }

            const [
                { data: chartData, error: summaryError },
                { data: listData, error: listError }
            ] = await Promise.all([buildSummaryQuery(), buildListQuery()])

            if (summaryError) throw summaryError
            if (listError) throw listError

            return res.json({
                section: 'returns',
                data: {
                    chart: chartData || [],
                    list: listData || []
                }
            })
        }

        if (section === 'return_detail') {
            const { returnDate } = req.query
            if (!returnDate) {
                return res.status(400).json({ error: 'returnDate es requerido' })
            }

            const { data: returns, error: returnsError } = await client
                .from('returns')
                .select('*, salesTickets(ticket_number)')
                .eq('business_id', businessId)
                .eq('created_at', returnDate)

            if (returnsError) throw returnsError

            const returnIds = returns.map(r => r.id)

            let items = []
            if (returnIds.length > 0) {
                const { data: itemsData, error: itemsError } = await client
                    .from('returns_items')
                    .select('*, products(name)')
                    .in('return_id', returnIds)
                if (itemsError) throw itemsError
                items = itemsData || []
            }

            return res.json({
                section: 'return_detail',
                data: {
                    returns: returns || [],
                    items: items || []
                }
            })
        }

        return res.status(400).json({ error: `Sección de reporte inválida: ${section}` })
    } catch (error) {
        console.error('Error in getReports:', error)
        res.status(500).json({ error: error.message || 'Error interno del servidor' })
    }
}
