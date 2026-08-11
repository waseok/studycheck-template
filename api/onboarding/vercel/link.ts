import { ensureVercelProjectGitLinked, sanitizeVercelProjectName } from '../../../backend/src/utils/vercel'
import { getGitHubUser, parseGitHubRepoRef } from '../../../backend/src/utils/github'
import {
  sealOnboardingSession,
  unsealOnboardingSession,
  updateOnboardingSession,
} from '../../../backend/src/utils/onboardingSession'
import { getBearerToken, json, readJsonBody } from '../../_lib/http'

function resolveRepoSlug(session: {
  github?: { owner?: string; repo?: string; repoUrl?: string }
  repoName?: string
}): { owner: string; repo: string } | null {
  if (session.github?.owner && session.github?.repo) {
    return { owner: session.github.owner, repo: session.github.repo }
  }
  if (session.github?.repoUrl) {
    return parseGitHubRepoRef(session.github.repoUrl)
  }
  return null
}

/**
 * Vercel GitHub 앱 설치 후 Git 재연결.
 * 미연결 프로젝트를 삭제하고 gitRepository 포함 재생성합니다.
 */
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

    let repoRef = resolveRepoSlug(session)
    if (!repoRef && session.tokens.githubToken && (session.github?.repo || session.repoName)) {
      const user = await getGitHubUser(session.tokens.githubToken)
      repoRef = {
        owner: user.login,
        repo: session.github?.repo || session.repoName || '',
      }
    }

    if (!repoRef?.owner || !repoRef.repo) {
      return json(res, 400, {
        error: 'GitHub 저장소 정보가 없습니다. 1단계를 다시 연결해주세요.',
      })
    }

    const repoSlug = `${repoRef.owner}/${repoRef.repo}`
    const projectName = sanitizeVercelProjectName(
      String(body.projectName || session.vercel?.projectName || session.repoName || repoRef.repo).trim()
    )
    const teamId = body.teamId?.trim() || session.vercel?.teamId || undefined

    const linked = await ensureVercelProjectGitLinked({
      token,
      githubToken: session.tokens.githubToken,
      projectName,
      projectId: session.vercel?.projectId,
      repo: repoSlug,
      teamId,
    })

    const updated = updateOnboardingSession(session, {
      status: 'VERCEL_CONNECTED',
      tokens: { vercelToken: token },
      github: {
        owner: repoRef.owner,
        repo: repoRef.repo,
        repoUrl: session.github?.repoUrl || `https://github.com/${repoSlug}`,
        visibility: session.github?.visibility,
      },
      vercel: {
        teamId,
        projectId: linked.id,
        projectName: linked.name,
        deploymentUrl: linked.deploymentUrl || session.vercel?.deploymentUrl,
        gitLinked: linked.gitLinked,
      },
    })

    return json(res, 200, {
      success: true,
      session: updated,
      sessionToken: sealOnboardingSession(updated),
      gitLinked: linked.gitLinked,
      needsGitHubApp: linked.needsGitHubApp || false,
      installUrl: linked.installUrl,
      message: linked.gitLinked
        ? `GitHub 저장소 연결 완료 (${repoSlug})`
        : linked.warning || '아직 GitHub 앱 설치가 완료되지 않은 것 같습니다. 설치 후 잠시 뒤 다시 시도됩니다.',
      hint: linked.warning,
    })
  } catch (error) {
    console.error('onboarding/vercel/link error:', error)
    const detail = error instanceof Error ? error.message : String(error)
    return json(res, 500, {
      error: 'GitHub 저장소 재연결에 실패했습니다.',
      detail,
    })
  }
}
