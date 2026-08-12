/**
 * GET /api/settings/public
 * Express 없이 공개 설정만 반환 (부팅/헤더용)
 */
import { isDatabaseReady } from '../../backend/src/utils/dbBootstrap'
import { getAppSettings } from '../../backend/src/utils/settings'

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  const fallback = {
    schoolName: '연수 관리 통합 플랫폼',
    schoolLogoUrl: null,
    vercelAppUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    setupCompleted: false,
  }

  if (!process.env.DATABASE_URL) {
    res.statusCode = 200
    res.end(JSON.stringify(fallback))
    return
  }

  try {
    const dbConnected = await isDatabaseReady()
    if (!dbConnected) {
      res.statusCode = 200
      res.end(
        JSON.stringify({
          ...fallback,
          vercelAppUrl: fallback.vercelAppUrl,
        })
      )
      return
    }

    const settings = await getAppSettings()
    res.statusCode = 200
    res.end(
      JSON.stringify({
        schoolName: settings.schoolName || fallback.schoolName,
        schoolLogoUrl: settings.schoolLogoUrl,
        vercelAppUrl: settings.vercelAppUrl || fallback.vercelAppUrl,
        setupCompleted: Boolean(settings.setupCompleted),
      })
    )
  } catch (error) {
    console.error('settings/public lightweight handler error:', error)
    res.statusCode = 200
    res.end(JSON.stringify(fallback))
  }
}
