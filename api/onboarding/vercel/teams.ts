import { asVercelHandler } from '../../_lib/asVercelHandler'
import { getVercelTeams } from '../../../backend/src/controllers/onboarding'

export default asVercelHandler({
  POST: getVercelTeams,
})
