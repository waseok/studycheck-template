import { getGitHubRepo } from './github'

const VERCEL_API = 'https://api.vercel.com'
const DEFAULT_GITHUB_APP_INSTALL = 'https://github.com/apps/vercel/installations/new'

/** studycheck-template 기본 빌드 설정 (첫 배포 시 projectSettings 필수) */
const STUDYCHECK_PROJECT_SETTINGS = {
  framework: null,
  installCommand: 'npm install && cd backend && npm install && cd ../frontend && npm install',
  buildCommand: 'npm run vercel-build',
  outputDirectory: 'frontend/dist',
  devCommand: null,
} as const

interface VercelTeam {
  id: string
  slug: string
  name: string
}

interface VercelUser {
  id: string
  username: string
  email: string
}

export type VercelProjectCreateResult = {
  id: string
  name: string
  gitLinked: boolean
  warning?: string
  needsGitHubApp?: boolean
  installUrl?: string
  deploymentUrl?: string
}

async function vercelFetch(
  token: string,
  apiPath: string,
  init?: RequestInit,
  teamId?: string
): Promise<Response> {
  const url = `${VERCEL_API}${apiPath}${teamId ? `${apiPath.includes('?') ? '&' : '?'}teamId=${teamId}` : ''}`
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
}

async function parseVercelJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${fallbackMessage}: ${text}`)
  }
  return response.json() as Promise<T>
}

function parseVercelErrorBody(text: string): {
  code?: string
  message?: string
  link?: string
  repo?: string
  action?: string
} {
  try {
    const parsed = JSON.parse(text) as { error?: Record<string, string> } & Record<string, string>
    const err = parsed.error || parsed
    return {
      code: err.code,
      message: err.message,
      link: err.link,
      repo: err.repo,
      action: err.action,
    }
  } catch {
    return { message: text }
  }
}

function isGitAppError(err: { code?: string; message?: string; action?: string }): boolean {
  const hay = `${err.code || ''} ${err.message || ''} ${err.action || ''}`
  return /repo_not_found|install the GitHub|GitHub integration|Install GitHub App|not found/i.test(hay)
}

function buildInstallUrl(owner: string, errorLink?: string): string {
  if (errorLink && /github\.com\/apps\/vercel/i.test(errorLink)) {
    // 에러에 온 링크가 /apps/vercel 만이면 installations/new 로 보정
    if (/\/apps\/vercel\/?$/i.test(errorLink)) {
      return `${errorLink.replace(/\/$/, '')}/installations/new`
    }
    return errorLink
  }
  // 조직/사용자 대상 설치 화면 (target_id 는 relink 시 owner 조회로 보강 가능)
  if (owner) {
    return `${DEFAULT_GITHUB_APP_INSTALL}?suggested_target_id=0&owner=${encodeURIComponent(owner)}`
  }
  return DEFAULT_GITHUB_APP_INSTALL
}

async function resolveOwnerInstallUrl(owner: string, githubToken?: string, errorLink?: string): Promise<string> {
  if (githubToken && owner) {
    try {
      const res = await fetch(`https://api.github.com/users/${owner}`, {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'studycheck-template-onboarding',
        },
      })
      if (res.ok) {
        const user = (await res.json()) as { id: number }
        return `https://github.com/apps/vercel/installations/new/permissions?target_id=${user.id}`
      }
    } catch {
      // fallback
    }
  }
  return buildInstallUrl(owner, errorLink)
}

/** Vercel 프로젝트명 규칙: 소문자/숫자/하이픈만 */
export function sanitizeVercelProjectName(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return (normalized || 'studycheck-app').slice(0, 100)
}

export async function getVercelUser(token: string): Promise<VercelUser> {
  const response = await vercelFetch(token, '/v2/user')
  const payload = await parseVercelJson<{ user?: VercelUser } & VercelUser>(
    response,
    'Vercel 사용자 조회 실패'
  )
  // /v2/user 는 { user: {...} } 형태인 경우가 많음
  return payload.user || payload
}

