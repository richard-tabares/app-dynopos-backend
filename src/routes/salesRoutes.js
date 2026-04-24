import { Router } from 'express'
import { getSales, createSale, returnSale } from '../controllers/salesControllers.js'

const router = Router()

router.get('/:businessId', getSales)
router.post('/createSale', createSale)
router.patch('/returnSale/:id', returnSale)

export default router