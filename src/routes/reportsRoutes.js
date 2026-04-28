import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { getReports } from '../controllers/reportsControllers.js'

const router = Router()

router.get('/:businessId', authenticate, getReports)

export default router
