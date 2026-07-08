import { Router } from 'express'
import { bootstrapInfra, completeSetup, getPublicSettings, getSetupStatus } from '../controllers/settings'

const router = Router()

router.get('/status', getSetupStatus)
router.get('/public', getPublicSettings)
router.post('/bootstrap-infra', bootstrapInfra)
router.post('/setup', completeSetup)

export default router
