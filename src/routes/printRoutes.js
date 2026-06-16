import { Router } from 'express'
import { buildTicket } from '../controllers/printController.js'

const router = Router()

router.post('/build-ticket', buildTicket)

export default router
