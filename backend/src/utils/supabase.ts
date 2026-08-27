import { normalizeDatabaseUrl, testDatabaseConnection } from './dbBootstrap'

interface SupabaseProject {
  id: string
  organization_id: string
  name: string
  region: string
  status: string
}

interface SupabasePoolerConfig {
  pool_mode?: string
  database_type?: string
  connection_string?: string
  connectionString?: string
  db_port?: number
}

interface SupabaseOrganization {
  id: string
  name: string
}

const SUPABASE_API = 'https://api.supabase.com/v1'

async function supabaseFetch<T>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${SUPABASE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: token,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Supabase API error (${response.status}): ${text}`)
  }

  return response.json() as Promise<T>
}

export async function listSupabaseOrganizations(token: string): Promise<SupabaseOrganization[]> {
  return supabaseFetch<SupabaseOrganization[]>(token, '/organizations')
}

export async function listSupabaseProjects(token: string): Promise<SupabaseProject[]> {
  return supabaseFetch<SupabaseProject[]>(token, '/projects')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function getSupabaseProject(token: string, projectRef: string): Promise<SupabaseProject> {
  return supabaseFetch<SupabaseProject>(token, `/projects/${projectRef}`)
}

export async function getSupabasePoolerConfig(
  token: string,
  projectRef: string
): Promise<SupabasePoolerConfig[]> {
  return supabaseFetch<SupabasePoolerConfig[]>(token, `/projects/${projectRef}/config/database/pooler`)
}

/** Supabase Connect 화면 URI의 [YOUR-PASSWORD] 자리에 생성 시 입력한 DB 비밀번호를 넣습니다. */
export function injectPasswordIntoConnectionString(raw: string, password: string): string {
  const trimmed = raw.trim()
  if (/\[YOUR-PASSWORD\]/i.test(trimmed)) {
    return trimmed.replace(/\[YOUR-PASSWORD\]/gi, encodeURIComponent(password))
  }

  const match = trimmed.match(/^(postgresql?:\/\/)([^:@/]+)(?::[^@/]*)?@(.+)$/i)
  if (!match) return trimmed

  const [, protocol, user, rest] = match
  return `${protocol}${user}:${encodeURIComponent(password)}@${rest}`
}

export function pickTransactionPoolerDatabaseUrl(
  configs: SupabasePoolerConfig[],
  dbPassword: string
): string | undefined {
  const primary = configs.filter(
    (item) => String(item.database_type || '').toUpperCase() === 'PRIMARY'
  )
  const transaction =
    primary.find((item) => item.pool_mode === 'transaction') ||
    primary.find((item) => item.db_port === 6543) ||
    primary[0]

  const raw = transaction?.connection_string || transaction?.connectionString
  if (!raw) return undefined

  return injectPasswordIntoConnectionString(raw, dbPassword)
}

function isSupabaseProjectReady(status: string | undefined): boolean {
  const normalized = String(status || '').toUpperCase()
  return normalized === 'ACTIVE_HEALTHY' || normalized === 'ACTIVE'
}

/**
 * 새로 만든 Supabase 프로젝트의 pooler가 뜰 때까지 기다린 뒤 DATABASE_URL을 확정합니다.
 * (기존 프로젝트 연결 흐름은 건드리지 않습니다.)
 */
export async function resolveNewSupabaseProjectDatabaseUrl(options: {
  token: string
  projectRef: string
  dbPassword: string
  maxWaitMs?: number
}): Promise<string> {
  const deadline = Date.now() + (options.maxWaitMs ?? 120_000)
  let lastError = 'pooler 준비 대기 중'

  while (Date.now() < deadline) {
    try {
      const project = await getSupabaseProject(options.token, options.projectRef)
      if (!isSupabaseProjectReady(project.status)) {
        lastError = `프로젝트 상태: ${project.status || '준비 중'}`
        await sleep(5_000)
        continue
      }

      const poolers = await getSupabasePoolerConfig(options.token, options.projectRef)
      const rawUrl = pickTransactionPoolerDatabaseUrl(poolers, options.dbPassword)
      if (!rawUrl) {
        lastError = 'Transaction pooler URI를 아직 받지 못했습니다.'
        await sleep(5_000)
        continue
      }

      const databaseUrl = normalizeDatabaseUrl(rawUrl)
      await testDatabaseConnection(databaseUrl)
      return databaseUrl
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      await sleep(5_000)
    }
  }

  throw new Error(
    `새 Supabase DB가 아직 준비되지 않았습니다. 2~3분 뒤 「DB 자동 연결」을 다시 시도해주세요. (${lastError})`
  )
}

export async function connectCreatedSupabaseProject(options: {
  token: string
  projectRef: string
  dbPassword: string
  maxWaitMs?: number
}): Promise<{ databaseUrl: string; autoConnected: true } | { autoConnected: false; needsAutoConnect: true; hint: string }> {
  try {
    const databaseUrl = await resolveNewSupabaseProjectDatabaseUrl({
      token: options.token,
      projectRef: options.projectRef,
      dbPassword: options.dbPassword,
      maxWaitMs: options.maxWaitMs ?? 45_000,
    })
    return { databaseUrl, autoConnected: true }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      autoConnected: false,
      needsAutoConnect: true,
      hint:
        `Supabase 프로젝트는 생성됐지만 DB pooler 준비가 아직 끝나지 않았습니다. ` +
        `1~3분 뒤 「DB 자동 연결」을 눌러주세요. (${detail})`,
    }
  }
}

export async function createSupabaseProject(options: {
  token: string
  organizationId: string
  name: string
  region: string
  dbPassword: string
}): Promise<SupabaseProject> {
  return supabaseFetch<SupabaseProject>(options.token, '/projects', {
    method: 'POST',
    body: JSON.stringify({
      organization_id: options.organizationId,
      name: options.name,
      region: options.region,
      db_pass: options.dbPassword,
      plan: 'free',
    }),
  })
}

export function inferSupabaseProjectUrl(projectRef: string): string {
  return `https://${projectRef}.supabase.co`
}

export function buildSupabaseDbUrlHint(projectRef: string, regionHost: string, dbPassword: string): string {
  return `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@${regionHost}:5432/postgres?sslmode=require`
}

export function getSupabaseOAuthConfig() {
  return {
    clientId: process.env.SUPABASE_MANAGEMENT_CLIENT_ID || '',
    authorizeUrl: process.env.SUPABASE_MANAGEMENT_AUTHORIZE_URL || 'https://supabase.com/dashboard',
    configured: Boolean(process.env.SUPABASE_MANAGEMENT_CLIENT_ID),
  }
}
