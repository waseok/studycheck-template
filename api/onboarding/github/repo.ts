import {
  createRepoFromTemplate,
  getGitHubRepo,
  getGitHubUser,
} from '../../../backend/src/utils/github'
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
    const githubToken = String(body.githubToken || session.tokens.githubToken || '').trim()
    const repoName = String(body.repoName || session.repoName || '').trim()
    const visibility = body.visibility === 'public' ? 'public' : 'private'
    const forceRecreate = Boolean(body.forceRecreate)

    if (!githubToken) {
      return json(res, 400, { error: 'GitHub 토큰을 입력해주세요.' })
    }

    // 이미 1단계가 끝난 세션이면 재생성하지 않고 그대로 반환
    if (!forceRecreate && session.github?.owner && session.github?.repo && session.github?.repoUrl) {
      const updated = updateOnboardingSession(session, {
        status: 'GITHUB_CONNECTED',
        tokens: { githubToken },
      })
      return json(res, 200, {
        success: true,
        session: updated,
        sessionToken: sealOnboardingSession(updated),
        reused: true,
        message: '이미 연결된 GitHub 저장소를 그대로 사용합니다.',
      })
    }

    if (!repoName) {
      return json(res, 400, { error: '저장소 이름을 입력해주세요.' })
    }

    const user = await getGitHubUser(githubToken)

    // 같은 이름이 이미 있으면 새로 만들지 않고 기존 저장소에 연결
    try {
      const existing = await getGitHubRepo(githubToken, user.login, repoName)
      const updated = updateOnboardingSession(session, {
        repoName: existing.repo,
        status: 'GITHUB_CONNECTED',
        tokens: { githubToken },
        github: {
          owner: existing.owner,
          repo: existing.repo,
          repoUrl: existing.repoUrl,
          visibility: existing.visibility,
        },
      })
      return json(res, 200, {
        success: true,
        session: updated,
        sessionToken: sealOnboardingSession(updated),
        reused: true,
        message: `이미 있는 저장소 ${existing.owner}/${existing.repo} 에 연결했습니다.`,
      })
    } catch {
      // 없으면 아래서 템플릿으로 생성
    }

    const repo = await createRepoFromTemplate({
      token: githubToken,
      templateOwner: TEMPLATE_OWNER,
      templateRepo: TEMPLATE_REPO,
      name: repoName,
      visibility,
      owner: user.login,
    })

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
      reused: false,
      message: `GitHub 저장소 ${repo.owner}/${repo.repo} 를 생성했습니다.`,
    })
  } catch (error) {
    console.error('onboarding/github/repo error:', error)
    const detail = error instanceof Error ? error.message : String(error)
    const hint = /403|not accessible by personal access token/i.test(detail)
      ? ' GitHub 토큰 권한 문제입니다. Tokens (classic) 으로 다시 만들고 repo 스코프를 모두 체크한 뒤(토큰이 ghp_ 로 시작하는지 확인) 다시 시도하세요. Fine-grained(github_pat_)는 템플릿 복제에서 자주 거부됩니다.'
      : /name already exists|already exists/i.test(detail)
        ? ' 같은 이름의 저장소가 이미 있습니다. 「기존 저장소 연결」을 사용하거나 다른 이름을 입력하세요.'
        : ''
    return json(res, 500, {
      error: 'GitHub 템플릿 저장소 생성에 실패했습니다.',
      detail: `${detail}${hint}`,
    })
  }
}
