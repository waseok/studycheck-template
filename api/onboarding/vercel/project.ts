import { asVercelHandler } from '../../_lib/asVercelHandler'
import { connectVercelProject } from '../../../backend/src/controllers/onboarding'

export default asVercelHandler({
  POST: connectVercelProject,
})
