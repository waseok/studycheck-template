import bcrypt from 'bcryptjs'
import prisma from './prisma'

const SETTINGS_ID = 'default'

export async function getAppSettings() {
  let settings = await prisma.appSettings.findUnique({ where: { id: SETTINGS_ID } })
  if (!settings) {
    settings = await prisma.appSettings.create({ data: { id: SETTINGS_ID } })
  }
  return settings
}

export async function verifySchoolPassword(password: string): Promise<boolean> {
  const settings = await getAppSettings()
  if (settings.schoolPasswordHash) {
    return bcrypt.compare(password, settings.schoolPasswordHash)
  }
  const fallback = process.env.SCHOOL_PASSWORD || '1234'
  return password === fallback
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const settings = await getAppSettings()
  if (settings.adminPasswordHash) {
    return bcrypt.compare(password, settings.adminPasswordHash)
  }
  const fallback = process.env.ADMIN_PASSWORD || 'admin-password'
  return password === fallback
}

export function normalizeVercelUrl(input: string): string {
  let trimmed = input.trim().replace(/\/$/, '')
  if (!trimmed) return ''

  // 프로토콜 제거 후 호스트만 사용 (경로 무시)
  trimmed = trimmed.replace(/^https?:\/\//, '')
  const host = trimmed.split('/')[0]

  if (host.endsWith('.vercel.app')) {
    return `https://${host}`
  }

  return `https://${host}.vercel.app`
}
