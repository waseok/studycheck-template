import { getVercelUser, listVercelTeams } from '../../../backend/src/utils/vercel'
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
    const token = String(body.vercelToken || session.tokens.vercelToken || '').trim()
    if (!token) {
      return json(res, 400, { error: 'Vercel 토큰을 입력해주세요.' })
    }

    const [user, teams] = await Promise.all([getVercelUser(token), listVercelTeams(token)])
    const updated = updateOnboardingSession(session, {
      tokens: { vercelToken: token },
    })

    return json(res, 200, {
      success: true,
      session: updated,
      sessionToken: sealOnboardingSession(updated),
      user,
      teams,
    })
  } catch (error) {
    console.error('onboarding/vercel/teams error:', error)
    return json(res, 500, {
      error: 'Vercel 팀 목록을 불러오지 못했습니다.',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
