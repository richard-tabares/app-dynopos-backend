import { Router } from 'express'
import { createSale, returnSale } from '../controllers/salesControllers.js'

const router = Router()

router.post('/createSale', createSale)
router.patch('/returnSale/:id', returnSale)

export default router