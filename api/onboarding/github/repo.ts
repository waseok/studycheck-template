import { createRepoFromTemplate, getGitHubUser } from '../../../backend/src/utils/github'
import {
  sealOnboardingSession,
  unsealOnboardingSession,
  updateOnboardingSession,
} from '../../../backend/src/utils/onboardingSession'
import { getBearerToken, json, readJsonBody } from '../../_lib/http'

const TEMPLATE_OWNER = 'waseok'
const TEMPLATE_REPO = 'studycheck-template'

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
    const githubToken = String(body.githubToken || '').trim()
    const repoName = String(body.repoName || session.repoName || '').trim()
    const visibility = body.visibility === 'public' ? 'public' : 'private'

    if (!githubToken) {
      return json(res, 400, { error: 'GitHub 토큰을 입력해주세요.' })
    }
    if (!repoName) {
      return json(res, 400, { error: '저장소 이름을 입력해주세요.' })
    }

    const user = await getGitHubUser(githubToken)
    const repo = await createRepoFromTemplate({
      token: githubToken,
      templateOwner: TEMPLATE_OWNER,
      templateRepo: TEMPLATE_REPO,
      name: repoName,
      visibility,
      owner: user.login,
    })

    const updated = updateOnboardingSession(session, {
      repoName,
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
    })
  } catch (error) {
    console.error('onboarding/github/repo error:', error)
    const detail = error instanceof Error ? error.message : String(error)
    const hint = /403|not accessible by personal access token/i.test(detail)
      ? ' GitHub 토큰 권한 문제입니다. Tokens (classic) 으로 다시 만들고 repo 스코프를 모두 체크한 뒤(토큰이 ghp_ 로 시작하는지 확인) 다시 시도하세요. Fine-grained(github_pat_)는 템플릿 복제에서 자주 거부됩니다.'
      : ''
    return json(res, 500, {
      error: 'GitHub 템플릿 저장소 생성에 실패했습니다.',
      detail: `${detail}${hint}`,
    })
  }
}
