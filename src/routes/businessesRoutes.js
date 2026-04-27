import { Router } from "express"
import multer from "multer"
import { authenticate } from "../middleware/authenticate.js"
import { updateBusiness, deleteBusiness, getBusiness, changePassword, uploadBusinessLogo } from "../controllers/businessesControllers.js"

const upload = multer({ storage: multer.memoryStorage() })
const router = Router()

router.get('/getBusiness/:id', authenticate, getBusiness)
router.patch('/updateBusiness/:id', authenticate, updateBusiness)
router.delete('/deleteBusiness/:id', authenticate, deleteBusiness)
router.post('/changePassword', authenticate, changePassword)
router.post('/uploadLogo/:id', authenticate, upload.single('logo'), uploadBusinessLogo)

export default router