/**
 * GET /api/settings/public
 * Express 없이 공개 설정만 반환 (부팅/헤더용)
 */
export default async function handler(_req: any, res: any) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

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
    const { isDatabaseReady } = await import('../../backend/src/utils/dbBootstrap')
    const { getAppSettings } = await import('../../backend/src/utils/settings')
    const { getRuntimeVercelUrl } = await import('../../backend/src/utils/vercel')

    const dbConnected = await isDatabaseReady()
    if (!dbConnected) {
      res.statusCode = 200
      res.end(
        JSON.stringify({
          ...fallback,
          vercelAppUrl: getRuntimeVercelUrl() || fallback.vercelAppUrl,
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
        vercelAppUrl: settings.vercelAppUrl || getRuntimeVercelUrl() || fallback.vercelAppUrl,
        setupCompleted: Boolean(settings.setupCompleted),
      })
    )
  } catch (error) {
    console.error('settings/public lightweight handler error:', error)
    res.statusCode = 200
    res.end(JSON.stringify(fallback))
  }
}
