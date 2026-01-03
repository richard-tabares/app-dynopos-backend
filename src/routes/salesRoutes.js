import { Router } from 'express'
import { createSale } from '../controllers/salesControllers.js'

const router = Router()

router.post('/createSale', createSale)

export default router