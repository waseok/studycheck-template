import { asVercelHandler } from '../../_lib/asVercelHandler'
import { connectExistingSupabase } from '../../../backend/src/controllers/onboarding'

export default asVercelHandler({
  POST: connectExistingSupabase,
})
