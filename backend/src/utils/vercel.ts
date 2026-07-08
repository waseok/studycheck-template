const VERCEL_API = 'https://api.vercel.com'

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
