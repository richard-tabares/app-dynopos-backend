import express from 'express'
import cors from 'cors'
import productsRoutes from './routes/productsRoutes.js'
import categoriesRoutes from './routes/categoriesRoutes.js'
import authRoutes from './routes/authRoutes.js'
import businessesRoutes from './routes/businessesRoutes.js'
import salesRoutes from './routes/salesRoutes.js'
import inventoryRoutes from './routes/inventoryRoutes.js'
import dashboardRoutes from './routes/dashboardRoutes.js'

const app = express()

app.use(cors())
app.use(express.json())

app.use('/api/products', productsRoutes)
app.use('/api/categories', categoriesRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/businesses', businessesRoutes)
app.use('/api/sales', salesRoutes)
app.use('/api/inventory', inventoryRoutes)
app.use('/api/dashboard', dashboardRoutes)

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err)
    res.status(500).json({ error: err.message || 'Error interno del servidor' })
})

export default app