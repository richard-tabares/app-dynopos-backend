import { Router } from "express"
import { createBusiness, updateBusiness, deleteBusiness, getBusiness } from "../controllers/businessesControllers.js"

const router = Router()

router.get('/getBusiness/:id', getBusiness)
router.post('/createBusiness', createBusiness)
router.patch('/updateBusiness/:id', updateBusiness)
router.delete('/deleteBusiness/:id', deleteBusiness)

export default router