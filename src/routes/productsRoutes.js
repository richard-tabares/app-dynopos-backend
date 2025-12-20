import { Router } from 'express'
import { getProducts, createProduct, updateProduct, deleteProduct } from '../controllers/productsControllers.js'

const router = Router()

router.get('/', getProducts)
router.post('/', createProduct)
router.patch('/:id', updateProduct)
router.delete('/:id', deleteProduct)

export default router