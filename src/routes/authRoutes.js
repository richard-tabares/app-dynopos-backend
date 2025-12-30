import { login, logout, signup } from '../controllers/authControllers.js'
import { Router } from 'express'

const router = Router()

router.post('/login', login)
router.post('/logout', logout)
router.post('/signup', signup)

export default router
