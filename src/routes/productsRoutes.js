import { Router } from 'express'
import multer from 'multer'
import { authenticate } from "../middleware/authenticate.js"
import { getProducts, createProduct, updateProduct, deleteProduct, getProductById, bulkCreateProducts, generateTemplate, updateVariation, deleteVariation } from '../controllers/productsControllers.js'

const upload = multer({ storage: multer.memoryStorage() })
const router = Router()

router.get('/template', generateTemplate)
router.get('/:businessId', authenticate, getProducts)
router.get('/product/:ProductId', authenticate, getProductById)
router.post('/createProduct', authenticate, createProduct)
router.post('/bulk-upload', authenticate, upload.single('file'), bulkCreateProducts)
router.patch('/:ProductId', authenticate, updateProduct)
router.delete('/:ProductId', authenticate, deleteProduct)
router.patch('/variations/:variationId', authenticate, updateVariation)
router.delete('/variations/:variationId', authenticate, deleteVariation)

export default router