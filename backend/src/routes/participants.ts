import { Router } from 'express'
import { getParticipants, updateCompletionNumber, getMyTrainings, cleanupDuplicates, cancelCompletion, addParticipant, addExternalParticipant, removeParticipant } from '../controllers/participants'
import { authMiddleware, adminMiddleware, trainingAdminMiddleware } from '../middleware/auth'

const router = Router()

router.get('/training/:trainingId', authMiddleware, getParticipants)
router.get('/my-trainings', authMiddleware, getMyTrainings)
router.put('/:id/completion-number', authMiddleware, updateCompletionNumber)
router.put('/:id/cancel-completion', authMiddleware, cancelCompletion)
router.post('/cleanup-duplicates', authMiddleware, adminMiddleware, cleanupDuplicates)
router.post('/training/:trainingId/add', authMiddleware, trainingAdminMiddleware, addParticipant)
router.post('/training/:trainingId/add-external', authMiddleware, trainingAdminMiddleware, addExternalParticipant)
router.delete('/training/:trainingId/user/:userId', authMiddleware, trainingAdminMiddleware, removeParticipant)

export default router
