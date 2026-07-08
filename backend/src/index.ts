import https from 'https'
import http from 'http'
import { createApp } from './app'

const app = createApp()
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`)

  if (process.env.NODE_ENV === 'production' && process.env.RENDER_EXTERNAL_URL) {
    const KEEP_ALIVE_INTERVAL = 14 * 60 * 1000
    const pingUrl = `${process.env.RENDER_EXTERNAL_URL}/api/health`
    setInterval(() => {
      const client = pingUrl.startsWith('https') ? https : http
      client.get(pingUrl, () => {}).on('error', () => {})
    }, KEEP_ALIVE_INTERVAL)
    console.log('🏓 Keep-alive ping 활성화 (14분 간격)')
  }
})
