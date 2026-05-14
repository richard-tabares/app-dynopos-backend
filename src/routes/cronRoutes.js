import { Router } from 'express'
import { renewAllExpired } from '../services/renewalService.js'

const router = Router()

const CRON_SECRET = process.env.CRON_SECRET

router.post('/renew-subscriptions', async (req, res) => {
  const apiKey = req.headers['x-cron-secret']
  if (CRON_SECRET && apiKey !== CRON_SECRET) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  try {
    const result = await renewAllExpired()
    return res.json({ message: 'Renovaciones procesadas', ...result })
  } catch (error) {
    console.error('Cron renew error:', error)
    return res.status(500).json({ error: error.message })
  }
})

export default router
