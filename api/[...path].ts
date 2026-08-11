import serverless from 'serverless-http'

let handlerPromise: Promise<ReturnType<typeof serverless>> | null = null

async function getHandler() {
  if (!handlerPromise) {
    handlerPromise = (async () => {
      const { createApp } = await import('../backend/src/app')
      const app = createApp()
      return serverless(app, {
        binary: ['image/*', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      })
    })()
  }
  return handlerPromise
}

/**
 * Express catch-all.
 * 주의: vercel.json 에 /api/* → /api/... 자기참조 rewrite 를 두면 무한 루프가 난다.
 * SPA rewrite 만 api 제외하고, 이 catch-all 파일로 /api/* 를 받는다.
 */
export default async function apiHandler(req: any, res: any) {
  try {
    if (typeof req.url === 'string' && !req.url.startsWith('/api')) {
      req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`
    }
    const handler = await getHandler()
    return handler(req, res)
  } catch (error) {
    console.error('API catch-all error:', error)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error: 'API 핸들러를 초기화하지 못했습니다.',
        detail: error instanceof Error ? error.message : String(error),
      })
    )
  }
}
