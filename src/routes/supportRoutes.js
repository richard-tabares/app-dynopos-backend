import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { createTicket } from '../controllers/supportControllers.js'

const router = Router()

router.post('/tickets', authenticate, createTicket)

export default router
