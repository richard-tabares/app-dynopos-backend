import { Router } from 'express'
import { authenticate } from "../middleware/authenticate.js"
import { getSales, createSale, returnSale } from '../controllers/salesControllers.js'

const router = Router()

router.get('/:businessId', authenticate, getSales)
router.post('/createSale', authenticate, createSale)
router.patch('/returnSale/:id', authenticate, returnSale)

export default router