import { supabase } from '../config/supabase.js'

export const getSales = async (req, res) => {
	const { businessId } = req.params

	try {
		const { data: sales, error } = await supabase
			.from('salesTickets')
			.select(`
				id,
				total_amount,
				created_at,
				payment_method,
				status,
				salesItems(id, product_id, quantity, unit_price, subtotal, products(name))
			`)
			.eq('business_id', businessId)
			.order('id', { ascending: false })
			.limit(50)

		if (error) throw new Error(error)

		const formatted = sales.map(s => ({
			id: s.id,
			total: s.total_amount,
			date: s.created_at,
			paymentMethod: s.payment_method,
			status: s.status,
			items: s.salesItems.map(item => ({
				id: item.id,
				product_id: item.product_id,
				quantity: item.quantity,
				price: item.unit_price,
				subtotal: item.subtotal,
				name: item.products?.name || 'Producto eliminado'
			})),
			itemsCount: s.salesItems.reduce((acc, i) => acc + i.quantity, 0)
		}))

		res.json(formatted)
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
}

export const createSale = async (req, res) => {
	const { business_id, payment_method, status, salesItems } =
		req.body

	try {
		if (!salesItems || salesItems.length === 0) {
			return res
				.status(400)
				.json({ error: 'No se proporcionaron items de venta' })
		}

		//Obtener ids de productos vendidos
		const productIds = salesItems.map((item) => item.product_id)
		// Obtener precios de productos e inventario segun los ids
		const { data: products, error: productsError } = await supabase
			.from('products')
			.select('id, name, price, inventory(stock)')
			.in('id', productIds)

		if (productsError) throw new Error(productsError)

		//Validamos el stock disponible
		for (const item of salesItems) {
			const product = products.find((p) => p.id === item.product_id)
			if (!product) {
				return res.status(400).json({
					error: `Producto con ID ${item.product_id} no encontrado`,
				})
			}
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
			}
		})

		//crear venta con totales calculados
		const now = new Date()
		const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

		const { data, error: salesError } = await supabase
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
		const { data: itemsData, error: itemsError } = await supabase
			.from('salesItems')
			.insert(itemsToInsert)
			.select()

		if (itemsError) throw new Error(itemsError)

		//Reducir stock de productos vendidos
		for (const item of itemsWithPrices) {
			const product = products.find((p) => p.id === item.product_id)
			//Calcular nuevo stock
			const currentStock = product.inventory?.[0]?.stock || 0
			const newStock = currentStock - item.quantity

			//Actualizar stock en tabla inventory
			const { error: updateStockError } = await supabase
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
	const { id } = req.params
	const { reason, business_id, items } = req.body

	const now = new Date()
	const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

	try {
		if (!items || items.length === 0) {
			return res.status(400).json({ error: 'Debe seleccionar al menos un producto para devolver' })
		}

		const { data: sale, error: saleError } = await supabase
			.from('salesTickets')
			.select('id, total_amount, status, business_id')
			.eq('id', id)
			.single()

		if (saleError) throw new Error(saleError)

		if (sale.status === 'returned') {
			return res.status(400).json({ error: 'La venta ya ha sido devuelta' })
		}

		const productIds = items.map(item => item.product_id)
		const { data: products, error: productsError } = await supabase
			.from('products')
			.select('id, inventory(stock)')
			.in('id', productIds)

		if (productsError) throw new Error(productsError)

		let totalReturnAmount = 0

		for (const returnItem of items) {
			const product = products.find(p => p.id === returnItem.product_id)
			if (!product) {
				return res.status(400).json({ error: `Producto con ID ${returnItem.product_id} no encontrado` })
			}

			const currentStock = product.inventory?.[0]?.stock || 0
			const newStock = currentStock + returnItem.quantity

			const { error: updateStockError } = await supabase
				.from('inventory')
				.update({ stock: newStock })
				.eq('product_id', returnItem.product_id)

			if (updateStockError) throw new Error(updateStockError)

			totalReturnAmount += returnItem.subtotal
		}

		const { data: returnRecord, error: returnError } = await supabase
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

		const { error: returnItemsError } = await supabase
			.from('returns_items')
			.insert(returnItems)

		if (returnItemsError) throw new Error(returnItemsError)

		// Check if all original items were returned
		const { data: originalItems, error: originalError } = await supabase
			.from('salesItems')
			.select('product_id, quantity')
			.eq('sale_id', id)

		if (originalError) throw new Error(originalError)

		const allReturned = originalItems.every(orig => {
			const returned = items.find(r => r.product_id === orig.product_id)
			return returned && returned.quantity >= orig.quantity
		})

		if (allReturned) {
			const { data: updatedSale, error: updateSaleError } = await supabase
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