export async function listVercelTeams(token: string): Promise<VercelTeam[]> {
  const response = await vercelFetch(token, '/v2/teams')
  const result = await parseVercelJson<{ teams?: VercelTeam[] }>(response, 'Vercel 팀 목록 조회 실패')
  return result.teams || []
}

function parseRepoSlug(options: {
  repo: string
  owner?: string
  repoName?: string
}): { owner: string; repo: string } {
  const parsed = options.repo.includes('/')
    ? {
        owner: options.repo.split('/')[0],
        repo: options.repo.split('/').slice(1).join('/'),
      }
    : {
        owner: options.owner || '',
        repo: options.repoName || options.repo,
      }
  if (!parsed.owner || !parsed.repo) {
    throw new Error('GitHub owner/repo 정보가 올바르지 않습니다.')
  }
  return parsed
}

export async function deleteVercelProject(
  token: string,
  idOrName: string,
  teamId?: string
): Promise<void> {
  const response = await vercelFetch(
    token,
    `/v9/projects/${encodeURIComponent(idOrName)}`,
    { method: 'DELETE' },
    teamId
  )
  // 이미 없어도 재연결 흐름에서는 무시
  if (!response.ok && response.status !== 404) {
    const text = await response.text()
    throw new Error(`Vercel 프로젝트 삭제 실패: ${text}`)
  }
}

async function tryCreateWithGit(options: {
  token: string
  name: string
  slug: string
  repoId?: number
  teamId?: string
}): Promise<{ ok: true; id: string; name: string } | { ok: false; errors: string[]; installLink?: string }> {
  const gitAttempts: Array<Record<string, unknown>> = [
    { type: 'github', repo: options.slug, sourceless: true },
    { type: 'github', repo: options.slug },
  ]
  if (options.repoId) {
    gitAttempts.unshift({
      type: 'github',
      repo: options.slug,
      repoId: options.repoId,
      sourceless: true,
    })
  }

  const errors: string[] = []
  let installLink: string | undefined

  for (const gitRepository of gitAttempts) {
    const response = await vercelFetch(
      options.token,
      '/v11/projects',
      {
        method: 'POST',
        body: JSON.stringify({ name: options.name, gitRepository }),
      },
      options.teamId
    )
    if (response.ok) {
      const created = (await response.json()) as { id: string; name: string }
      return { ok: true, id: created.id, name: created.name }
    }
    const text = await response.text()
    errors.push(text)
    const parsed = parseVercelErrorBody(text)
    if (parsed.link) installLink = parsed.link
    // 이름 충돌이면 더 이상 git create 시도해도 동일 — 상위에서 삭제 후 재시도
    if (parsed.code === 'conflict' || /already exists/i.test(parsed.message || text)) {
      break
    }
  }

  return { ok: false, errors, installLink }
}

async function tryDeployFromGit(options: {
  token: string
  projectId: string
  projectName: string
  owner: string
  repo: string
  repoId: number
  defaultBranch: string
  teamId?: string
}): Promise<{ ok: true; url?: string } | { ok: false; error: string }> {
  // 신규 프로젝트는 projectSettings 또는 skipAutoDetectionConfirmation 필요
  const deployRes = await vercelFetch(
    options.token,
    '/v13/deployments?skipAutoDetectionConfirmation=1',
    {
      method: 'POST',
      body: JSON.stringify({
        name: options.projectName,
        project: options.projectId,
        target: 'production',
        gitSource: {
          type: 'github',
          repoId: options.repoId,
          ref: options.defaultBranch,
          org: options.owner,
          repo: options.repo,
        },
        projectSettings: STUDYCHECK_PROJECT_SETTINGS,
      }),
    },
    options.teamId
  )

  if (deployRes.ok) {
    const deployment = (await deployRes.json()) as { url?: string }
    return {
      ok: true,
      url: deployment.url ? `https://${deployment.url}` : undefined,
    }
  }
  return { ok: false, error: await deployRes.text() }
}

