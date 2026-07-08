import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'

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

function runPrismaDbPush(backendDir: string, databaseUrl: string): void {
  const prismaEntry = path.join(backendDir, 'node_modules', 'prisma', 'build', 'index.js')
  const result = spawnSync(process.execPath, [prismaEntry, 'db', 'push', '--skip-generate'], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf-8',
  })

  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || 'prisma db push failed'
    console.error('prisma db push failed:', detail)
    throw new Error(detail)
  }
}

export function pushDatabaseSchema(databaseUrl: string): void {
  runPrismaDbPush(getBackendDir(), databaseUrl)
}

/** Supabase Session pooler 연결 테스트 */
export async function testDatabaseConnection(databaseUrl: string): Promise<void> {
  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  })
  try {
    await client.$connect()
    await client.$queryRaw`SELECT 1`
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
    datasources: { db: { url: databaseUrl } },
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
  if (!process.env.DATABASE_URL) return false
  try {
    const client = new PrismaClient()
    await client.$connect()
    await client.$queryRaw`SELECT 1`
    await client.$disconnect()
    return true
  } catch {
    return false
  }
}
