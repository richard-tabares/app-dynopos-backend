import { Router } from 'express'
import {
  initSignup,
  createCheckout,
  webhook,
  checkPaymentStatus,
  confirmTransfer,
} from '../controllers/paymentsControllers.js'
import { authenticate } from '../middleware/authenticate.js'

const router = Router()

router.post('/init-signup', initSignup)
router.post('/create-checkout', createCheckout)
router.post('/webhook', webhook)
router.get('/status/:token', checkPaymentStatus)
router.post('/confirm-transfer', authenticate, confirmTransfer)

export default router
