/**
 * GET /api/settings/public — 부팅용 기본 설정
 */
export default function handler(_req: any, res: any) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.end(
    JSON.stringify({
      schoolName: '연수 관리 통합 플랫폼',
      schoolLogoUrl: null,
      vercelAppUrl: null,
      setupCompleted: false,
    })
  )
}
