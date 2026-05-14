import express from 'express'
import cors from 'cors'
import productsRoutes from './routes/productsRoutes.js'
import categoriesRoutes from './routes/categoriesRoutes.js'
import authRoutes from './routes/authRoutes.js'
import businessesRoutes from './routes/businessesRoutes.js'
import salesRoutes from './routes/salesRoutes.js'
import inventoryRoutes from './routes/inventoryRoutes.js'
import dashboardRoutes from './routes/dashboardRoutes.js'
import reportsRoutes from './routes/reportsRoutes.js'
import revenueRoutes from './routes/revenueRoutes.js'
import paymentsRoutes from './routes/paymentsRoutes.js'
import cronRoutes from './routes/cronRoutes.js'

const app = express()

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : null

app.use(cors({
  origin: allowedOrigins || ((origin, cb) => {
    if (!origin || /^https?:\/\/.*localhost(:\d+)?$/.test(origin)) return cb(null, true)
    return cb(null, false)
  }),
  credentials: true
}))
app.use(express.json())

app.get('/health', (req, res) => res.send('OK'))

app.use('/api/products', productsRoutes)
app.use('/api/categories', categoriesRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/businesses', businessesRoutes)
app.use('/api/sales', salesRoutes)
app.use('/api/inventory', inventoryRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/revenue', revenueRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api/cron', cronRoutes)

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err)
    res.status(500).json({ error: err.message || 'Error interno del servidor' })
})

export default app