/**
 * GET /api/settings/status
 * Express(api/index) 전체를 띄우지 않는 경량 게이트.
 * - DATABASE_URL 없음(일반화/온보딩 사이트): 즉시 needsInfra
 * - DATABASE_URL 있음(학교/테스트 사이트): 짧은 DB 핑 후 상태 반환
 */
export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  // 온보딩(일반화) 사이트에서 학교 사이트 상태를 진단할 수 있게 공개 CORS 허용
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  const base = {
    onVercel: Boolean(process.env.VERCEL),
  }

  if (!process.env.DATABASE_URL) {
    res.statusCode = 200
    res.end(
      JSON.stringify({
        ...base,
        setupCompleted: false,
        needsInfra: true,
        dbConnected: false,
      })
    )
    return
  }

  try {
    const { isDatabaseReady } = await import('../../backend/src/utils/dbBootstrap')
    const { getAppSettings } = await import('../../backend/src/utils/settings')

    const dbConnected = await isDatabaseReady()
    if (!dbConnected) {
      res.statusCode = 200
      res.end(
        JSON.stringify({
          ...base,
          setupCompleted: false,
          needsInfra: true,
          dbConnected: false,
        })
      )
      return
    }

    const settings = await getAppSettings()
    res.statusCode = 200
    res.end(
      JSON.stringify({
        ...base,
        setupCompleted: Boolean(settings.setupCompleted),
        needsInfra: false,
        dbConnected: true,
      })
    )
  } catch (error) {
    console.error('settings/status lightweight handler error:', error)
    res.statusCode = 200
    res.end(
      JSON.stringify({
        ...base,
        setupCompleted: false,
        needsInfra: true,
        dbConnected: false,
      })
    )
  }
}
