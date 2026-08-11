import { createVercelProject } from '../../../backend/src/utils/vercel'
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
    if (!session.github?.owner || !session.github.repo) {
      return json(res, 400, { error: '먼저 GitHub 저장소를 생성해주세요.' })
    }

    const body = await readJsonBody(req)
    const token = String(body.vercelToken || session.tokens.vercelToken || '').trim()
    if (!token) {
      return json(res, 400, { error: 'Vercel 토큰을 입력해주세요.' })
    }

    const created = await createVercelProject({
      token,
      teamId: body.teamId?.trim() || undefined,
      projectName: String(body.projectName || session.repoName || session.github.repo).trim(),
      repo: `${session.github.owner}/${session.github.repo}`,
    })

    const updated = updateOnboardingSession(session, {
      status: 'VERCEL_CONNECTED',
      tokens: { vercelToken: token },
      vercel: {
        teamId: body.teamId?.trim() || undefined,
        projectId: created.id,
        projectName: created.name,
      },
    })

    return json(res, 200, {
      success: true,
      session: updated,
      sessionToken: sealOnboardingSession(updated),
      gitLinked: created.gitLinked,
      message: created.warning || 'Vercel 프로젝트 연결 완료',
      hint: created.warning,
    })
  } catch (error) {
    console.error('onboarding/vercel/project error:', error)
    const detail = error instanceof Error ? error.message : String(error)
    const hint = /github|gitRepository|repository/i.test(detail)
      ? ' Vercel 계정에 GitHub가 연결되어 있는지 확인하세요. (vercel.com → Settings → Login Connections / Install GitHub)'
      : ''
    return json(res, 500, {
      error: 'Vercel 프로젝트 생성에 실패했습니다.',
      detail: `${detail}${hint}`,
    })
  }
}
