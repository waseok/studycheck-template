import serverless from 'serverless-http'
import { createApp } from '../backend/src/app'

const app = createApp()

// Vercel catch-all function: /api/* 전체를 Express 앱으로 전달
export default serverless(app, {
  binary: ['image/*', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
})
