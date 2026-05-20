import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import {
    getSubscription,
    getTransactions,
    getAcceptanceTokens,
    cancelRecurring,
    reactivateSubscription,
    updatePaymentSource,
    payNow,
} from '../controllers/billingControllers.js'

const router = Router()

router.get('/acceptance-tokens', authenticate, getAcceptanceTokens)
router.get('/:businessId', authenticate, getSubscription)
router.get('/:businessId/transactions', authenticate, getTransactions)
router.post('/:businessId/cancel-recurring', authenticate, cancelRecurring)
router.post('/:businessId/reactivate', authenticate, reactivateSubscription)
router.post('/:businessId/update-payment-source', authenticate, updatePaymentSource)
router.post('/:businessId/pay-now', authenticate, payNow)

export default router
