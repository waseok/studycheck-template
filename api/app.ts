import serverless from 'serverless-http'
import { createApp } from '../backend/src/app'

const app = createApp()

/**
 * 나머지 /api/* 요청용 Express 엔트리.
 * vercel.json 에서 존재하지 않는 /api 경로만 /api/app 으로 rewrite 한다.
 * (ping/health/status 등 개별 파일은 filesystem 우선이라 이 핸들러를 거치지 않음)
 */
export default serverless(app, {
  binary: ['image/*', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
})
