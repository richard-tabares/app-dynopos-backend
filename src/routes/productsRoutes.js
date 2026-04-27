import { Router } from 'express'
import { authenticate } from "../middleware/authenticate.js"
import { getProducts, createProduct, updateProduct, deleteProduct, getProductById } from '../controllers/productsControllers.js'

const router = Router()

router.get('/:businessId', authenticate, getProducts)
router.get('/product/:ProductId', authenticate, getProductById)
router.post('/createProduct', authenticate, createProduct)
router.patch('/:ProductId', authenticate, updateProduct)
router.delete('/:ProductId', authenticate, deleteProduct)

export default router