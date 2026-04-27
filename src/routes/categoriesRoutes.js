import { Router } from 'express'
import { authenticate } from "../middleware/authenticate.js"
import { getCategories, createCategory, updateCategory, deleteCategory } from '../controllers/categoriesControllers.js'

const router = Router()

router.get('/:businessId', authenticate, getCategories)
router.post('/', authenticate, createCategory)
router.patch('/:id', authenticate, updateCategory)
router.delete('/:id', authenticate, deleteCategory)

export default router