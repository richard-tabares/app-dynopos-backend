import app from './src/app.js'
import { startCronJobs } from './src/services/cronJobs.js'

const port = process.env.PORT || 3000

app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
    startCronJobs()
})