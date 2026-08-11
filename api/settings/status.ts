/**
 * GET /api/settings/status
 * Express(api/index) 전체를 띄우지 않는 경량 게이트.
 * - DATABASE_URL 없음(일반화/온보딩 사이트): 즉시 needsInfra
 * - DATABASE_URL 있음(학교/테스트 사이트): 짧은 DB 핑 후 상태 반환
 *
 * hasDatabaseUrl / dbError 로 「env 미반영」과 「연결 실패」를 구분합니다.
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

  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim())
  if (!hasDatabaseUrl) {
    res.statusCode = 200
    res.end(
      JSON.stringify({
        ...base,
        setupCompleted: false,
        needsInfra: true,
        dbConnected: false,
        hasDatabaseUrl: false,
        reason: 'missing_DATABASE_URL',
      })
    )
    return
  }

  try {
    const { probeRuntimeDatabase } = await import('../../backend/src/utils/dbBootstrap')
    const probed = await probeRuntimeDatabase()

    if (!probed.ok) {
      res.statusCode = 200
      res.end(
        JSON.stringify({
          ...base,
          setupCompleted: false,
          needsInfra: true,
          dbConnected: false,
          hasDatabaseUrl: true,
          reason: 'db_unreachable',
          dbError: probed.error || 'database_unreachable',
        })
      )
      return
    }

    const { getAppSettings } = await import('../../backend/src/utils/settings')
    const settings = await getAppSettings()
    res.statusCode = 200
    res.end(
      JSON.stringify({
        ...base,
        setupCompleted: Boolean(settings.setupCompleted),
        needsInfra: false,
        dbConnected: true,
        hasDatabaseUrl: true,
      })
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('settings/status lightweight handler error:', message)
    res.statusCode = 200
    res.end(
      JSON.stringify({
        ...base,
        setupCompleted: false,
        needsInfra: true,
        dbConnected: false,
        hasDatabaseUrl: true,
        reason: 'handler_error',
        dbError: message.slice(0, 280),
      })
    )
  }
}
