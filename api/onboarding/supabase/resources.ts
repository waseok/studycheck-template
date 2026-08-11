import {
  listSupabaseOrganizations,
  listSupabaseProjects,
} from '../../../backend/src/utils/supabase'
import {
  sealOnboardingSession,
  unsealOnboardingSession,
  updateOnboardingSession,
} from '../../../backend/src/utils/onboardingSession'
import { getBearerToken, json, readJsonBody } from '../../_lib/http'

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      return json(res, 405, { error: '허용되지 않은 메서드입니다.' })
    }

    const session = unsealOnboardingSession(getBearerToken(req))
    if (!session) {
      return json(res, 401, { error: '온보딩 세션이 없습니다.' })
    }

    const body = await readJsonBody(req)
    const token = String(body.supabaseToken || session.tokens.supabaseToken || '').trim()
    if (!token) {
      return json(res, 400, { error: 'Supabase 토큰을 입력해주세요.' })
    }

    const [organizations, projects] = await Promise.all([
      listSupabaseOrganizations(token),
      listSupabaseProjects(token),
    ])

    const updated = updateOnboardingSession(session, {
      tokens: { supabaseToken: token },
    })

    return json(res, 200, {
      success: true,
      session: updated,
      sessionToken: sealOnboardingSession(updated),
      organizations,
      projects,
    })
  } catch (error) {
    console.error('onboarding/supabase/resources error:', error)
    return json(res, 500, {
      error: 'Supabase 조직/프로젝트 목록을 불러오지 못했습니다.',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
