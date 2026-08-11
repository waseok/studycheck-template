import serverless from 'serverless-http'
import { createApp } from '../backend/src/app'

const app = createApp()
const expressHandler = serverless(app, {
  binary: [
    'image/*',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
})

/**
 * Vercel rewrite `/api/(.*) → /api?__path=$1` 때문에 destination URL 이 `/api` 로 바뀌면
 * Express 라우트(`/api/settings/...`)와 맞지 않아 요청이 응답 없이 타임아웃된다.
 * __path(또는 전달 헤더)로 원본 경로를 복원한 뒤 Express 에 넘긴다.
 */
function restoreApiPath(req: any): void {
  const rawQueryPath = req.query?.__path
  const fromQuery = Array.isArray(rawQueryPath) ? rawQueryPath[0] : rawQueryPath
  const headerPath =
    req.headers?.['x-forwarded-uri'] ||
    req.headers?.['x-invoke-path'] ||
    req.headers?.['x-vercel-forwarded-path']

  let restored: string | undefined
  if (typeof fromQuery === 'string' && fromQuery.length > 0) {
    restored = fromQuery.startsWith('/api/')
      ? fromQuery
      : `/api/${fromQuery.replace(/^\//, '')}`
  } else if (typeof headerPath === 'string' && headerPath.startsWith('/api/')) {
    restored = headerPath.split('?')[0]
  }

  if (!restored) return

  const current = String(req.url || '/')
  const qsIndex = current.indexOf('?')
  if (qsIndex === -1) {
    req.url = restored
    return
  }

  // __path 쿼리는 Express 로 넘기지 않음
  const params = new URLSearchParams(current.slice(qsIndex + 1))
  params.delete('__path')
  const nextQuery = params.toString()
  req.url = nextQuery ? `${restored}?${nextQuery}` : restored
}

export default async function handler(req: any, res: any) {
  try {
    restoreApiPath(req)
    return await expressHandler(req, res)
  } catch (error) {
    console.error('api/index handler error:', error)
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'API handler failed',
        })
      )
    }
  }
}
