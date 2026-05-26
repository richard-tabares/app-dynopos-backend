import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js'
import * as adminCtrl from '../controllers/adminControllers.js'

const router = Router()

router.post('/login', adminCtrl.adminLogin)

router.use(authenticate, requireSuperAdmin)

router.get('/clients', adminCtrl.getClients)
router.post('/clients', adminCtrl.createClient)
router.patch('/clients/:id/status', adminCtrl.toggleClientStatus)
router.patch('/clients/:id/frequency', adminCtrl.changeBillingFrequency)
router.patch('/clients/:id/extend', adminCtrl.extendSubscription)
router.post('/clients/:id/renew', adminCtrl.manualRenewal)

router.get('/support/tickets', adminCtrl.getAdminTickets)
router.patch('/support/tickets/:id/status', adminCtrl.updateTicketStatus)

router.get('/payments', adminCtrl.getPayments)

export default router
