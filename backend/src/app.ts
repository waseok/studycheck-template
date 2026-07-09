import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import trainingRoutes from './routes/trainings'
import participantRoutes from './routes/participants'
import statsRoutes from './routes/stats'
import signatureRoutes from './routes/signatures'
import trainingNoticeRoutes from './routes/trainingNotices'
import meetingRoutes from './routes/meetings'
import groupRoutes from './routes/groups'
import onboardingRoutes from './routes/onboarding'
import settingsRoutes from './routes/settings'

export function createApp() {
  const app = express()

  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
    : ['http://localhost:5173']

  app.use(cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true)

      const isVercelDomain = origin.includes('.vercel.app')

      if (allowedOrigins.includes(origin) || isVercelDomain || process.env.NODE_ENV === 'development') {
        callback(null, true)
      } else {
        console.warn('⚠️ CORS 차단된 Origin:', origin)
        callback(new Error('CORS 정책에 의해 차단되었습니다.'))
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }))

  app.use(express.json({ limit: '50mb' }))
  app.use(express.urlencoded({ extended: true, limit: '50mb' }))

  app.use('/api/auth', authRoutes)
  app.use('/api/users', userRoutes)
  app.use('/api/trainings', trainingRoutes)
  app.use('/api/participants', participantRoutes)
  app.use('/api/stats', statsRoutes)
  app.use('/api/signatures', signatureRoutes)
  app.use('/api/training-notices', trainingNoticeRoutes)
  app.use('/api/meetings', meetingRoutes)
  app.use('/api/groups', groupRoutes)
  app.use('/api/onboarding', onboardingRoutes)
  app.use('/api/settings', settingsRoutes)

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: '연수 관리 플랫폼 API', timestamp: new Date().toISOString() })
  })

  return app
}
