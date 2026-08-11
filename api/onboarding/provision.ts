import {
  applyVercelEnvAndRedeploy,
  triggerVercelDeployment,
} from '../../../backend/src/utils/vercel'
import {
  ensureDefaultSettings,
  pushDatabaseSchema,
} from '../../../backend/src/utils/dbBootstrap'
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

    if (!session.vercel?.projectId || !session.vercel.projectName || !session.tokens.vercelToken) {
      return json(res, 400, { error: 'Vercel 프로젝트가 연결되지 않았습니다.' })
    }
    if (!session.supabase?.databaseUrl) {
      return json(res, 400, { error: 'Supabase DATABASE_URL이 연결되지 않았습니다.' })
    }

    const body = await readJsonBody(req)
    const jwtSecret = String(body.jwtSecret || '').trim()
    if (!jwtSecret || jwtSecret.length < 16) {
      return json(res, 400, { error: 'JWT_SECRET은 16자 이상이어야 합니다.' })
    }

    await pushDatabaseSchema(session.supabase.databaseUrl)
    await ensureDefaultSettings(
      session.supabase.databaseUrl,
      session.supabase.projectUrl || undefined
    )
    await applyVercelEnvAndRedeploy({
      token: session.tokens.vercelToken,
      projectId: session.vercel.projectId,
      teamId: session.vercel.teamId,
      databaseUrl: session.supabase.databaseUrl,
      jwtSecret,
    })

    let deploymentUrl = session.vercel.deploymentUrl
    try {
      const deployment = await triggerVercelDeployment({
        token: session.tokens.vercelToken,
        projectName: session.vercel.projectName,
        teamId: session.vercel.teamId,
      })
      deploymentUrl = `https://${deployment.url}`
    } catch (error) {
      console.warn('Vercel deploy trigger warning:', error)
      deploymentUrl = deploymentUrl || `https://${session.vercel.projectName}.vercel.app`
    }

    const updated = updateOnboardingSession(session, {
      status: 'READY_FOR_SETUP',
      vercel: {
        ...session.vercel,
        deploymentUrl,
      },
    })

    return json(res, 200, {
      success: true,
      session: updated,
      sessionToken: sealOnboardingSession(updated),
      deploymentUrl,
      message: 'Vercel 환경변수 주입과 재배포를 시작했습니다. 잠시 후 학교 정보 설정으로 이동하세요.',
    })
  } catch (error) {
    console.error('onboarding/provision error:', error)
    return json(res, 500, {
      error: '인프라 프로비저닝에 실패했습니다.',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
