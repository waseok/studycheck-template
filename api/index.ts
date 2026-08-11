import serverless from 'serverless-http'
import { createApp } from '../backend/src/app'

const app = createApp()

/**
 * 학교 사이트의 실제 API (auth/settings/trainings …).
 * vercel.json 에서 /api/* (온보딩 제외) → /api 로 rewrite 되어 이 핸들러로 들어온다.
 */
export default serverless(app, {
  binary: [
    'image/*',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
})
