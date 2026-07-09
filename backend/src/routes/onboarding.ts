import { Router } from 'express'
import {
  connectExistingSupabase,
  connectGitHubRepo,
  connectVercelProject,
  createSupabaseManagedProject,
  getOnboardingConfig,
  getOnboardingSession,
  getSupabaseResources,
  getVercelTeams,
  provisionInfrastructure,
  startOnboardingSession,
} from '../controllers/onboarding'

const router = Router()

router.get('/config', getOnboardingConfig)
router.post('/session', startOnboardingSession)
router.get('/session', getOnboardingSession)
router.post('/github/repo', connectGitHubRepo)
router.post('/vercel/teams', getVercelTeams)
router.post('/vercel/project', connectVercelProject)
router.post('/supabase/resources', getSupabaseResources)
router.post('/supabase/project', createSupabaseManagedProject)
router.post('/supabase/connect', connectExistingSupabase)
router.post('/provision', provisionInfrastructure)

export default router
