/**
 * GET /api/settings/status
 * Express cold start/루프와 무관하게 부팅 게이트가 통과하도록 경량 응답
 */
export default function handler(_req: any, res: any) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.end(
    JSON.stringify({
      setupCompleted: false,
      needsInfra: true,
      dbConnected: false,
      onVercel: true,
    })
  )
}
