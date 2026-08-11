import { getGitHubRepo } from './github'
import { normalizeDatabaseUrl } from './dbBootstrap'

const VERCEL_API = 'https://api.vercel.com'
const DEFAULT_GITHUB_APP_INSTALL = 'https://github.com/apps/vercel/installations/new'

/** studycheck-template 기본 빌드 설정 (첫 배포·프로젝트 설정 공통) */
const STUDYCHECK_PROJECT_SETTINGS = {
  framework: null as string | null,
  // 병렬 install (scripts/vercel-install.mjs) — NODE_ENV=production omit 방지 포함
  installCommand: 'node scripts/vercel-install.mjs',
  buildCommand: 'npm run vercel-build',
  outputDirectory: 'frontend/dist',
  devCommand: null as string | null,
  nodeVersion: '20.x',
}

export type VercelGitSource = {
  type: 'github'
  repoId: number
  ref?: string
  org?: string
  repo?: string
}

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

/** API 원문 JSON을 사용자용 짧은 문장으로 */
function formatVercelApiError(text: string, fallback: string): string {
  const parsed = parseVercelErrorBody(text)
  const code = parsed.code || ''
  const msg = (parsed.message || '').trim()

  if (code === 'missing_project_settings') {
    return `${fallback}: 첫 배포에 빌드 설정(projectSettings)이 필요합니다.`
  }
  if (code === 'repo_not_found' || isGitAppError(parsed)) {
    return `${fallback}: Vercel GitHub 앱이 없거나 저장소 권한이 없습니다. GitHub에 Vercel 앱을 설치한 뒤 2단계를 다시 연결하세요.`
  }
  if (code === 'forbidden' || /forbidden|not authorized|unauthorized/i.test(msg)) {
    return `${fallback}: Vercel 토큰 권한이 부족합니다. Full Account 범위 토큰인지 확인하세요.`
  }
  if (code === 'rate_limited' || /rate limit/i.test(msg)) {
    return `${fallback}: Vercel API 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.`
  }
  if (msg) {
    // 긴 JSON 대신 핵심 메시지만
    return `${fallback}: ${msg.length > 220 ? `${msg.slice(0, 220)}…` : msg}`
  }
  const trimmed = text.trim()
  return `${fallback}: ${trimmed.length > 220 ? `${trimmed.slice(0, 220)}…` : trimmed || '알 수 없는 오류'}`
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

/** 프로젝트 조회 — 없으면 null */
export async function getVercelProject(
  token: string,
  idOrName: string,
  teamId?: string
): Promise<{ id: string; name: string; link?: { type?: string; repo?: string; org?: string } } | null> {
  const res = await vercelFetch(
    token,
    `/v9/projects/${encodeURIComponent(idOrName)}`,
    undefined,
    teamId
  )
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(formatVercelApiError(await res.text(), 'Vercel 프로젝트 조회 실패'))
  }
  return (await res.json()) as {
    id: string
    name: string
    link?: { type?: string; repo?: string; org?: string }
  }
}

/**
 * 4단계용: 세션의 projectId/이름이 Vercel에 실제로 있는지 확인하고,
 * 없으면 GitHub 저장소와 연결해 다시 만듭니다.
 */
