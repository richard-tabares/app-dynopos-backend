import { Router } from 'express'
import multer from 'multer'
import { authenticate } from '../middleware/authenticate.js'
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js'
import * as adminCtrl from '../controllers/adminControllers.js'
import * as changelogCtrl from '../controllers/changelogControllers.js'

const upload = multer({ storage: multer.memoryStorage() })
const router = Router()

router.post('/login', adminCtrl.adminLogin)

router.use(authenticate, requireSuperAdmin)

router.get('/clients', adminCtrl.getClients)
router.post('/clients', adminCtrl.createClient)
router.patch('/clients/:id/status', adminCtrl.toggleClientStatus)
router.patch('/clients/:id/frequency', adminCtrl.changeBillingFrequency)
router.patch('/clients/:id/extend', adminCtrl.extendSubscription)
router.post('/clients/:id/renew', adminCtrl.manualRenewal)
router.patch('/clients/:id/info', adminCtrl.updateClientInfo)

router.get('/support/tickets', adminCtrl.getAdminTickets)
router.patch('/support/tickets/:id/status', adminCtrl.updateTicketStatus)

router.get('/payments', adminCtrl.getPayments)

router.post('/clients/:id/clear-data', adminCtrl.clearClientData)
router.delete('/clients/:id', adminCtrl.deleteClientAccount)

router.get('/changelog', (req, res, next) => { req.isAdminRoute = true; next() }, changelogCtrl.getChangelog)
router.get('/changelog/:id', (req, res, next) => { req.isAdminRoute = true; next() }, changelogCtrl.getChangelogById)
router.post('/changelog', changelogCtrl.createChangelog)
router.patch('/changelog/:id', changelogCtrl.updateChangelog)
router.delete('/changelog/:id', changelogCtrl.deleteChangelog)
router.post('/changelog/upload-image', upload.single('image'), changelogCtrl.uploadChangelogImage)

export default router