async function getOrCreateBareProject(options: {
  token: string
  name: string
  teamId?: string
}): Promise<{ id: string; name: string }> {
  const createRes = await vercelFetch(
    options.token,
    '/v11/projects',
    {
      method: 'POST',
      body: JSON.stringify({ name: options.name }),
    },
    options.teamId
  )

  if (createRes.ok) {
    return (await createRes.json()) as { id: string; name: string }
  }

  const text = await createRes.text()
  const err = parseVercelErrorBody(text)
  if (err.code === 'conflict' || /already exists/i.test(err.message || text)) {
    const getRes = await vercelFetch(
      options.token,
      `/v9/projects/${encodeURIComponent(options.name)}`,
      undefined,
      options.teamId
    )
    if (getRes.ok) {
      return (await getRes.json()) as { id: string; name: string }
    }
  }

  throw new Error(`Vercel 프로젝트 생성 실패: ${text}`)
}

/**
 * 앱 설치 후 재연결: Git 미연결 프로젝트를 삭제하고 GitRepository 포함해 재생성합니다.
 */
export async function ensureVercelProjectGitLinked(options: {
  token: string
  githubToken?: string
  projectName: string
  projectId?: string
  repo: string
  owner?: string
  repoName?: string
  teamId?: string
}): Promise<VercelProjectCreateResult> {
  const name = sanitizeVercelProjectName(options.projectName)
  const parsed = parseRepoSlug(options)
  const slug = `${parsed.owner}/${parsed.repo}`

  let repoId: number | undefined
  let defaultBranch = 'main'
  if (options.githubToken) {
    try {
      const gh = await getGitHubRepo(options.githubToken, parsed.owner, parsed.repo)
      repoId = gh.id
      defaultBranch = gh.defaultBranch || 'main'
    } catch {
      // 계속 진행
    }
  }

  // 1) 기존 프로젝트에 gitSource 배포로 연결 시도
  if (options.projectId && repoId) {
    const deployed = await tryDeployFromGit({
      token: options.token,
      projectId: options.projectId,
      projectName: name,
      owner: parsed.owner,
      repo: parsed.repo,
      repoId,
      defaultBranch,
      teamId: options.teamId,
    })
    if (deployed.ok) {
      return {
        id: options.projectId,
        name,
        gitLinked: true,
        deploymentUrl: deployed.url,
      }
    }
  }

  // 2) 미연결 프로젝트 삭제 후 Git 포함 재생성
  if (options.projectId) {
    try {
      await deleteVercelProject(options.token, options.projectId, options.teamId)
    } catch {
      try {
        await deleteVercelProject(options.token, name, options.teamId)
      } catch {
        // 이름 충돌이면 create 시 다시 처리
      }
    }
  } else {
    try {
      await deleteVercelProject(options.token, name, options.teamId)
    } catch {
      // ignore
    }
  }

  return createVercelProject({
    token: options.token,
    githubToken: options.githubToken,
    projectName: name,
    repo: slug,
    repoId,
    teamId: options.teamId,
  })
}

