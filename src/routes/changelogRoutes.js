import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import * as changelogCtrl from '../controllers/changelogControllers.js'

const router = Router()

router.use(authenticate)

router.get('/latest-id', changelogCtrl.getLatestChangelogId)
router.get('/', changelogCtrl.getChangelog)
router.get('/:id', changelogCtrl.getChangelogById)

export default router
