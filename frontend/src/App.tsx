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

  useEffect(() => {
    let cancelled = false
    // 경량 /api/settings/status 기준 (Express 전체 기동 불필요)
    const timeoutMs = 15000

    apiClient
      .get('/settings/status', { timeout: timeoutMs })
      .then((response) => {
        if (cancelled) return
        const status = response.data as {
          dbConnected?: boolean
          setupCompleted?: boolean
        }
        setBackendError(false)
        setDbConnected(Boolean(status.dbConnected))
        setSetupCompleted(Boolean(status.setupCompleted))
      })
      .catch(() => {
        if (cancelled) return
        setBackendError(true)
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
    // 일반화(온보딩) 사이트는 API 게이트가 실패해도 온보딩으로 들어가게 한다
    if (location.pathname !== '/onboarding') {
      return <Navigate to="/onboarding" replace />
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
