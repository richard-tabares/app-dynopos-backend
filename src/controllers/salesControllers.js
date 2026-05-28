import { supabase, serviceRoleSupabase } from '../config/supabase.js'

const getClient = (req) => req.user?.role !== 'admin' ? serviceRoleSupabase : (req.supabase || supabase)

export const getSales = async (req, res) => {
	const client = getClient(req)
	const { businessId } = req.params

	try {
		const { data: sales, error } = await client
			.from('vw_sales_history')
			.select('*')
			.eq('business_id', businessId)
			.order('ticket_number', { ascending: false })
			.limit(10)

		if (error) {
			console.error('getSales error:', error)
			throw new Error(error.message || JSON.stringify(error))
		}

		// Build map of returned quantities per (sale_id, product_id, variation_id)
		const saleIds = sales.map(s => s.id)
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
					.select('return_id, product_id, variation_id, quantity')
					.in('return_id', returnIds)

				if (returnedItems) {
					returnedItems.forEach(item => {
						const sid = saleOfReturn[item.return_id]
						if (!returnedPerProduct[sid]) returnedPerProduct[sid] = {}
						const key = `${item.product_id}_${item.variation_id || ''}`
						returnedPerProduct[sid][key] = (returnedPerProduct[sid][key] || 0) + item.quantity
					})
				}
			}
		}

		const formatted = sales.map(s => ({
			id: s.id,
			ticketNumber: s.ticket_number,
			total: s.total_amount,
			date: s.created_at,
			paymentMethod: s.payment_method,
			status: s.status,
			salesperson: s.created_by_name || null,
			items: (s.items || []).map(item => ({
				...item,
				already_returned: returnedPerProduct[s.id]?.[`${item.product_id}_${item.variation_id || ''}`] || 0
			})),
			itemsCount: s.items_count
		}))

		res.json(formatted)
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
}

