import serverless from 'serverless-http'
import { createApp } from '../backend/src/app'

// Vercel Serverless: /api/* 요청을 Express 앱으로 전달
const app = createApp()

export default serverless(app, {
  binary: ['image/*', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
})
