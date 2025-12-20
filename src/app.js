import express from 'express'
import cors from 'cors'
import productsRoutes from './routes/productsRoutes.js'

const app = express()

app.use(cors())
app.use(express.json())

app.use('/api/products', productsRoutes)

export default app