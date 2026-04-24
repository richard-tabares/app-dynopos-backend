import { Router } from 'express'
import { getDashboardMetrics } from '../controllers/dashboardControllers.js'

const router = Router()

router.get('/:businessId', getDashboardMetrics)

export default router
