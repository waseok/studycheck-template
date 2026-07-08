import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../utils/prisma'
import { ensureDefaultSettings, isDatabaseReady, pushDatabaseSchema, testDatabaseConnection } from '../utils/dbBootstrap'
import { getAppSettings, normalizeVercelUrl } from '../utils/settings'
import {
  applyVercelEnvAndRedeploy,
  getRuntimeVercelProjectId,
  getRuntimeVercelTeamId,
  getRuntimeVercelUrl,
} from '../utils/vercel'

export const getSetupStatus = async (_req: Request, res: Response) => {
  try {
    const dbConnected = await isDatabaseReady()
    if (!dbConnected) {
      return res.json({
        setupCompleted: false,
        needsInfra: true,
        dbConnected: false,
        onVercel: Boolean(process.env.VERCEL),
      })
    }

    const settings = await getAppSettings()
    res.json({
      setupCompleted: settings.setupCompleted,
      needsInfra: false,
      dbConnected: true,
      onVercel: Boolean(process.env.VERCEL),
    })
  } catch (error) {
    console.error('Setup status error:', error)
    res.json({
      setupCompleted: false,
      needsInfra: true,
      dbConnected: false,
      onVercel: Boolean(process.env.VERCEL),
    })
  }
}

export const getPublicSettings = async (_req: Request, res: Response) => {
  try {
    const dbConnected = await isDatabaseReady()
    if (!dbConnected) {
      return res.json({
        schoolName: '연수 관리 통합 플랫폼',
        schoolLogoUrl: null,
        vercelAppUrl: getRuntimeVercelUrl() || null,
        setupCompleted: false,
      })
    }

    const settings = await getAppSettings()
    res.json({
      schoolName: settings.schoolName,
      schoolLogoUrl: settings.schoolLogoUrl,
      vercelAppUrl: settings.vercelAppUrl || getRuntimeVercelUrl() || null,
      setupCompleted: settings.setupCompleted,
    })
  } catch (error) {
    console.error('Public settings error:', error)
    res.json({
      schoolName: '연수 관리 통합 플랫폼',
      schoolLogoUrl: null,
      vercelAppUrl: getRuntimeVercelUrl() || null,
      setupCompleted: false,
    })
  }
}

export const bootstrapInfra = async (req: Request, res: Response) => {
  try {
    const { databaseUrl, jwtSecret, vercelToken, supabaseProjectUrl } = req.body as {
      databaseUrl?: string
      jwtSecret?: string
      vercelToken?: string
      supabaseProjectUrl?: string
    }

    if (!databaseUrl?.trim()) {
      return res.status(400).json({ error: 'Supabase DATABASE_URL을 입력해주세요.' })
    }
    if (!jwtSecret || jwtSecret.length < 16) {
      return res.status(400).json({ error: 'JWT_SECRET은 16자 이상이어야 합니다.' })
    }

    const trimmedUrl = databaseUrl.trim()

    try {
      await testDatabaseConnection(trimmedUrl)
    } catch {
      return res.status(400).json({
        error: '데이터베이스 연결에 실패했습니다. Supabase Session pooler URI를 확인해주세요.',
      })
    }

    try {
      pushDatabaseSchema(trimmedUrl)
    } catch (error) {
      console.error('DB push error:', error)
      return res.status(500).json({ error: 'DB 스키마 반영에 실패했습니다.' })
    }

    await ensureDefaultSettings(trimmedUrl, supabaseProjectUrl)

    const projectId = getRuntimeVercelProjectId()
    const teamId = getRuntimeVercelTeamId()
    const token = vercelToken?.trim()
    let redeployTriggered = false
    let vercelEnvApplied = false

    if (token && projectId) {
      try {
        await applyVercelEnvAndRedeploy({
          token,
          projectId,
          teamId,
          databaseUrl: trimmedUrl,
          jwtSecret,
        })
        redeployTriggered = true
        vercelEnvApplied = true
      } catch (error) {
        console.error('Vercel env apply error:', error)
        return res.status(500).json({
          error: 'Vercel 환경변수 적용에 실패했습니다. Access Token 권한을 확인해주세요.',
        })
      }
    }

    const alreadyConnected = process.env.DATABASE_URL === trimmedUrl && (await isDatabaseReady())

    res.json({
      success: true,
      message: vercelEnvApplied
        ? 'DB 연결 완료. Vercel 환경변수를 적용하고 재배포를 시작했습니다.'
        : 'DB 연결 및 스키마 반영이 완료되었습니다.',
      dbConnected: alreadyConnected,
      redeployTriggered,
      vercelEnvApplied,
      manualEnvRequired: !vercelEnvApplied && Boolean(process.env.VERCEL),
    })
  } catch (error) {
    console.error('Bootstrap infra error:', error)
    res.status(500).json({ error: '인프라 설정 중 오류가 발생했습니다.' })
  }
}

