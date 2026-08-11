import { asVercelHandler } from '../../_lib/asVercelHandler'
import { createSupabaseManagedProject } from '../../../backend/src/controllers/onboarding'

export default asVercelHandler({
  POST: createSupabaseManagedProject,
})
