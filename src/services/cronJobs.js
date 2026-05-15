import cron from 'node-cron'
import { renewAllExpired } from './renewalService.js'

export const startCronJobs = () => {
  cron.schedule('0 1 * * *', async () => {
    console.log('[Cron] Iniciando renovación de suscripciones...')
    try {
      const result = await renewAllExpired()
      console.log('[Cron] Renovando suscripciones expiradas...')
      // console.log('[Cron] Renovando suscripciones expiradas:', result)
    } catch (error) {
      console.error('[Cron] Error:', error)
    }
  })

  console.log('[Cron] Jobs programados')
}
