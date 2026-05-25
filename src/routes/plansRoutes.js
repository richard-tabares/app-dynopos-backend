import { Router } from 'express'
import { getCurrentPlan } from '../controllers/plansController.js'

const router = Router()

router.get('/current', getCurrentPlan)

export default router
