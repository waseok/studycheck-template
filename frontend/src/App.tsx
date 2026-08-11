import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import { useSettings } from './contexts/SettingsContext'
import apiClient from './api/client'

const Login = lazy(() => import('./pages/Login'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const SetupWizard = lazy(() => import('./pages/SetupWizard'))
const SetPin = lazy(() => import('./pages/SetPin'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Users = lazy(() => import('./pages/Users'))
const Trainings = lazy(() => import('./pages/Trainings'))
const TrainingCollection = lazy(() => import('./pages/TrainingCollection'))
const MyTrainings = lazy(() => import('./pages/MyTrainings'))
const Stats = lazy(() => import('./pages/Stats'))
const Profile = lazy(() => import('./pages/Profile'))
const SignatureBook = lazy(() => import('./pages/SignatureBook'))
const SignatureBookDetail = lazy(() => import('./pages/SignatureBookDetail'))
const TrainingNotice = lazy(() => import('./pages/TrainingNotice'))
const MeetingList = lazy(() => import('./pages/MeetingList'))
const MeetingDetail = lazy(() => import('./pages/MeetingDetail'))
const PublicTrainingSignature = lazy(() => import('./pages/PublicTrainingSignature'))
const PublicMeetingSignature = lazy(() => import('./pages/PublicMeetingSignature'))

const SetupGate = ({ children }: { children: ReactNode }) => {
  const location = useLocation()
  const { settings, loading: settingsLoading } = useSettings()
  const [checking, setChecking] = useState(true)
  const [dbConnected, setDbConnected] = useState(false)
  const [setupCompleted, setSetupCompleted] = useState(false)
  const [backendError, setBackendError] = useState(false)
  const [backendErrorDetail, setBackendErrorDetail] = useState('')

  useEffect(() => {
    let cancelled = false
    // Hobby 콜드스타트(Express+Prisma)를 고려해 충분히 기다림
    const timeoutMs = 45000

    apiClient
      .get('/settings/status', { timeout: timeoutMs })
      .then((response) => {
        if (cancelled) return
        const status = response.data as {
          dbConnected?: boolean
          setupCompleted?: boolean
        }
        setBackendError(false)
        setBackendErrorDetail('')
        setDbConnected(Boolean(status.dbConnected))
        setSetupCompleted(Boolean(status.setupCompleted))
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const ax = error as {
          code?: string
          message?: string
          response?: { status?: number; data?: { error?: string; detail?: string } }
        }
        const detail =
          ax.response?.data?.detail ||
          ax.response?.data?.error ||
          (ax.code === 'ECONNABORTED'
            ? 'API 응답이 너무 오래 걸립니다. 잠시 후 다시 시도해주세요.'
            : ax.message) ||
          '알 수 없는 오류'
        setBackendError(true)
        setBackendErrorDetail(String(detail))
        setDbConnected(false)
        setSetupCompleted(settings.setupCompleted)
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })

    return () => {
      cancelled = true
    }
  }, [settings.setupCompleted])

  if (checking || settingsLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-500 gap-2 px-4 text-center">
        <div>로딩 중...</div>
        <div className="text-xs text-gray-400">첫 접속이면 API 기동에 최대 1분 정도 걸릴 수 있습니다.</div>
      </div>
    )
  }

  if (backendError) {
    // 온보딩은 API 복구/설정이 필요한 화면이므로 진입은 허용한다
    if (location.pathname !== '/onboarding') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-lg w-full bg-white border border-red-200 rounded-2xl shadow-lg p-6 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">API 서버에 연결할 수 없습니다</h1>
            <p className="text-sm text-gray-600 mb-2">
              배포 직후라면 잠시 후 다시 시도해주세요. 계속되면 아래 원인을 확인하세요.
            </p>
            {backendErrorDetail ? (
              <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4 break-all text-left">
                {backendErrorDetail}
              </p>
            ) : null}
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
              >
                다시 시도
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/setup'
                }}
                className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
              >
                설정 화면으로
              </button>
            </div>
          </div>
        </div>
      )
    }
  }

  if (!dbConnected && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  if (dbConnected && !setupCompleted && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />
  }

  if (setupCompleted && (location.pathname === '/setup' || location.pathname === '/onboarding')) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <SetupGate>
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">페이지를 불러오는 중...</div>}>
          <Routes>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/setup" element={<SetupWizard />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/set-pin"
              element={
                <ProtectedRoute>
                  <SetPin />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/users"
              element={
                <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/trainings"
              element={
                <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'TRAINING_ADMIN']}>
                  <Trainings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/trainings/:id"
              element={
                <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'TRAINING_ADMIN', 'USER']}>
                  <TrainingCollection />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/my-trainings"
              element={
                <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'TRAINING_ADMIN', 'USER']}>
                  <MyTrainings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/profile"
              element={
                <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'TRAINING_ADMIN', 'USER']}>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/stats"
              element={
                <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'TRAINING_ADMIN']}>
                  <Stats />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/signature-book"
              element={
                <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'TRAINING_ADMIN', 'USER']}>
                  <SignatureBook />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/signature-book/:trainingId"
              element={
                <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'TRAINING_ADMIN', 'USER']}>
                  <SignatureBookDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/training-notice"
              element={
                <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'TRAINING_ADMIN', 'USER']}>
                  <TrainingNotice />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/meetings"
              element={
                <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'TRAINING_ADMIN', 'USER']}>
                  <MeetingList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/meetings/:meetingId"
              element={
                <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'TRAINING_ADMIN', 'USER']}>
                  <MeetingDetail />
                </ProtectedRoute>
              }
            />
            <Route path="/sign/training/:trainingId" element={<PublicTrainingSignature />} />
            <Route path="/sign/meeting/:meetingId" element={<PublicMeetingSignature />} />
            <Route path="/" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </SetupGate>
    </BrowserRouter>
  )
}

export default App
