import { supabase } from '../config/supabase.js'

export const createSale = async (req, res) => {
	const { business_id, user_id, payment_method, status, salesItems } = req.body

    try {
        
        if (!salesItems ||salesItems.length === 0) {
            return res.status(400).json({ error: 'No se proporcionaron items de venta' })
        }

		//Obtener ids de productos vendidos
		const productIds = salesItems.map((item) => item.product_id)
		// Obtener precios de productos segun los ids
		const { data: products, error: productsError } = await supabase
			.from('products')
			.select('id, price, stock')
			.in('id', productIds)

		if (productsError) throw new Error(productsError)

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
			//Consultar stock actual
			// const { data: product, error: stockError } = await supabase
			// 	.from('products')
			// 	.select('stock')
			// 	.eq('id', item.product_id)
			// 	.single()

			// if (stockError) throw new Error(stockError)

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
