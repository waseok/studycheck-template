import {
  createOnboardingSession,
  sealOnboardingSession,
  unsealOnboardingSession,
} from '../../backend/src/utils/onboardingSession'
import { getBearerToken, json, readJsonBody } from '../_lib/http'

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      const session = createOnboardingSession(String(body.repoName || '').trim() || undefined)
      return json(res, 200, {
        success: true,
        session,
        sessionToken: sealOnboardingSession(session),
      })
    }

    if (req.method === 'GET') {
      const session = unsealOnboardingSession(getBearerToken(req))
      if (!session) {
        return json(res, 401, { error: '온보딩 세션이 없습니다. 처음부터 다시 시작해주세요.' })
      }
      return json(res, 200, {
        success: true,
        session,
        sessionToken: sealOnboardingSession(session),
      })
    }

    return json(res, 405, { error: '허용되지 않은 메서드입니다.' })
  } catch (error) {
    console.error('onboarding/session error:', error)
    return json(res, 500, {
      error: '온보딩 세션 처리에 실패했습니다.',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
