const VERCEL_API = 'https://api.vercel.com'

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

export async function getVercelUser(token: string): Promise<VercelUser> {
  const response = await vercelFetch(token, '/v2/user')
  return parseVercelJson<VercelUser>(response, 'Vercel 사용자 조회 실패')
}

export async function listVercelTeams(token: string): Promise<VercelTeam[]> {
  const response = await vercelFetch(token, '/v2/teams')
  const result = await parseVercelJson<{ teams?: VercelTeam[] }>(response, 'Vercel 팀 목록 조회 실패')
  return result.teams || []
}

export async function createVercelProject(options: {
  token: string
  projectName: string
  repo: string
  repoId?: number
  teamId?: string
}): Promise<{ id: string; name: string }> {
  const response = await vercelFetch(
    options.token,
    '/v10/projects',
    {
      method: 'POST',
      body: JSON.stringify({
        name: options.projectName,
        framework: null,
        gitRepository: {
          type: 'github',
          repo: options.repo,
          repoId: options.repoId,
        },
      }),
    },
    options.teamId
  )

  return parseVercelJson<{ id: string; name: string }>(response, 'Vercel 프로젝트 생성 실패')
}

export async function triggerVercelDeployment(options: {
  token: string
  projectName: string
  teamId?: string
}): Promise<{ url: string }> {
  const response = await vercelFetch(
    options.token,
    '/v13/deployments',
    {
      method: 'POST',
      body: JSON.stringify({
        name: options.projectName,
        target: 'production',
      }),
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

/** 최신 배포를 재배포하여 환경변수 적용 */
export async function redeployVercelProject(
  token: string,
  projectId: string,
  teamId?: string
): Promise<void> {
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
    throw new Error('재배포할 Vercel 배포를 찾을 수 없습니다.')
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
}

/** DATABASE_URL, JWT_SECRET을 Vercel에 등록 후 재배포 */
export async function applyVercelEnvAndRedeploy(options: {
  token: string
  projectId: string
  teamId?: string
  databaseUrl: string
  jwtSecret: string
}): Promise<void> {
  const { token, projectId, teamId, databaseUrl, jwtSecret } = options
  await upsertVercelEnv(token, projectId, 'DATABASE_URL', databaseUrl, teamId)
  await upsertVercelEnv(token, projectId, 'JWT_SECRET', jwtSecret, teamId)
  await upsertVercelEnv(token, projectId, 'NODE_ENV', 'production', teamId)
  await redeployVercelProject(token, projectId, teamId)
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
