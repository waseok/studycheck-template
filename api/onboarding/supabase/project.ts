import {
  createSupabaseProject,
  inferSupabaseProjectUrl,
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
    const organizationId = String(body.organizationId || '').trim()
    const projectName = String(body.projectName || '').trim()
    const region = String(body.region || '').trim()
    const dbPassword = String(body.dbPassword || '')

    if (!token || !organizationId || !projectName || !region || !dbPassword) {
      return json(res, 400, { error: 'Supabase 프로젝트 생성 정보가 부족합니다.' })
    }

    const project = await createSupabaseProject({
      token,
      organizationId,
      name: projectName,
      region,
      dbPassword,
    })

    const updated = updateOnboardingSession(session, {
      status: 'SUPABASE_CONNECTED',
      tokens: { supabaseToken: token },
      supabase: {
        organizationId,
        projectRef: project.id,
        projectUrl: inferSupabaseProjectUrl(project.id),
        region: project.region,
      },
    })

    return json(res, 200, {
      success: true,
      session: updated,
      sessionToken: sealOnboardingSession(updated),
      hint: 'Supabase 프로젝트가 생성되었습니다. Session pooler DATABASE_URL은 Connect 화면에서 복사해 다음 단계에 입력해주세요.',
    })
  } catch (error) {
    console.error('onboarding/supabase/project error:', error)
    return json(res, 500, {
      error: 'Supabase 프로젝트 생성에 실패했습니다.',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
