import { asVercelHandler } from '../_lib/asVercelHandler'
import { provisionInfrastructure } from '../../backend/src/controllers/onboarding'

export default asVercelHandler({
  POST: provisionInfrastructure,
})
