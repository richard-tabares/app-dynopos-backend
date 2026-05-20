import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import {
    getSubscription,
    getTransactions,
    cancelRecurring,
    reactivateSubscription,
} from '../controllers/billingControllers.js'

const router = Router()

router.get('/:businessId', authenticate, getSubscription)
router.get('/:businessId/transactions', authenticate, getTransactions)
router.post('/:businessId/cancel-recurring', authenticate, cancelRecurring)
router.post('/:businessId/reactivate', authenticate, reactivateSubscription)

export default router
