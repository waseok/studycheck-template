import { Router } from 'express'
import { login, loginInitial, loginPin, setPin, register } from '../controllers/auth'
import { authMiddleware } from '../middleware/auth'

const router = Router()

router.post('/login', login)
router.post('/login-initial', loginInitial)
router.post('/login-pin', loginPin)
router.post('/register', register)
router.post('/set-pin', authMiddleware, setPin)

export default router