export async function createVercelProject(options: {
  token: string
  githubToken?: string
  projectName: string
  /** owner/repo 또는 분리된 owner+repo */
  repo: string
  owner?: string
  repoName?: string
  repoId?: number
  teamId?: string
}): Promise<VercelProjectCreateResult> {
  const name = sanitizeVercelProjectName(options.projectName)
  const parsed = parseRepoSlug(options)
  const slug = `${parsed.owner}/${parsed.repo}`

  let repoId = options.repoId
  let defaultBranch = 'main'
  if (options.githubToken) {
    try {
      const gh = await getGitHubRepo(options.githubToken, parsed.owner, parsed.repo)
      repoId = gh.id || repoId
      defaultBranch = gh.defaultBranch || defaultBranch
    } catch {
      // GitHub 조회 실패해도 Vercel 쪽 시도는 계속
    }
  }

  // 이름 충돌(이전 빈 프로젝트) 제거 후 Git 연결 생성
  let withGit = await tryCreateWithGit({
    token: options.token,
    name,
    slug,
    repoId,
    teamId: options.teamId,
  })

  if (!withGit.ok) {
    const conflict = withGit.errors.some((e) => {
      const p = parseVercelErrorBody(e)
      return p.code === 'conflict' || /already exists/i.test(p.message || e)
    })
    if (conflict) {
      try {
        await deleteVercelProject(options.token, name, options.teamId)
        withGit = await tryCreateWithGit({
          token: options.token,
          name,
          slug,
          repoId,
          teamId: options.teamId,
        })
      } catch {
        // 삭제 실패 시 아래 bare create 경로
      }
    }
  }

  if (withGit.ok) {
    return { id: withGit.id, name: withGit.name, gitLinked: true }
  }

  const created = await getOrCreateBareProject({
    token: options.token,
    name,
    teamId: options.teamId,
  })

  // 빈 프로젝트에 Git 소스로 배포 시도 (repoId 기반)
  if (repoId) {
    const deployed = await tryDeployFromGit({
      token: options.token,
      projectId: created.id,
      projectName: created.name,
      owner: parsed.owner,
      repo: parsed.repo,
      repoId,
      defaultBranch,
      teamId: options.teamId,
    })
    if (deployed.ok) {
      return {
        id: created.id,
        name: created.name,
        gitLinked: true,
        deploymentUrl: deployed.url,
      }
    }
    withGit.errors.push(`deploy:${deployed.error}`)
  }

  const firstParsed = withGit.errors.map(parseVercelErrorBody)
  const errorLink = withGit.installLink || firstParsed.find((e) => e.link)?.link
  const installUrl = await resolveOwnerInstallUrl(parsed.owner, options.githubToken, errorLink)

  return {
    id: created.id,
    name: created.name,
    gitLinked: false,
    needsGitHubApp: true,
    installUrl,
    warning:
      `프로젝트(${created.name})는 생성됐지만 GitHub(${slug}) 자동 연결에 실패했습니다. ` +
      'Vercel GitHub 앱 설치 창이 열리면 해당 계정/조직에 설치한 뒤, 연결이 자동으로 다시 시도됩니다.',
  }
}

export async function triggerVercelDeployment(options: {
  token: string
  projectName: string
  projectId?: string
  teamId?: string
  /** 첫 배포에 필요. 없으면 프로젝트에 연결된 Git으로 배포 시도 */
  gitSource?: {
    type: 'github'
    repoId: number
    ref?: string
    org?: string
    repo?: string
  }
}): Promise<{ url: string }> {
  const body: Record<string, unknown> = {
    name: options.projectName,
    target: 'production',
    // 새 프로젝트/미확인 프레임워크는 이 설정이 없으면 missing_project_settings 로 실패함
    projectSettings: STUDYCHECK_PROJECT_SETTINGS,
  }
  if (options.projectId) {
    body.project = options.projectId
  }
  if (options.gitSource) {
    body.gitSource = {
      type: options.gitSource.type,
      repoId: options.gitSource.repoId,
      ref: options.gitSource.ref || 'main',
      ...(options.gitSource.org ? { org: options.gitSource.org } : {}),
      ...(options.gitSource.repo ? { repo: options.gitSource.repo } : {}),
    }
  }

  const response = await vercelFetch(
    options.token,
    '/v13/deployments?skipAutoDetectionConfirmation=1',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    options.teamId
  )

  const result = await parseVercelJson<{ url: string }>(response, 'Vercel 배포 시작 실패')
  return result
}

