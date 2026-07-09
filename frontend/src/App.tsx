import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import { getSetupStatus } from './api/settings'
import { useSettings } from './contexts/SettingsContext'

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
    getSetupStatus()
      .then((status) => {
        setBackendError(false)
        setDbConnected(status.dbConnected)
        setSetupCompleted(status.setupCompleted)
      })
      .catch(() => {
        setBackendError(true)
        setDbConnected(false)
        setSetupCompleted(settings.setupCompleted)
      })
      .finally(() => setChecking(false))
  }, [settings.setupCompleted])

  if (checking || settingsLoading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">로딩 중...</div>
  }

  if (backendError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-lg w-full bg-white border border-red-200 rounded-2xl shadow-lg p-6 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">API 서버에 연결할 수 없습니다</h1>
          <p className="text-sm text-gray-600 mb-4">
            배포 직후라면 잠시 후 다시 시도하거나, 로컬 개발 중이라면 백엔드 서버가 실행 중인지 확인해주세요.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
          >
            다시 시도
          </button>
        </div>
      </div>
    )
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
