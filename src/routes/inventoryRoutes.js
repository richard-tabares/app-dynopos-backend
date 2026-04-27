import { Router } from 'express'
import { authenticate } from "../middleware/authenticate.js"
import { updateInventory } from '../controllers/inventoryControllers.js'

const router = Router()

router.patch('/:productId', authenticate, updateInventory)

export default router
