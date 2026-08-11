import { getGitHubRepo, getGitHubUser, parseGitHubRepoRef } from '../../../backend/src/utils/github'
import {
  sealOnboardingSession,
  unsealOnboardingSession,
  updateOnboardingSession,
} from '../../../backend/src/utils/onboardingSession'
import { getBearerToken, json, readJsonBody } from '../../_lib/http'

/** 이미 만든 GitHub 저장소 URL/슬러그를 세션에 연결 */
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
    const githubToken = String(body.githubToken || session.tokens.githubToken || '').trim()
    const repoInput = String(body.repoUrl || body.repo || '').trim()

    if (!githubToken) {
      return json(res, 400, { error: 'GitHub 토큰을 입력해주세요.' })
    }
    if (!repoInput) {
      return json(res, 400, { error: 'GitHub 저장소 URL 또는 owner/repo 를 입력해주세요.' })
    }

    let parsed = parseGitHubRepoRef(repoInput)
    if (!parsed) {
      // 이름만 온 경우 토큰 소유자 기준으로 조회
      const user = await getGitHubUser(githubToken)
      parsed = { owner: user.login, repo: repoInput.replace(/\.git$/i, '') }
    }

    const repo = await getGitHubRepo(githubToken, parsed.owner, parsed.repo)
    const updated = updateOnboardingSession(session, {
      repoName: repo.repo,
      status: 'GITHUB_CONNECTED',
      tokens: { githubToken },
      github: {
        owner: repo.owner,
        repo: repo.repo,
        repoUrl: repo.repoUrl,
        visibility: repo.visibility,
      },
    })

    return json(res, 200, {
      success: true,
      session: updated,
      sessionToken: sealOnboardingSession(updated),
      message: `기존 저장소 ${repo.owner}/${repo.repo} 에 연결했습니다.`,
    })
  } catch (error) {
    console.error('onboarding/github/connect error:', error)
    return json(res, 500, {
      error: '기존 GitHub 저장소 연결에 실패했습니다.',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}