/** Vercel 프로젝트 환경변수 생성 또는 갱신 */
export async function upsertVercelEnv(
  token: string,
  projectId: string,
  key: string,
  value: string,
  teamId?: string
): Promise<void> {
  const listRes = await vercelFetch(token, `/v9/projects/${projectId}/env`, undefined, teamId)
  if (!listRes.ok) {
    const err = await listRes.text()
    throw new Error(`Vercel 환경변수 조회 실패: ${err}`)
  }

  const listData = (await listRes.json()) as { envs?: Array<{ id: string; key: string }> }
  const existing = listData.envs?.find((env) => env.key === key)
  const targets = ['production', 'preview', 'development']

  if (existing) {
    const patchRes = await vercelFetch(
      token,
      `/v9/projects/${projectId}/env/${existing.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ value, target: targets }),
      },
      teamId
    )
    if (!patchRes.ok) {
      throw new Error(`Vercel 환경변수(${key}) 수정 실패`)
    }
    return
  }

  const createRes = await vercelFetch(
    token,
    `/v10/projects/${projectId}/env`,
    {
      method: 'POST',
      body: JSON.stringify({
        key,
        value,
        type: 'encrypted',
        target: targets,
      }),
    },
    teamId
  )
  if (!createRes.ok) {
    const err = await createRes.text()
    throw new Error(`Vercel 환경변수(${key}) 생성 실패: ${err}`)
  }
}

/**
 * 최신 배포를 재배포하여 환경변수 적용.
 * 아직 배포가 한 번도 없으면 false를 반환합니다(에러 아님 — 이후 첫 배포 트리거용).
 */
export async function redeployVercelProject(
  token: string,
  projectId: string,
  teamId?: string
): Promise<boolean> {
  const listRes = await vercelFetch(
    token,
    `/v6/deployments?projectId=${projectId}&limit=1`,
    undefined,
    teamId
  )
  if (!listRes.ok) {
    throw new Error('Vercel 배포 목록 조회 실패')
  }

  const listData = (await listRes.json()) as { deployments?: Array<{ uid: string }> }
  const deploymentId = listData.deployments?.[0]?.uid
  if (!deploymentId) {
    // 신규 프로젝트는 배포 이력이 없음 → 재배포 대신 첫 배포가 필요
    return false
  }

  const redeployRes = await vercelFetch(
    token,
    `/v13/deployments/${deploymentId}/redeploy`,
    { method: 'POST', body: JSON.stringify({}) },
    teamId
  )
  if (!redeployRes.ok) {
    const err = await redeployRes.text()
    throw new Error(`Vercel 재배포 실패: ${err}`)
  }
  return true
}

/** DATABASE_URL, JWT_SECRET을 Vercel에 등록 후 가능하면 재배포 */
export async function applyVercelEnvAndRedeploy(options: {
  token: string
  projectId: string
  teamId?: string
  databaseUrl: string
  jwtSecret: string
}): Promise<{ redeployed: boolean }> {
  const { token, projectId, teamId, databaseUrl, jwtSecret } = options
  await upsertVercelEnv(token, projectId, 'DATABASE_URL', databaseUrl, teamId)
  await upsertVercelEnv(token, projectId, 'JWT_SECRET', jwtSecret, teamId)
  await upsertVercelEnv(token, projectId, 'NODE_ENV', 'production', teamId)
  const redeployed = await redeployVercelProject(token, projectId, teamId)
  return { redeployed }
}

export function getRuntimeVercelProjectId(): string | undefined {
  return process.env.VERCEL_PROJECT_ID
}

export function getRuntimeVercelTeamId(): string | undefined {
  return process.env.VERCEL_TEAM_ID
}

export function getRuntimeVercelUrl(): string | undefined {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return undefined
}

export function getVercelOAuthConfig() {
  return {
    clientId: process.env.VERCEL_CLIENT_ID || '',
    authorizeUrl: 'https://vercel.com/oauth/authorize',
    configured: Boolean(process.env.VERCEL_CLIENT_ID),
  }
}
