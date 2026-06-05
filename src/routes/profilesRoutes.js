import { Router } from "express"
import { authenticate } from "../middleware/authenticate.js"
import { updateProfile } from "../controllers/profilesControllers.js"

const router = Router()

router.patch('/:id', authenticate, updateProfile)

export default router
