import { PrismaClient } from '@prisma/client'
import { normalizeDatabaseUrl } from './dbBootstrap'

// Vercel Serverless: 인스턴스 재사용으로 DB 연결 폭주 방지
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // 수동 env 입력이나 구 배포에서도 pooler/연결 수 보정이 빠지지 않게 합니다.
    ...(process.env.DATABASE_URL
      ? { datasources: { db: { url: normalizeDatabaseUrl(process.env.DATABASE_URL) } } }
      : {}),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = prisma
}

export default prisma
