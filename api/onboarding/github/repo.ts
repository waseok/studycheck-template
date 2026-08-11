import { asVercelHandler } from '../../_lib/asVercelHandler'
import { connectGitHubRepo } from '../../../backend/src/controllers/onboarding'

export default asVercelHandler({
  POST: connectGitHubRepo,
})
