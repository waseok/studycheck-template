/**
 * Express 컨트롤러를 Vercel Serverless 핸들러로 감싼다.
 * (res.json / res.status 호환)
 */
export function asVercelHandler(
  handlers: Partial<Record<string, (req: any, res: any) => unknown>>
) {
  return async (req: any, res: any) => {
    try {
      const method = String(req.method || 'GET').toUpperCase()
      const handler = handlers[method] || handlers.ALL
      if (!handler) {
        res.statusCode = 405
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: `허용되지 않은 메서드: ${method}` }))
        return
      }

      // Express 스타일 헬퍼
      if (typeof res.status !== 'function') {
        res.status = (code: number) => {
          res.statusCode = code
          return res
        }
      }
      if (typeof res.json !== 'function') {
        res.json = (body: unknown) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
          return res
        }
      }

      await handler(req, res)
    } catch (error) {
      console.error('Vercel handler error:', error)
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error: '요청 처리 중 오류가 발생했습니다.',
            detail: error instanceof Error ? error.message : String(error),
          })
        )
      }
    }
  }
}
