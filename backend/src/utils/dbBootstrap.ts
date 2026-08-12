import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'

const DB_CONNECT_TIMEOUT_SECONDS = 5

// Postgres 에러 코드: 이미 존재하는 테이블/제약조건/인덱스 (재실행 시 무시해도 안전함)
const ALREADY_EXISTS_ERROR_CODES = new Set(['42P07', '42710', '42701'])

function getBackendDir(): string {
  const fromRoot = path.join(process.cwd(), 'backend')
  if (fs.existsSync(path.join(fromRoot, 'prisma', 'schema.prisma'))) {
    return fromRoot
  }
  if (fs.existsSync(path.join(process.cwd(), 'prisma', 'schema.prisma'))) {
    return process.cwd()
  }
  throw new Error('backend/prisma/schema.prisma 경로를 찾을 수 없습니다.')
}

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/m)
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim()
    )
    .filter((statement) => statement.length > 0)
}

/**
 * 새 Supabase DB에 스키마를 적용한다.
 * Vercel 서버리스 함수 번들에는 Prisma CLI/엔진이 포함되지 않으므로
 * (vercel.json includeFiles가 .prisma/**, prisma/**만 포함),
 * `prisma db push`를 spawn하는 대신 미리 생성해 둔 prisma/init.sql을
 * 이미 번들된 @prisma/client로 직접 실행한다.
 */
export async function pushDatabaseSchema(databaseUrl: string): Promise<void> {
  const initSqlPath = path.join(getBackendDir(), 'prisma', 'init.sql')
  const sql = fs.readFileSync(initSqlPath, 'utf-8')
  const statements = splitSqlStatements(sql)

  const client = new PrismaClient({
    datasources: { db: { url: withDatabaseTimeout(databaseUrl) } },
  })
  try {
    for (const statement of statements) {
      try {
        await withTimeout(client.$executeRawUnsafe(statement), 'Schema statement apply')
      } catch (error) {
        const code = (error as { meta?: { code?: string } })?.meta?.code
        if (!code || !ALREADY_EXISTS_ERROR_CODES.has(code)) {
          throw error
        }
      }
    }
  } finally {
    await client.$disconnect()
  }
}

/**
 * Supabase/Prisma 에서 자주 빠뜨리는 쿼리 파라미터를 보정합니다.
 * - sslmode=require
 * - Transaction pooler(6543)면 pgbouncer=true
 */
export function normalizeDatabaseUrl(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl.trim())
    const host = url.hostname.toLowerCase()
    const isSupabase =
      host.includes('supabase.co') ||
      host.includes('supabase.com') ||
      host.includes('pooler.supabase')

    if (isSupabase && !url.searchParams.has('sslmode')) {
      url.searchParams.set('sslmode', 'require')
    }
    // Transaction mode pooler (보통 6543) 는 Prisma에 pgbouncer=true 필요
    if (url.port === '6543' && !url.searchParams.has('pgbouncer')) {
      url.searchParams.set('pgbouncer', 'true')
    }
    // Vercel 함수 인스턴스마다 큰 Prisma 풀을 만들면 Supabase 연결 한도를 빠르게 소진합니다.
    // Transaction/Session 공통으로 함수 인스턴스당 연결 1개만 사용합니다.
    if (isSupabase && host.includes('pooler') && !url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '1')
    }
    return url.toString()
  } catch {
    return databaseUrl.trim()
  }
}

function withDatabaseTimeout(databaseUrl: string): string {
  try {
    const url = new URL(normalizeDatabaseUrl(databaseUrl))
    if (!url.searchParams.has('connect_timeout')) {
      url.searchParams.set('connect_timeout', String(DB_CONNECT_TIMEOUT_SECONDS))
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', String(DB_CONNECT_TIMEOUT_SECONDS))
    }
    return url.toString()
  } catch {
    return databaseUrl
  }
}

/** 로그/API용 — URL·비밀번호를 가린 짧은 에러 문자열 */
export function sanitizeDbError(error: unknown): string {
  let text = error instanceof Error ? error.message : String(error)
  text = text.replace(/postgresql:\/\/[^@\s]+@/gi, 'postgresql://***@')
  text = text.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, 'postgresql://***')
  text = text.replace(/password[=:]\s*\S+/gi, 'password=***')
  return text.slice(0, 280)
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${DB_CONNECT_TIMEOUT_SECONDS}s`))
    }, DB_CONNECT_TIMEOUT_SECONDS * 1000)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

/** Supabase Transaction(6543) 또는 Session(5432) pooler 연결 테스트 */
export async function testDatabaseConnection(databaseUrl: string): Promise<void> {
  const client = new PrismaClient({
    datasources: { db: { url: withDatabaseTimeout(databaseUrl) } },
  })
  try {
    await withTimeout(client.$connect(), 'Database connection test')
    await withTimeout(client.$queryRaw`SELECT 1`, 'Database ping')
  } finally {
    await client.$disconnect()
  }
}

/** app_settings 기본 행 생성 (없을 때) */
export async function ensureDefaultSettings(
  databaseUrl: string,
  supabaseProjectUrl?: string | null
): Promise<void> {
  const client = new PrismaClient({
    datasources: { db: { url: withDatabaseTimeout(databaseUrl) } },
  })
  try {
    await client.appSettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        supabaseProjectUrl: supabaseProjectUrl?.trim() || null,
      },
      update: supabaseProjectUrl?.trim()
        ? { supabaseProjectUrl: supabaseProjectUrl.trim() }
        : {},
    })
  } finally {
    await client.$disconnect()
  }
}

/** 현재 런타임 DATABASE_URL로 DB 연결 가능 여부 */
export async function isDatabaseReady(): Promise<boolean> {
  const probed = await probeRuntimeDatabase()
  return probed.ok
}

/** SetupGate/진단용 — 실패 원인까지 반환 */
export async function probeRuntimeDatabase(): Promise<{
  ok: boolean
  hasDatabaseUrl: boolean
  error?: string
}> {
  const raw = process.env.DATABASE_URL?.trim()
  if (!raw) {
    return { ok: false, hasDatabaseUrl: false, error: 'missing_DATABASE_URL' }
  }
  try {
    const client = new PrismaClient({
      datasources: { db: { url: withDatabaseTimeout(raw) } },
    })
    try {
      await withTimeout(client.$connect(), 'Runtime database connection')
      await withTimeout(client.$queryRaw`SELECT 1`, 'Runtime database ping')
    } finally {
      await client.$disconnect()
    }
    return { ok: true, hasDatabaseUrl: true }
  } catch (error) {
    console.error('probeRuntimeDatabase failed:', sanitizeDbError(error))
    return { ok: false, hasDatabaseUrl: true, error: sanitizeDbError(error) }
  }
}
