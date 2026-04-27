import { Router } from 'express'
import { authenticate } from "../middleware/authenticate.js"
import { getDashboardMetrics } from '../controllers/dashboardControllers.js'

const router = Router()

router.get('/:businessId', authenticate, getDashboardMetrics)

export default router
