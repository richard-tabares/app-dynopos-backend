import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { getTodayRevenue } from '../controllers/revenueControllers.js'

const router = Router()

router.get('/today/:businessId', authenticate, getTodayRevenue)

export default router
