import { PrismaClient } from '@prisma/client'

// Vercel Serverless: 인스턴스 재사용으로 DB 연결 폭주 방지
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = prisma
}

export default prisma
