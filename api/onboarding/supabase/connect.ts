import { testDatabaseConnection } from '../../../backend/src/utils/dbBootstrap'
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
    const databaseUrl = String(body.databaseUrl || '').trim()
    if (!databaseUrl) {
      return json(res, 400, { error: 'Supabase Session pooler DATABASE_URL을 입력해주세요.' })
    }

    try {
      await testDatabaseConnection(databaseUrl)
    } catch {
      return json(res, 400, { error: 'Supabase DATABASE_URL 연결에 실패했습니다.' })
    }

    const updated = updateOnboardingSession(session, {
      status: 'SUPABASE_CONNECTED',
      supabase: {
        projectUrl: String(body.projectUrl || session.supabase?.projectUrl || '').trim() || undefined,
        projectRef: String(body.projectRef || session.supabase?.projectRef || '').trim() || undefined,
        databaseUrl,
        region: String(body.region || session.supabase?.region || '').trim() || undefined,
      },
    })

    return json(res, 200, {
      success: true,
      session: updated,
      sessionToken: sealOnboardingSession(updated),
    })
  } catch (error) {
    console.error('onboarding/supabase/connect error:', error)
    return json(res, 500, {
      error: 'Supabase 연결에 실패했습니다.',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
