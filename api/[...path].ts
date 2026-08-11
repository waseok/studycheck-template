import serverless from 'serverless-http'
import { createApp } from '../backend/src/app'

const app = createApp()
const handler = serverless(app, {
  binary: ['image/*', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
})

/**
 * Vercel catch-all 함수.
 * /api/* 요청을 Express로 전달한다.
 * (주의) vercel.json 에서 /api → /api 형태의 rewrite를 두면 무한 루프가 난다.
 */
export default async function (req: any, res: any) {
  // catch-all 에서 path 가 /api 접두사 없이 올 수 있음
  if (typeof req.url === 'string' && !req.url.startsWith('/api')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`
  }
  return handler(req, res)
}
