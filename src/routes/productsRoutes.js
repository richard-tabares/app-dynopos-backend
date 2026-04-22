import { Router } from 'express'
import { getProducts, createProduct, updateProduct, deleteProduct, getProductById } from '../controllers/productsControllers.js'

const router = Router()

router.get('/:businessId', getProducts)
router.get('/product/:ProductId', getProductById)
router.post('/createProduct', createProduct)
router.patch('/:ProductId', updateProduct)
router.delete('/:ProductId', deleteProduct)

export default router