export async function ensureVercelProjectForProvision(options: {
  token: string
  githubToken?: string
  projectId?: string
  projectName: string
  teamId?: string
  repoOwner?: string
  repoName?: string
}): Promise<{
  id: string
  name: string
  recreated: boolean
  gitLinked: boolean
  warning?: string
}> {
  const name = sanitizeVercelProjectName(options.projectName)

  if (options.projectId) {
    const byId = await getVercelProject(options.token, options.projectId, options.teamId)
    if (byId) {
      return {
        id: byId.id,
        name: byId.name || name,
        recreated: false,
        gitLinked: Boolean(byId.link?.type),
      }
    }
  }

  const byName = await getVercelProject(options.token, name, options.teamId)
  if (byName) {
    return {
      id: byName.id,
      name: byName.name || name,
      recreated: false,
      gitLinked: Boolean(byName.link?.type),
    }
  }

  if (!options.repoOwner || !options.repoName) {
    throw new Error(
      `Vercel 프로젝트(${name})를 찾을 수 없습니다. ` +
        '대시보드에 프로젝트가 없으면 온보딩 2단계에서 「Vercel 프로젝트 만들기」를 다시 실행하세요.'
    )
  }

  console.warn(`Vercel project missing (${options.projectId || name}) — recreating`)
  const created = await createVercelProject({
    token: options.token,
    githubToken: options.githubToken,
    projectName: name,
    repo: `${options.repoOwner}/${options.repoName}`,
    teamId: options.teamId,
  })

  return {
    id: created.id,
    name: created.name,
    recreated: true,
    gitLinked: created.gitLinked,
    warning: created.warning,
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
  return { ok: false, error: formatVercelApiError(await deployRes.text(), 'Git 배포 실패') }
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
    // 이름 충돌이면 기존 프로젝트를 재사용 (삭제하지 않음 — 대시보드에서 프로젝트가 사라지던 원인)
    if (conflict) {
      const existing = await getVercelProject(options.token, name, options.teamId)
      if (existing) {
        if (repoId) {
          const deployed = await tryDeployFromGit({
            token: options.token,
            projectId: existing.id,
            projectName: existing.name,
            owner: parsed.owner,
            repo: parsed.repo,
            repoId,
            defaultBranch,
            teamId: options.teamId,
          })
          if (deployed.ok) {
            return {
              id: existing.id,
              name: existing.name,
              gitLinked: true,
              deploymentUrl: deployed.url,
            }
          }
        }
        return {
          id: existing.id,
          name: existing.name,
          gitLinked: Boolean(existing.link?.type),
          warning: existing.link?.type
            ? undefined
            : `같은 이름의 프로젝트(${existing.name})가 이미 있어 재사용합니다. GitHub 연결이 필요하면 「GitHub 앱 설치 후 다시 연결」을 눌러주세요.`,
        }
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
  gitSource?: VercelGitSource
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

  if (!response.ok) {
    throw new Error(formatVercelApiError(await response.text(), 'Vercel 배포 시작 실패'))
  }
  return (await response.json()) as { url: string }
}

/** 프로젝트 빌드 설정을 템플릿 값으로 맞춤 (첫 배포 실패 예방) */
export async function ensureVercelProjectBuildSettings(
  token: string,
  projectId: string,
  teamId?: string
): Promise<void> {
  const patchRes = await vercelFetch(
    token,
    `/v9/projects/${projectId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        framework: STUDYCHECK_PROJECT_SETTINGS.framework,
        installCommand: STUDYCHECK_PROJECT_SETTINGS.installCommand,
        buildCommand: STUDYCHECK_PROJECT_SETTINGS.buildCommand,
        outputDirectory: STUDYCHECK_PROJECT_SETTINGS.outputDirectory,
        devCommand: STUDYCHECK_PROJECT_SETTINGS.devCommand,
        nodeVersion: STUDYCHECK_PROJECT_SETTINGS.nodeVersion,
        // 학교 사이트는 외부 공개 — Authentication 기본 보호 해제
        ssoProtection: null,
        passwordProtection: null,
      }),
    },
    teamId
  )
  if (!patchRes.ok) {
    // 설정 패치 실패해도 배포 payload의 projectSettings로 재시도할 수 있으므로 soft-fail
    console.warn(
      'Vercel project settings patch warning:',
      formatVercelApiError(await patchRes.text(), '프로젝트 설정 업데이트 실패')
    )
  }
}

/** Vercel 프로젝트에 연결된 Git 정보로 gitSource 구성 */
export async function resolveGitSourceFromVercelProject(
  token: string,
  projectId: string,
  teamId?: string
): Promise<VercelGitSource | undefined> {
  const res = await vercelFetch(token, `/v9/projects/${projectId}`, undefined, teamId)
  if (!res.ok) return undefined
  const project = (await res.json()) as {
    link?: {
      type?: string
      repoId?: number | string
      org?: string
      repo?: string
      productionBranch?: string
      gitCredentialId?: string
    }
  }
  const link = project.link
  if (!link || link.type !== 'github' || link.repoId == null) return undefined
  const repoId = typeof link.repoId === 'string' ? Number(link.repoId) : link.repoId
  if (!Number.isFinite(repoId)) return undefined
  return {
    type: 'github',
    repoId,
    ref: link.productionBranch || 'main',
    org: link.org,
    repo: link.repo,
  }
}

/** Vercel 프로젝트 환경변수 생성 또는 갱신 */
export async function upsertVercelEnv(
  token: string,
  projectId: string,
  key: string,
  value: string,
  teamId?: string
): Promise<void> {
  const resolvedValue = key === 'DATABASE_URL' ? normalizeDatabaseUrl(value) : value

  const listRes = await vercelFetch(token, `/v9/projects/${projectId}/env`, undefined, teamId)
  if (!listRes.ok) {
    throw new Error(formatVercelApiError(await listRes.text(), `환경변수 조회 실패(${key})`))
  }

  const listData = (await listRes.json()) as {
    envs?: Array<{ id: string; key: string; target?: string[] }>
  }
  // 같은 key가 production/preview 등으로 여러 개일 수 있어 전부 갱신
  const existingList = (listData.envs || []).filter((env) => env.key === key)
  const targets = ['production', 'preview', 'development']

  if (existingList.length > 0) {
    for (const existing of existingList) {
      const patchRes = await vercelFetch(
        token,
        `/v9/projects/${projectId}/env/${existing.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            value: resolvedValue,
            target: existing.target?.length ? existing.target : targets,
          }),
        },
        teamId
      )
      if (!patchRes.ok) {
        throw new Error(formatVercelApiError(await patchRes.text(), `환경변수 수정 실패(${key})`))
      }
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
        value: resolvedValue,
        type: 'encrypted',
        target: targets,
      }),
    },
    teamId
  )
  if (!createRes.ok) {
    throw new Error(formatVercelApiError(await createRes.text(), `환경변수 생성 실패(${key})`))
  }
}

