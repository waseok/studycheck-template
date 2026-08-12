import prisma from '../../backend/src/utils/prisma'
import { getAppSettings, hashPassword } from '../../backend/src/utils/settings'

interface SetupBody {
  schoolName?: string
  schoolLogoUrl?: string
  schoolPassword?: string
  adminPassword?: string
  supabaseProjectUrl?: string
  vercelAppUrl?: string
  adminName?: string
  adminEmail?: string
}

function readBody(req: any): SetupBody {
  if (req.body && typeof req.body === 'object') return req.body as SetupBody
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body) as SetupBody
    } catch {
      return {}
    }
  }
  return {}
}

function runtimeAppUrl(req: any): string {
  const forwardedHost = String(req.headers?.['x-forwarded-host'] || '')
    .split(',')[0]
    .trim()
  const host = forwardedHost || String(req.headers?.host || '').trim()
  if (host) return `https://${host}`
  return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ''
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

/**
 * POST /api/settings/setup
 *
 * Express 전체 앱을 기동하지 않는 초기 설정 전용 경량 함수입니다.
 * 기존 api/index는 모든 라우트와 라이브러리를 한꺼번에 로드해 Vercel에서
 * 60초 타임아웃이 발생했으므로, 설정 완료에 필요한 모듈만 번들합니다.
 */
export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  // 일반화 사이트의 5단계에서 학교 setup 함수 기동 여부를 점검합니다.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  if (req.method === 'GET') {
    res.statusCode = 200
    res.end(JSON.stringify({ ready: true, service: 'settings-setup' }))
    return
  }
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: '허용되지 않은 메서드입니다.' }))
    return
  }

  try {
    const settings = await getAppSettings()
    if (settings.setupCompleted) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: '이미 초기 설정이 완료되었습니다.' }))
      return
    }

    const body = readBody(req)
    const schoolName = body.schoolName?.trim() || ''
    const schoolPassword = body.schoolPassword || ''
    const adminPassword = body.adminPassword || ''
    const adminName = body.adminName?.trim() || ''
    const normalizedEmail = body.adminEmail?.trim().toLowerCase() || ''

    if (!schoolName) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: '학교 이름을 입력해주세요.' }))
      return
    }
    if (schoolPassword.length < 4) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: '교직원 초기 비밀번호는 4자 이상이어야 합니다.' }))
      return
    }
    if (adminPassword.length < 4) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: '관리자 비밀번호는 4자 이상이어야 합니다.' }))
      return
    }
    if (!adminName || !normalizedEmail) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: '관리자 이름과 이메일을 입력해주세요.' }))
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: '올바른 관리자 이메일 형식이 아닙니다.' }))
      return
    }

    const existingAdmin = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existingAdmin) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: '이미 등록된 관리자 이메일입니다.' }))
      return
    }

    const [schoolPasswordHash, adminPasswordHash] = await Promise.all([
      hashPassword(schoolPassword),
      hashPassword(adminPassword),
    ])
    const vercelAppUrl = normalizeUrl(body.vercelAppUrl || runtimeAppUrl(req))

    await prisma.$transaction([
      prisma.appSettings.update({
        where: { id: 'default' },
        data: {
          schoolName,
          schoolLogoUrl: body.schoolLogoUrl?.trim() || null,
          schoolPasswordHash,
          adminPasswordHash,
          supabaseProjectUrl: body.supabaseProjectUrl?.trim() || null,
          vercelAppUrl,
          setupCompleted: true,
        },
      }),
      prisma.user.create({
        data: {
          name: adminName,
          email: normalizedEmail,
          userType: '교직원',
          role: 'SUPER_ADMIN',
          isAdmin: true,
          mustSetPin: true,
        },
      }),
    ])

    res.statusCode = 200
    res.end(
      JSON.stringify({
        success: true,
        message: '초기 설정이 완료되었습니다.',
        vercelAppUrl,
        schoolName,
      })
    )
  } catch (error) {
    const code = (error as { code?: string })?.code
    const message =
      code === 'P2025'
        ? '기본 설정 데이터가 없습니다. 4단계를 다시 실행한 뒤 재시도해주세요.'
        : code === 'P2002'
          ? '이미 등록된 관리자 이메일입니다.'
          : '초기 설정 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
    console.error('Lightweight setup error:', code || error)
    res.statusCode = code === 'P2002' ? 400 : 500
    res.end(JSON.stringify({ error: message, code: code || 'SETUP_FAILED' }))
  }
}
