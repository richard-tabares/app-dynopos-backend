import { Router } from 'express'
import {
  initSignup,
  createCheckout,
  webhook,
  checkPaymentStatus,
  confirmTransfer,
  getAcceptanceTokens,
  processCardPayment,
} from '../controllers/paymentsControllers.js'
import { authenticate } from '../middleware/authenticate.js'

const router = Router()

router.post('/init-signup', initSignup)
router.post('/create-checkout', createCheckout)
router.post('/webhook', webhook)
router.get('/status/:id', checkPaymentStatus)
router.post('/confirm-transfer', authenticate, confirmTransfer)
router.get('/acceptance-tokens/:id', getAcceptanceTokens)
router.post('/process-card', processCardPayment)

export default router