/** 프로젝트 환경변수 삭제 (없으면 무시) */
export async function deleteVercelEnv(
  token: string,
  projectId: string,
  key: string,
  teamId?: string
): Promise<boolean> {
  const listRes = await vercelFetch(token, `/v9/projects/${projectId}/env`, undefined, teamId)
  if (!listRes.ok) return false
  const listData = (await listRes.json()) as { envs?: Array<{ id: string; key: string }> }
  const existing = listData.envs?.find((env) => env.key === key)
  if (!existing) return false

  const delRes = await vercelFetch(
    token,
    `/v9/projects/${projectId}/env/${existing.id}`,
    { method: 'DELETE' },
    teamId
  )
  if (!delRes.ok) {
    console.warn(
      `Vercel env delete warning(${key}):`,
      formatVercelApiError(await delRes.text(), '환경변수 삭제 실패')
    )
    return false
  }
  return true
}

/**
 * 최신 배포를 재배포하여 환경변수 적용.
 * - 배포가 없거나
 * - 최신 배포가 ERROR 이거나
 * - 재배포 API가 실패하면
 * false를 반환해 호출측에서 Git 기반 새 배포로 넘어가게 합니다.
 */
export async function redeployVercelProject(
  token: string,
  projectId: string,
  teamId?: string
): Promise<boolean> {
  const listRes = await vercelFetch(
    token,
    `/v6/deployments?projectId=${projectId}&limit=5`,
    undefined,
    teamId
  )
  if (!listRes.ok) {
    throw new Error(formatVercelApiError(await listRes.text(), 'Vercel 배포 목록 조회 실패'))
  }

  const listData = (await listRes.json()) as {
    deployments?: Array<{ uid: string; url?: string; state?: string; readyState?: string }>
  }
  const latest = listData.deployments?.[0]
  if (!latest?.uid) {
    return false
  }

  const state = (latest.readyState || latest.state || '').toUpperCase()
  // 이미 실패한 배포를 재배포하면 같은 실패/권한 오류가 반복되므로 Git 신규 배포로 넘김
  if (state === 'ERROR' || state === 'CANCELED') {
    console.warn(`Skip redeploy of ${state} deployment ${latest.uid}`)
    return false
  }

  const redeployRes = await vercelFetch(
    token,
    `/v13/deployments/${latest.uid}/redeploy`,
    { method: 'POST', body: JSON.stringify({}) },
    teamId
  )
  if (!redeployRes.ok) {
    // 재배포 실패는 soft-fail — Git 소스 배포로 폴백
    console.warn(
      'Vercel redeploy soft-fail:',
      formatVercelApiError(await redeployRes.text(), 'Vercel 재배포 실패')
    )
    return false
  }
  return true
}

