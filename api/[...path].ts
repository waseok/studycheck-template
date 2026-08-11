import serverless from 'serverless-http'
import { createApp } from '../backend/src/app'

const app = createApp()
const handler = serverless(app, {
  binary: ['image/*', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
})

// Vercel catch-all: /api/* → Express
// SPA rewrite가 /api POST를 가로채지 않도록 vercel.json에서 /api 는 제외해야 함
export default async function apiHandler(req: any, res: any) {
  // catch-all 환경에서 path가 /api 없이 들어올 수 있어 Express mount(/api/...)에 맞춤
  if (typeof req.url === 'string' && !req.url.startsWith('/api')) {
    req.url = `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`
  }

  return handler(req, res)
}
