import { Router } from "express"
import multer from "multer"
import { updateBusiness, deleteBusiness, getBusiness, changePassword, uploadBusinessLogo } from "../controllers/businessesControllers.js"

const upload = multer({ storage: multer.memoryStorage() })
const router = Router()

router.get('/getBusiness/:id', getBusiness)
// router.post('/createBusiness', createBusiness)
router.patch('/updateBusiness/:id', updateBusiness)
router.delete('/deleteBusiness/:id', deleteBusiness)
router.post('/changePassword', changePassword)
router.post('/uploadLogo/:id', upload.single('logo'), uploadBusinessLogo)

export default router