export const completeSetup = async (req: Request, res: Response) => {
  try {
    const settings = await getAppSettings()
    if (settings.setupCompleted) {
      return res.status(400).json({ error: '이미 초기 설정이 완료되었습니다.' })
    }

    const {
      schoolName,
      schoolLogoUrl,
      schoolPassword,
      adminPassword,
      supabaseProjectUrl,
      vercelAppUrl,
      adminName,
      adminEmail,
    } = req.body as {
      schoolName?: string
      schoolLogoUrl?: string
      schoolPassword?: string
      adminPassword?: string
      supabaseProjectUrl?: string
      vercelAppUrl?: string
      adminName?: string
      adminEmail?: string
    }

    if (!schoolName?.trim()) {
      return res.status(400).json({ error: '학교 이름을 입력해주세요.' })
    }
    if (!schoolPassword || schoolPassword.length < 4) {
      return res.status(400).json({ error: '교직원 초기 비밀번호는 4자 이상이어야 합니다.' })
    }
    if (!adminPassword || adminPassword.length < 4) {
      return res.status(400).json({ error: '관리자 비밀번호는 4자 이상이어야 합니다.' })
    }
    if (!adminName?.trim() || !adminEmail?.trim()) {
      return res.status(400).json({ error: '관리자 이름과 이메일을 입력해주세요.' })
    }

    const resolvedVercelUrl =
      vercelAppUrl?.trim() ||
      getRuntimeVercelUrl() ||
      (req.headers['x-forwarded-host']
        ? `https://${String(req.headers['x-forwarded-host']).split(',')[0]}`
        : '')

    if (!resolvedVercelUrl) {
      return res.status(400).json({ error: '배포 URL을 확인할 수 없습니다.' })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const normalizedEmail = adminEmail.trim().toLowerCase()
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: '올바른 관리자 이메일 형식이 아닙니다.' })
    }

    const existingAdmin = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existingAdmin) {
      return res.status(400).json({ error: '이미 등록된 관리자 이메일입니다.' })
    }

    const [schoolPasswordHash, adminPasswordHash] = await Promise.all([
      bcrypt.hash(schoolPassword, 10),
      bcrypt.hash(adminPassword, 10),
    ])

    await prisma.$transaction([
      prisma.appSettings.update({
        where: { id: 'default' },
        data: {
          schoolName: schoolName.trim(),
          schoolLogoUrl: schoolLogoUrl?.trim() || null,
          schoolPasswordHash,
          adminPasswordHash,
          supabaseProjectUrl: supabaseProjectUrl?.trim() || null,
          vercelAppUrl: normalizeVercelUrl(resolvedVercelUrl),
          setupCompleted: true,
        },
      }),
      prisma.user.create({
        data: {
          name: adminName.trim(),
          email: normalizedEmail,
          userType: '교직원',
          role: 'SUPER_ADMIN',
          isAdmin: true,
          mustSetPin: true,
        },
      }),
    ])

    const updated = await getAppSettings()
    res.json({
      success: true,
      message: '초기 설정이 완료되었습니다.',
      vercelAppUrl: updated.vercelAppUrl,
      schoolName: updated.schoolName,
    })
  } catch (error) {
    console.error('Complete setup error:', error)
    res.status(500).json({ error: '초기 설정 중 오류가 발생했습니다.' })
  }
}