export const createSale = async (req, res) => {
	const client = getClient(req)
	let { business_id, payment_method, status, salesItems, created_at: bodyCreatedAt } =
		req.body

	try {
		if (!salesItems || salesItems.length === 0) {
			return res
				.status(400)
				.json({ error: 'No se proporcionaron items de venta' })
		}

		// Normalize product_id to string (UUID safety)
		salesItems = salesItems.map(item => ({ ...item, product_id: String(item.product_id) }))

		const productIds = salesItems.map((item) => item.product_id)
		const { data: products, error: productsError } = await client
			.from('products')
			.select('id, name, price, unit_cost, track_stock, variation_type, inventory(stock)')
			.in('id', productIds)

		if (productsError) {
			console.error('Products fetch error:', productsError)
			throw new Error(productsError.message || JSON.stringify(productsError))
		}

		// Collect variation IDs to fetch prices, stock, and costs
		const variationIds = salesItems.filter(item => item.variation_id).map(item => item.variation_id)
		let variations = []
		if (variationIds.length > 0) {
			const { data: varData, error: varError } = await client
				.from('product_variations')
				.select('id, variation_name, price, unit_cost, stock')
				.in('id', variationIds)

			if (varError) throw new Error(varError.message || JSON.stringify(varError))
			variations = varData || []
		}

		for (const item of salesItems) {
			const product = products.find((p) => p.id === item.product_id)
			if (!product) {
				return res.status(400).json({
					error: `Producto con ID ${item.product_id} no encontrado`,
				})
			}
			if (product.track_stock === false) continue

			if (item.variation_id) {
				const variation = variations.find(v => v.id === item.variation_id)
				if (!variation) {
					return res.status(400).json({
						error: `Variación con ID ${item.variation_id} no encontrada`,
					})
				}
				if (item.quantity > variation.stock) {
					return res.status(400).json({
						error: `La variación ${product.name} - ${variation.variation_name} no tiene stock suficiente, stock actual es ${variation.stock}`,
					})
				}
			} else {
				const currentStock = product.inventory?.[0]?.stock || 0
				if (item.quantity > currentStock) {
					return res.status(400).json({
						error: `El producto ${product.name} no tiene stock suficiente, stock actual es ${currentStock}`,
					})
				}
			}
		}

		//calculamos totales
		let total_amount = 0
		const itemsWithPrices = salesItems.map((item) => {
			const product = products.find((p) => p.id === item.product_id)

			let unitPrice
			let unitCost
			let variationName = null

			if (item.variation_id) {
				const variation = variations.find(v => v.id === item.variation_id)
				unitPrice = variation ? variation.price : product.price
				unitCost = variation ? (variation.unit_cost ?? 0) : (product.unit_cost ?? 0)
				variationName = variation ? variation.variation_name : null
			} else {
				unitPrice = product.price
				unitCost = product.unit_cost ?? 0
			}

			const subtotal = unitPrice * item.quantity
			total_amount += subtotal

			return {
				...item,
				unit_price: unitPrice,
				unit_cost: unitCost,
				subtotal,
				track_stock: product.track_stock ?? true,
				variation_name: variationName,
			}
		})

		//crear venta con totales calculados
		const localDate = bodyCreatedAt || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())

		// Obtener siguiente ticket_number (atómico por negocio)
		const { data: ticketData, error: ticketError } = await client
			.rpc('get_next_ticket', { p_business_id: business_id })
			.single()

		if (ticketError) {
			console.error('get_next_ticket error:', ticketError)
			throw new Error(ticketError.message || JSON.stringify(ticketError))
		}

		const { data, error: salesError } = await client
			.from('salesTickets')
			.insert([
				{
					business_id,
					payment_method,
					status,
					total_amount,
					ticket_number: typeof ticketData === 'object' && ticketData !== null ? ticketData.get_next_ticket : ticketData,
					created_at: localDate,
					created_by: req.user.id,
				},
			])
			.select()
			.single()

		if (salesError) {
			console.error('SalesTicket insert error:', salesError)
			throw new Error(salesError.message || JSON.stringify(salesError))
		}
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

		if (itemsError) {
			console.error('SalesItems insert error:', itemsError)
			throw new Error(itemsError.message || JSON.stringify(itemsError))
		}

		//Reducir stock de productos vendidos
		const movements = []
		for (const item of itemsWithPrices) {
			const product = products.find((p) => p.id === item.product_id)
			if (product.track_stock === false) continue

			if (item.variation_id) {
				const variation = variations.find(v => v.id === item.variation_id)
				const newStock = (variation?.stock || 0) - item.quantity

				const { error: updateVarError } = await client
					.from('product_variations')
					.update({ stock: newStock })
					.eq('id', item.variation_id)

				if (updateVarError) {
					console.error('Variation stock update error:', updateVarError)
					throw new Error(updateVarError.message || JSON.stringify(updateVarError))
				}
			} else {
				const currentStock = product.inventory?.[0]?.stock || 0
				const newStock = currentStock - item.quantity

				const { error: updateStockError } = await client
					.from('inventory')
					.update({ stock: newStock })
					.eq('product_id', item.product_id)

				if (updateStockError) {
					console.error('Stock update error:', updateStockError)
					throw new Error(updateStockError.message || JSON.stringify(updateStockError))
				}
			}

			movements.push({
				business_id,
				product_id: item.product_id,
				variation_id: item.variation_id || null,
				type: 'sale',
				quantity: item.quantity,
				unit_cost: item.unit_cost,
				notes: `Venta #${data.ticket_number}`,
				created_at: localDate
			})
		}

		if (movements.length > 0) {
			const { error: movementsError } = await client
				.from('inventory_movements')
				.insert(movements)

			if (movementsError) {
				console.error('Inventory movements insert error:', movementsError)
				throw new Error(movementsError.message || JSON.stringify(movementsError))
			}
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

export const updateSaleDate = async (req, res) => {
	const client = getClient(req)
	const { saleId } = req.params
	const { date } = req.body

	try {
		if (!date) {
			return res.status(400).json({ error: 'La fecha es requerida' })
		}

		const { data: sale, error: saleError } = await client
			.from('salesTickets')
			.select('id, business_id, ticket_number')
			.eq('id', saleId)
			.single()

		if (saleError) {
			return res.status(404).json({ error: 'Venta no encontrada' })
		}

		const { error: updateError } = await client
			.from('salesTickets')
			.update({ created_at: date })
			.eq('id', saleId)

		if (updateError) throw updateError

		const { error: itemsError } = await client
			.from('salesItems')
			.update({ created_at: date })
			.eq('sale_id', saleId)

		if (itemsError) throw itemsError

		const ticketNumber = sale.ticket_number
		const { error: movementsError } = await client
			.from('inventory_movements')
			.update({ created_at: date })
			.eq('business_id', sale.business_id)
			.eq('type', 'sale')
			.ilike('notes', `%#${ticketNumber}%`)

		if (movementsError) {
			console.error('Inventory movements update error:', movementsError)
		}

		const { data: updatedSale, error: fetchError } = await client
			.from('vw_sales_history')
			.select('*')
			.eq('id', saleId)
			.single()

		if (fetchError) throw fetchError

		res.json({
			message: 'Fecha actualizada',
			sale: {
				id: updatedSale.id,
				ticketNumber: updatedSale.ticket_number,
				total: updatedSale.total_amount,
				date: updatedSale.created_at,
				paymentMethod: updatedSale.payment_method,
				status: updatedSale.status,
				salesperson: updatedSale.created_by_name || null,
				items: updatedSale.items,
				itemsCount: updatedSale.items_count
			}
		})
	} catch (error) {
		console.error('Error in updateSaleDate:', error)
		res.status(500).json({ error: error.message || 'Error interno del servidor' })
	}
}

export const returnSale = async (req, res) => {
	const client = getClient(req)
	const { id } = req.params
	const { reason, business_id, items } = req.body

	const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())

	try {
		if (!items || items.length === 0) {
			return res.status(400).json({ error: 'Debe seleccionar al menos un producto para devolver' })
		}

		const { data: sale, error: saleError } = await client
			.from('salesTickets')
			.select('id, total_amount, status, business_id, ticket_number')
			.eq('id', id)
			.single()

		if (saleError) {
			console.error('SalesTicket fetch error:', saleError)
			throw new Error(saleError.message || JSON.stringify(saleError))
		}

		if (sale.status === 'returned') {
			return res.status(400).json({ error: 'La venta ya ha sido devuelta' })
		}

		const { data: originalSalesItems, error: originalItemsError } = await client
			.from('salesItems')
			.select('product_id, track_stock, quantity, variation_id')
			.eq('sale_id', id)

		if (originalItemsError) {
			console.error('SalesItems fetch error:', originalItemsError)
			throw new Error(originalItemsError.message || JSON.stringify(originalItemsError))
		}

		// Get already-returned quantities from previous partial returns
		const { data: previousReturns } = await client
			.from('returns')
			.select('id')
			.eq('sale_id', id)

		const alreadyReturnedMap = {}
		if (previousReturns && previousReturns.length > 0) {
			const returnIds = previousReturns.map(r => r.id)
			const { data: returnedItems } = await client
				.from('returns_items')
				.select('product_id, variation_id, quantity')
				.in('return_id', returnIds)

			if (returnedItems) {
				returnedItems.forEach(item => {
					const key = `${item.product_id}_${item.variation_id || ''}`
					alreadyReturnedMap[key] = (alreadyReturnedMap[key] || 0) + item.quantity
				})
			}
		}

		let totalReturnAmount = 0
		const movements = []

		for (const returnItem of items) {
			const saleItem = originalSalesItems.find(si =>
				si.product_id === returnItem.product_id &&
				(si.variation_id || '') === (returnItem.variation_id || '')
			)
			if (!saleItem) {
				return res.status(400).json({ error: `Producto con ID ${returnItem.product_id} no encontrado en la venta original` })
			}

			const returnKey = `${returnItem.product_id}_${returnItem.variation_id || ''}`
			const alreadyReturned = alreadyReturnedMap[returnKey] || 0
			const availableToReturn = (saleItem.quantity || 0) - alreadyReturned

			if (availableToReturn <= 0) {
				return res.status(400).json({
					error: `El producto ya fue devuelto completamente`
				})
			}

			if (returnItem.quantity > availableToReturn) {
				return res.status(400).json({
					error: `Solo puedes devolver hasta ${availableToReturn} unidades de este producto`
				})
			}

			if (saleItem.track_stock === false) {
				totalReturnAmount += returnItem.subtotal
				continue
			}

			if (returnItem.variation_id) {
				const { data: variation } = await client
					.from('product_variations')
					.select('stock')
					.eq('id', returnItem.variation_id)
					.single()

				const newStock = (variation?.stock || 0) + returnItem.quantity

				const { error: updateVarError } = await client
					.from('product_variations')
					.update({ stock: newStock })
					.eq('id', returnItem.variation_id)

				if (updateVarError) {
					console.error('Variation stock update error during return:', updateVarError)
					throw new Error(updateVarError.message || JSON.stringify(updateVarError))
				}
			} else {
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

				if (updateStockError) {
					console.error('Stock update error during return:', updateStockError)
					throw new Error(updateStockError.message || JSON.stringify(updateStockError))
				}
			}

			totalReturnAmount += returnItem.subtotal

			movements.push({
				business_id: business_id || sale.business_id,
				product_id: returnItem.product_id,
				variation_id: returnItem.variation_id || null,
				type: 'return',
				quantity: returnItem.quantity,
				unit_cost: returnItem.unit_cost ?? 0,
				notes: `Devolución venta #${sale.ticket_number}`,
				created_at: localDate
			})
		}

		if (movements.length > 0) {
			const { error: movementsError } = await client
				.from('inventory_movements')
				.insert(movements)

			if (movementsError) {
				console.error('Inventory movements insert error during return:', movementsError)
				throw new Error(movementsError.message || JSON.stringify(movementsError))
			}
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

		if (returnError) {
			console.error('Returns insert error:', returnError)
			throw new Error(returnError.message || JSON.stringify(returnError))
		}

		const returnItems = items.map(item => ({
			return_id: returnRecord.id,
			product_id: item.product_id,
			variation_id: item.variation_id || null,
			variation_name: item.variation_name || null,
			quantity: item.quantity,
			unit_price: item.unit_price,
			subtotal: item.subtotal,
			created_at: localDate
		}))

		const { error: returnItemsError } = await client
			.from('returns_items')
			.insert(returnItems)

		if (returnItemsError) {
			console.error('Returns items insert error:', returnItemsError)
			throw new Error(returnItemsError.message || JSON.stringify(returnItemsError))
		}

		// Check if all original items were returned (including previous returns)
		const allReturned = originalSalesItems.every(orig => {
			const origKey = `${orig.product_id}_${orig.variation_id || ''}`
			const alreadyR = alreadyReturnedMap[origKey] || 0
			const currentR = items.find(r =>
				r.product_id === orig.product_id &&
				(r.variation_id || '') === (orig.variation_id || '')
			)?.quantity || 0
			return (alreadyR + currentR) >= orig.quantity
		})

		if (allReturned) {
			const { data: updatedSale, error: updateSaleError } = await client
				.from('salesTickets')
				.update({ status: 'returned' })
				.eq('id', id)
				.select()
				.single()

			if (updateSaleError) {
				console.error('Sale status update error:', updateSaleError)
				throw new Error(updateSaleError.message || JSON.stringify(updateSaleError))
			}

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
