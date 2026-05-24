import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { getUsers, createUser, updateUser, deleteUser } from '../controllers/usersController.js'

const router = Router()

router.get('/:businessId', authenticate, getUsers)
router.post('/', authenticate, createUser)
router.patch('/:userId', authenticate, updateUser)
router.delete('/:userId', authenticate, deleteUser)

export default router