/** 학교 사이트는 외부 공개용 — Vercel Authentication(SSO) 보호를 끕니다 */
export async function disableVercelDeploymentProtection(
  token: string,
  projectId: string,
  teamId?: string
): Promise<void> {
  const patchRes = await vercelFetch(
    token,
    `/v9/projects/${projectId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        // null 이면 Vercel Authentication 비활성화
        ssoProtection: null,
        passwordProtection: null,
      }),
    },
    teamId
  )
  if (!patchRes.ok) {
    console.warn(
      'Vercel deployment protection disable warning:',
      formatVercelApiError(await patchRes.text(), '배포 보호 해제 실패')
    )
  }
}

/** 사용자가 바로 열 수 있는 프로덕션 공개 URL */
export function getVercelProductionUrl(projectName: string): string {
  return `https://${sanitizeVercelProjectName(projectName)}.vercel.app`
}

/**
 * 환경변수 주입 후 재배포(또는 첫 배포)까지 한 번에 처리.
 *
 * @param skipExplicitDeploy GitHub push로 Vercel 자동 배포가 이미 걸린 경우 true.
 *   (파일 동기화 직후 다시 triggerDeploy 하면 배포가 2번 뜸)
 */
export async function applyVercelEnvAndEnsureDeploy(options: {
  token: string
  projectId: string
  projectName: string
  teamId?: string
  databaseUrl: string
  jwtSecret: string
  gitSource?: VercelGitSource
  /** true면 재배포를 건너뛰고 항상 Git 신규 배포 (빌드 스크립트 동기화 직후) */
  preferFreshGitDeploy?: boolean
  /** GitHub 커밋으로 webhook 배포가 예약된 경우 수동 배포 트리거 생략 */
  skipExplicitDeploy?: boolean
}): Promise<{
  deploymentUrl?: string
  mode: 'redeploy' | 'first_deploy' | 'git_webhook'
}> {
  const { token, projectId, projectName, teamId, databaseUrl, jwtSecret } = options
  const publicUrl = getVercelProductionUrl(projectName)

  await ensureVercelProjectBuildSettings(token, projectId, teamId)
  await disableVercelDeploymentProtection(token, projectId, teamId)

  await upsertVercelEnv(token, projectId, 'DATABASE_URL', databaseUrl, teamId)
  await upsertVercelEnv(token, projectId, 'JWT_SECRET', jwtSecret, teamId)
  // NODE_ENV=production 을 프로젝트 env로 두면 Install 단계에서 npm이
  // typescript(devDependency)를 건너뛰어 tsc: command not found 가 난다.
  // 런타임 NODE_ENV는 Vercel이 배포 시 알아서 설정하므로 여기서는 제거만 한다.
  await deleteVercelEnv(token, projectId, 'NODE_ENV', teamId)

  // Git push가 이미 Vercel 배포를 예약함 — 여기서 또 트리거하면 이중 배포
  if (options.skipExplicitDeploy) {
    return { mode: 'git_webhook', deploymentUrl: publicUrl }
  }

  // gitSource 확보 (세션 → Vercel project link)
  let gitSource = options.gitSource
  if (!gitSource) {
    gitSource = await resolveGitSourceFromVercelProject(token, projectId, teamId)
  }

  // 최신 Git 커밋이 있을 때는 신규 배포 우선 (실패했던 ERROR 배포 재시도 방지)
  if (gitSource && options.preferFreshGitDeploy !== false) {
    try {
      await triggerVercelDeployment({
        token,
        projectName,
        projectId,
        teamId,
        gitSource,
      })
      return { mode: 'first_deploy', deploymentUrl: publicUrl }
    } catch (error) {
      console.warn('Fresh git deploy failed, trying redeploy fallback:', error)
      const redeployed = await redeployVercelProject(token, projectId, teamId)
      if (redeployed) {
        return { mode: 'redeploy', deploymentUrl: publicUrl }
      }
      throw error instanceof Error
        ? error
        : new Error(`첫 배포를 시작하지 못했습니다. (${String(error)})`)
    }
  }

  const redeployed = await redeployVercelProject(token, projectId, teamId)
  if (redeployed) {
    return { mode: 'redeploy', deploymentUrl: publicUrl }
  }

  if (!gitSource) {
    throw new Error(
      '환경변수는 저장됐지만 배포를 시작하지 못했습니다. ' +
        'Vercel 프로젝트에 GitHub 저장소가 연결되어 있지 않습니다. ' +
        '2단계에서 「GitHub 앱 설치 후 다시 연결」을 완료한 뒤 다시 시도하세요.'
    )
  }

  await triggerVercelDeployment({
    token,
    projectName,
    projectId,
    teamId,
    gitSource,
  })

  return { mode: 'first_deploy', deploymentUrl: publicUrl }
}

/** @deprecated applyVercelEnvAndEnsureDeploy 사용 권장 */
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
  await deleteVercelEnv(token, projectId, 'NODE_ENV', teamId)
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
