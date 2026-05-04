import { Router } from 'express'
import { authenticate } from "../middleware/authenticate.js"
import { adjustInventory, getMovements, getAllMovements } from '../controllers/inventoryControllers.js'

const router = Router()

router.patch('/:productId', authenticate, adjustInventory)
router.get('/:productId/movements', authenticate, getMovements)
router.get('/business/:businessId/movements', authenticate, getAllMovements)

export default router
