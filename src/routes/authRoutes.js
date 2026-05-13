import { Router } from 'express'
import { login, logout, signup, confirmEmail, checkEmail, forgotPassword, resetPassword, refreshSession } from '../controllers/authControllers.js'

const router = Router()

router.post('/login', login)
router.post('/logout', logout)
router.post('/signup', signup)
router.post('/confirm', confirmEmail)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)
router.post('/refresh', refreshSession)
router.get('/check-email/:email', checkEmail)

export default router
