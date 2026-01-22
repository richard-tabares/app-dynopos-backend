import { supabase } from '../config/supabase.js'

export const createSale = async (req, res) => {
	const { business_id, user_id, payment_method, status, salesItems } =
		req.body

	try {
		if (!salesItems || salesItems.length === 0) {
			return res
				.status(400)
				.json({ error: 'No se proporcionaron items de venta' })
		}

		//Obtener ids de productos vendidos
		const productIds = salesItems.map((item) => item.product_id)
		// Obtener precios de productos segun los ids
		const { data: products, error: productsError } = await supabase
			.from('products')
			.select('id, name, price, stock')
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
			if (item.quantity > product.stock) {
				return res.status(400).json({
					error: `El producto ${product.name} no tiene stock suficiente, stock actual es ${product.stock}`,
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
		const { data, error: salesError } = await supabase
			.from('salesTickets')
			.insert([
				{
					business_id,
					user_id,
					payment_method,
					status,
					total_amount,
				},
			])
			.select()
			.single()

		if (salesError) throw new Error(salesError)
		//preparar items de venta con sale_id
		const itemsToInsert = itemsWithPrices.map((item) => ({
			...item,
			sale_id: data.id,
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
			const newStock = product.stock - item.quantity

			//Actualizar stock
			const { error: updateStockError } = await supabase
				.from('products')
				.update({ stock: newStock })
				.eq('id', item.product_id)

			if (updateStockError) throw new Error(updateStockError)
		}

		res.status(201).json({ status: 201, message: 'Venta Creada', data })
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
}

export const returnSale = async (req, res) => {
	const { id } = req.params

	try {
		//obtenemos la venta con sus items
		const { data: sale, error: saleError } = await supabase
			.from('salesTickets')
			.select('id, status, salesItems(product_id, quantity)')
			.eq('id', id)
			.single()

		if (saleError) throw new Error(saleError)

		if (sale.status === 'returned') {
			return res
				.status(400)
				.json({ error: 'La venta ya ha sido devuelta' })
		}

		//restaurar stock de productos
		for (const item of sale.salesItems) {
			//obtener producto
			const { data: product, error: productError } = await supabase
				.from('products')
				.select('stock')
				.eq('id', item.product_id)
				.single()

			if (productError) throw new Error(productError)

			//calcular nuevo stock
			const newStock = product.stock + item.quantity
			//actualizar stock
			const { error: updateStockError } = await supabase
				.from('products')
				.update({ stock: newStock })
				.eq('id', item.product_id)

			if (updateStockError) throw new Error(updateStockError)
		}

		//actualizar estado de la venta a 'returned'
		const { data: updatedSale, error: updateSaleError } = await supabase
			.from('salesTickets')
			.update({ status: 'returned' })
			.eq('id', id)
			.select()
			.single()

		if (updateSaleError) throw new Error(updateSaleError)

		res.status(201).json({status: 201, message: 'Devolución realizada', sale: updatedSale})
	} catch (error) {
		res.status(500).json({ error: error.message })
	}
}
