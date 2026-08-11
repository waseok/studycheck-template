/**
 * 배포 여부 확인용 경량 엔드포인트 (Express/Prisma 미사용)
 * GET /api/ping
 */
export default function handler(_req: any, res: any) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ ok: true, ts: Date.now() }))
}
