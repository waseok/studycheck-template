import serverless from 'serverless-http'
import { createApp } from '../backend/src/app'

const app = createApp()

// Express 앱을 Vercel Serverless Function으로 실행
// vercel.json 에서 /api/* → /api 로 rewrite 되어 이 핸들러로 들어온다
export default serverless(app, {
  binary: ['image/*', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
})
