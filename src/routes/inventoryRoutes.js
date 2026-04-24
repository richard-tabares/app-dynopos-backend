import { Router } from 'express'
import { updateInventory } from '../controllers/inventoryControllers.js'

const router = Router()

router.patch('/:productId', updateInventory)

export default router
