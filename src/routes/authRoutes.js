import { Router } from 'express'
import { login, logout, signup, confirmEmail } from '../controllers/authControllers.js'

const router = Router()

router.post('/login', login)
router.post('/logout', logout)
router.post('/signup', signup)
router.post('/confirm', confirmEmail)

export default router
