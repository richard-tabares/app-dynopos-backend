import { supabase } from '../config/supabase.js'

const getClient = (req) => req.supabase || supabase

export const getSales = async (req, res) => {
	const client = getClient(req)
	const { businessId } = req.params

	try {
		const { data: sales, error } = await client
			.from('vw_sales_history')
			.select('*')
			.eq('business_id', businessId)
			.order('id', { ascending: false })
			.limit(10)

		if (error) throw new Error(error)

		const formatted = sales.map(s => ({
			id: s.id,
			total: s.total_amount,
			date: s.created_at,
			paymentMethod: s.payment_method,
			status: s.status,
			items: s.items,
			itemsCount: s.items_count
		}))

		res.json(formatted)
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
}

export const createSale = async (req, res) => {
	const client = getClient(req)
	const { business_id, payment_method, status, salesItems } =
		req.body

	try {
		if (!salesItems || salesItems.length === 0) {
			return res
				.status(400)
				.json({ error: 'No se proporcionaron items de venta' })
		}

		const productIds = salesItems.map((item) => item.product_id)
		const { data: products, error: productsError } = await client
			.from('products')
			.select('id, name, price, track_stock, inventory(stock)')
			.in('id', productIds)

		if (productsError) throw new Error(productsError)


		for (const item of salesItems) {
			const product = products.find((p) => p.id === item.product_id)
			if (!product) {
				return res.status(400).json({
					error: `Producto con ID ${item.product_id} no encontrado`,
				})
			}
			if (product.track_stock === false) continue
			const currentStock = product.inventory?.[0]?.stock || 0
			if (item.quantity > currentStock) {
				return res.status(400).json({
					error: `El producto ${product.name} no tiene stock suficiente, stock actual es ${currentStock}`,
				})
			}
		}

		//calculamos totales
		let total_amount = 0
		const itemsWithPrices = salesItems.map((item) => {
			const product = products.find((p) => p.id === item.product_id)
			const subtotal = product.price * item.quantity
			total_amount += subtotal

			return {
				...item,
				unit_price: product.price,
				subtotal,
				track_stock: product.track_stock ?? true,
			}
		})

		//crear venta con totales calculados
		const now = new Date()
		const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

		const { data, error: salesError } = await client
			.from('salesTickets')
			.insert([
				{
					business_id,
					payment_method,
					status,
					total_amount,
					created_at: localDate,
				},
			])
			.select()
			.single()

		if (salesError) throw new Error(salesError)
		//preparar items de venta con sale_id
		const itemsToInsert = itemsWithPrices.map((item) => ({
			...item,
			sale_id: data.id,
			created_at: localDate
		}))

		//Insertar items de venta
		const { data: itemsData, error: itemsError } = await client
			.from('salesItems')
			.insert(itemsToInsert)
			.select()

		if (itemsError) throw new Error(itemsError)

		//Reducir stock de productos vendidos
		for (const item of itemsWithPrices) {
			const product = products.find((p) => p.id === item.product_id)
			if (product.track_stock === false) continue
			//Calcular nuevo stock
			const currentStock = product.inventory?.[0]?.stock || 0
			const newStock = currentStock - item.quantity

			//Actualizar stock en tabla inventory
			const { error: updateStockError } = await client
				.from('inventory')
				.update({ stock: newStock })
				.eq('product_id', item.product_id)

			if (updateStockError) throw new Error(updateStockError)
		}

		res.status(201).json({ 
			status: 201, 
			message: 'Venta Creada', 
			data: {
				...data,
				salesItems: itemsData.map((item, index) => ({
					...item,
					products: {
						name: products.find(p => p.id === item.product_id)?.name || 'Producto'
					}
				}))
			} 
		})
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
}

export const returnSale = async (req, res) => {
	const client = getClient(req)
	const { id } = req.params
	const { reason, business_id, items } = req.body

	const now = new Date()
	const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

	try {
		if (!items || items.length === 0) {
			return res.status(400).json({ error: 'Debe seleccionar al menos un producto para devolver' })
		}

		const { data: sale, error: saleError } = await client
			.from('salesTickets')
			.select('id, total_amount, status, business_id')
			.eq('id', id)
			.single()

		if (saleError) throw new Error(saleError)

		if (sale.status === 'returned') {
			return res.status(400).json({ error: 'La venta ya ha sido devuelta' })
		}

		const { data: originalSalesItems, error: originalItemsError } = await client
			.from('salesItems')
			.select('product_id, track_stock, quantity')
			.eq('sale_id', id)

		if (originalItemsError) throw new Error(originalItemsError)

		let totalReturnAmount = 0

		for (const returnItem of items) {
			const saleItem = originalSalesItems.find(si => si.product_id === returnItem.product_id)
			if (!saleItem) {
				return res.status(400).json({ error: `Producto con ID ${returnItem.product_id} no encontrado en la venta original` })
			}

			const maxQty = saleItem.quantity || 0
			if (returnItem.quantity > maxQty) {
				return res.status(400).json({
					error: `No puedes devolver más de ${maxQty} unidades del producto`
				})
			}

			if (saleItem.track_stock === false) {
				totalReturnAmount += returnItem.subtotal
				continue
			}

			const { data: product } = await client
				.from('products')
				.select('id, inventory(stock)')
				.eq('id', returnItem.product_id)
				.single()

			const currentStock = product?.inventory?.[0]?.stock || 0
			const newStock = currentStock + returnItem.quantity

			const { error: updateStockError } = await client
				.from('inventory')
				.update({ stock: newStock })
				.eq('product_id', returnItem.product_id)

			if (updateStockError) throw new Error(updateStockError)

			totalReturnAmount += returnItem.subtotal
		}

		const { data: returnRecord, error: returnError } = await client
			.from('returns')
			.insert({
				sale_id: sale.id,
				business_id: business_id || sale.business_id,
				reason,
				total_amount: totalReturnAmount,
				created_at: localDate
			})
			.select()
			.single()

		if (returnError) throw new Error(returnError)

		const returnItems = items.map(item => ({
			return_id: returnRecord.id,
			product_id: item.product_id,
			quantity: item.quantity,
			unit_price: item.unit_price,
			subtotal: item.subtotal,
			created_at: localDate
		}))

		const { error: returnItemsError } = await client
			.from('returns_items')
			.insert(returnItems)

		if (returnItemsError) throw new Error(returnItemsError)

		// Check if all original items were returned
		const allReturned = originalSalesItems.every(orig => {
			const returned = items.find(r => r.product_id === orig.product_id)
			return returned && returned.quantity >= orig.quantity
		})

		if (allReturned) {
			const { data: updatedSale, error: updateSaleError } = await client
				.from('salesTickets')
				.update({ status: 'returned' })
				.eq('id', id)
				.select()
				.single()

			if (updateSaleError) throw new Error(updateSaleError)

			return res.status(201).json({
				status: 201,
				message: 'Devolución realizada',
				sale: updatedSale,
				returnRecord,
				fullyReturned: true
			})
		}

		res.status(201).json({
			status: 201,
			message: 'Devolución parcial realizada',
			returnRecord,
			fullyReturned: false
		})
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
}
