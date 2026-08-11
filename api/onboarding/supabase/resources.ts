import { asVercelHandler } from '../../_lib/asVercelHandler'
import { getSupabaseResources } from '../../../backend/src/controllers/onboarding'

export default asVercelHandler({
  POST: getSupabaseResources,
})
