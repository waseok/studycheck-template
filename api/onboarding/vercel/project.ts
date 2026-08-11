import { createVercelProject, sanitizeVercelProjectName } from '../../../backend/src/utils/vercel'
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
  tokens?: { githubToken?: string }
}): { owner: string; repo: string } | null {
  if (session.github?.owner && session.github?.repo) {
    return { owner: session.github.owner, repo: session.github.repo }
  }
  if (session.github?.repoUrl) {
    const parsed = parseGitHubRepoRef(session.github.repoUrl)
    if (parsed) return parsed
  }
  if (session.github?.repo?.includes('/')) {
    const parsed = parseGitHubRepoRef(session.github.repo)
    if (parsed) return parsed
  }
  return null
}

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

    // owner가 비어 있으면 GitHub 토큰으로 보정
    if (!repoRef && session.tokens.githubToken && (session.github?.repo || session.repoName)) {
      const user = await getGitHubUser(session.tokens.githubToken)
      repoRef = {
        owner: user.login,
        repo: session.github?.repo || session.repoName || '',
      }
    }

    if (!repoRef?.owner || !repoRef.repo) {
      return json(res, 400, {
        error: 'GitHub 저장소 정보(owner/repo)가 없습니다. 1단계를 다시 연결해주세요.',
      })
    }

    const repoSlug = `${repoRef.owner}/${repoRef.repo}`
    const projectName = sanitizeVercelProjectName(
      String(body.projectName || session.repoName || repoRef.repo).trim()
    )

    const created = await createVercelProject({
      token,
      teamId: body.teamId?.trim() || undefined,
      projectName,
      repo: repoSlug,
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
      message: created.warning || `Vercel 프로젝트 연결 완료 (${repoSlug})`,
      hint: created.warning,
    })
  } catch (error) {
    console.error('onboarding/vercel/project error:', error)
    const detail = error instanceof Error ? error.message : String(error)
    const hint = /github|gitRepository|repository|repo_not_found/i.test(detail)
      ? ' Vercel 계정에 GitHub가 연결되어 있는지, 그리고 저장소가 owner/repo 형식인지 확인하세요. (예: username/my-school-studycheck)'
      : ''
    return json(res, 500, {
      error: 'Vercel 프로젝트 생성에 실패했습니다.',
      detail: `${detail}${hint}`,
    })
  }
}
