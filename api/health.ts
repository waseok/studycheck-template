/**
 * GET /api/health — Express 없이 즉시 응답 (배포/기동 확인용)
 */
export default function handler(_req: any, res: any) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.end(
    JSON.stringify({
      status: 'ok',
      message: '연수 관리 플랫폼 API',
      timestamp: new Date().toISOString(),
    })
  )
}
