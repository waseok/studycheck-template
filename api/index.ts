import serverless from 'serverless-http'
import { createApp } from '../backend/src/app'

const app = createApp()

// vercel.json: /api/* → /api/index (filesystem이 api/index.ts 로 연결)
export default serverless(app, {
  binary: ['image/*', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
})
