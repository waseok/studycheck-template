import { asVercelHandler } from '../_lib/asVercelHandler'
import {
  getOnboardingSession,
  startOnboardingSession,
} from '../../backend/src/controllers/onboarding'

export default asVercelHandler({
  GET: getOnboardingSession,
  POST: startOnboardingSession,
})
