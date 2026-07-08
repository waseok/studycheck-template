import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { bootstrapInfra, completeSetup, getSetupStatus } from '../api/settings'
import { useSettings } from '../contexts/SettingsContext'

const SCHOOL_STEPS = ['학교 정보', '비밀번호', '관리자 계정', '완료']

function generateJwtSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const SetupWizard = () => {
  const navigate = useNavigate()
  const { refreshSettings } = useSettings()
  const [initializing, setInitializing] = useState(true)
  const [needsInfra, setNeedsInfra] = useState(false)
  const [onVercel, setOnVercel] = useState(false)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deployUrl, setDeployUrl] = useState('')
  const [waitingRedeploy, setWaitingRedeploy] = useState(false)

  const [infraForm, setInfraForm] = useState({
    databaseUrl: '',
    jwtSecret: generateJwtSecret(),
    vercelToken: '',
    supabaseProjectUrl: '',
  })

  const [form, setForm] = useState({
    schoolName: '',
    schoolLogoUrl: '',
    schoolPassword: '',
    schoolPasswordConfirm: '',
    adminPassword: '',
    adminPasswordConfirm: '',
    adminName: '',
    adminEmail: '',
  })

  const steps = useMemo(
    () => (needsInfra ? ['DB · 환경변수', ...SCHOOL_STEPS] : SCHOOL_STEPS),
    [needsInfra]
  )

  const schoolStep = needsInfra ? step - 1 : step

  useEffect(() => {
    getSetupStatus()
      .then((status) => {
        setNeedsInfra(status.needsInfra)
        setOnVercel(status.onVercel)
        if (!status.needsInfra) {
          setStep(0)
        }
      })
      .catch(() => {
        setError('설정 상태를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
      })
      .finally(() => setInitializing(false))
  }, [])

  const updateInfra = (field: keyof typeof infraForm, value: string) => {
    setInfraForm((prev) => ({ ...prev, [field]: value }))
    setError('')
  }

  const update = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError('')
  }

  const pollUntilDbConnected = async () => {
    setWaitingRedeploy(true)
    setError('')
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await sleep(3000)
      try {
        const status = await getSetupStatus()
        if (status.dbConnected) {
          setNeedsInfra(false)
          setWaitingRedeploy(false)
          setStep(1)
          return
        }
      } catch {
        // 재배포 중 일시적 오류는 무시하고 계속 폴링
      }
    }
    setWaitingRedeploy(false)
    setError('재배포가 아직 완료되지 않았습니다. 1~2분 후 새로고침하거나 다시 시도해주세요.')
  }

  const handleBootstrap = async () => {
    if (!infraForm.databaseUrl.trim()) {
      setError('Supabase DATABASE_URL을 입력해주세요.')
      return
    }
    if (infraForm.jwtSecret.length < 16) {
      setError('JWT_SECRET은 16자 이상이어야 합니다.')
      return
    }
    if (onVercel && !infraForm.vercelToken.trim()) {
      setError('Vercel 환경변수 자동 적용을 위해 Access Token을 입력해주세요.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = await bootstrapInfra({
        databaseUrl: infraForm.databaseUrl.trim(),
        jwtSecret: infraForm.jwtSecret,
        vercelToken: infraForm.vercelToken.trim() || undefined,
        supabaseProjectUrl: infraForm.supabaseProjectUrl.trim() || undefined,
      })

      if (result.dbConnected) {
        setNeedsInfra(false)
        setStep(1)
        return
      }

      if (result.redeployTriggered) {
        await pollUntilDbConnected()
        return
      }

      if (result.manualEnvRequired) {
        setError('Vercel Access Token 없이는 환경변수를 자동 적용할 수 없습니다. 토큰을 입력하거나 Vercel 대시보드에서 DATABASE_URL, JWT_SECRET을 수동 설정 후 재배포하세요.')
        return
      }

      setNeedsInfra(false)
      setStep(1)
    } catch (err: any) {
      setError(err.response?.data?.error || 'DB 연결 설정에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const nextStep = () => {
    setError('')

    if (needsInfra && step === 0) {
      void handleBootstrap()
      return
    }

    if (schoolStep === 0 && !form.schoolName.trim()) {
      setError('학교 이름을 입력해주세요.')
      return
    }

    if (schoolStep === 1) {
      if (form.schoolPassword.length < 4) {
        setError('교직원 초기 비밀번호는 4자 이상이어야 합니다.')
        return
      }
      if (form.schoolPassword !== form.schoolPasswordConfirm) {
        setError('교직원 비밀번호가 일치하지 않습니다.')
        return
      }
      if (form.adminPassword.length < 4) {
        setError('관리자 비밀번호는 4자 이상이어야 합니다.')
        return
      }
      if (form.adminPassword !== form.adminPasswordConfirm) {
        setError('관리자 비밀번호가 일치하지 않습니다.')
        return
      }
    }

    if (schoolStep === 2) {
      if (!form.adminName.trim() || !form.adminEmail.trim()) {
        setError('관리자 이름과 이메일을 입력해주세요.')
        return
      }
      void handleSubmit()
      return
    }

    setStep((prev) => prev + 1)
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await completeSetup({
        schoolName: form.schoolName.trim(),
        schoolLogoUrl: form.schoolLogoUrl.trim() || undefined,
        schoolPassword: form.schoolPassword,
        adminPassword: form.adminPassword,
        supabaseProjectUrl: infraForm.supabaseProjectUrl.trim() || undefined,
        adminName: form.adminName.trim(),
        adminEmail: form.adminEmail.trim(),
      })
      await refreshSettings()
      setDeployUrl(result.vercelAppUrl || window.location.origin)
      setStep(steps.length - 1)
    } catch (err: any) {
      setError(err.response?.data?.error || '초기 설정에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        설정 화면을 불러오는 중...
      </div>
    )
  }

  const isCompleteStep = step === steps.length - 1
  const showInfraStep = needsInfra && step === 0

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🏫</div>
          <h1 className="text-3xl font-extrabold text-gray-900">학교 연수관리 플랫폼 초기 설정</h1>
          <p className="text-gray-600 mt-2">
            GitHub 템플릿 복제 → Vercel 배포 후, 이 화면에서 DB와 학교 정보를 입력하면 완료됩니다.
          </p>
        </div>

        <div className="flex justify-between mb-6 gap-1">
          {steps.map((label, index) => (
            <div key={label} className="flex-1 text-center">
              <div
                className={`mx-auto w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  index <= step ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {index + 1}
              </div>
              <div
                className={`text-xs mt-1 hidden sm:block ${
                  index <= step ? 'text-indigo-700 font-medium' : 'text-gray-400'
                }`}
              >
                {label}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 sm:p-8">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {waitingRedeploy && (
            <div className="mb-4 bg-blue-50 border border-blue-300 text-blue-800 px-4 py-3 rounded-lg text-sm">
              Vercel에 환경변수를 적용하고 재배포 중입니다. 1~2분 정도 걸릴 수 있습니다...
            </div>
          )}

          {showInfraStep && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900">1. Supabase · Vercel 환경변수</h2>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
                <p className="font-semibold mb-1">Vercel 대시보드에서 환경변수를 직접 넣지 않아도 됩니다</p>
                <ul className="list-disc list-inside space-y-1 text-blue-800">
                  <li>Supabase에서 프로젝트 생성 → Connect → <strong>Session pooler</strong> URI 복사</li>
                  <li>Vercel → Account Settings → Tokens에서 Access Token 발급</li>
                  <li>아래에 붙여넣고 「연결 및 적용」을 누르면 자동으로 Vercel 환경변수에 등록됩니다</li>
                </ul>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supabase DATABASE_URL *</label>
                <textarea
                  value={infraForm.databaseUrl}
                  onChange={(e) => updateInfra('databaseUrl', e.target.value)}
                  placeholder="postgresql://postgres.<ref>:<password>@...pooler.supabase.com:5432/postgres?sslmode=require"
                  rows={3}
                  className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">JWT_SECRET *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={infraForm.jwtSecret}
                    onChange={(e) => updateInfra('jwtSecret', e.target.value)}
                    className="flex-1 rounded-lg border-2 border-gray-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => updateInfra('jwtSecret', generateJwtSecret())}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                  >
                    새로 생성
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vercel Access Token {onVercel ? '*' : '(Vercel 배포 시 필수)'}
                </label>
                <input
                  type="password"
                  value={infraForm.vercelToken}
                  onChange={(e) => updateInfra('vercelToken', e.target.value)}
                  placeholder="vercel_xxxxxxxx"
                  className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  <a
                    href="https://vercel.com/account/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline"
                  >
                    Vercel 토큰 발급 페이지
                  </a>
                  에서 Full Account 또는 해당 프로젝트 권한 토큰을 생성하세요.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supabase 프로젝트 URL (선택)</label>
                <input
                  type="url"
                  value={infraForm.supabaseProjectUrl}
                  onChange={(e) => updateInfra('supabaseProjectUrl', e.target.value)}
                  placeholder="https://xxxxx.supabase.co"
                  className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {!showInfraStep && schoolStep === 0 && !isCompleteStep && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900">학교 정보</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">학교 이름 *</label>
                <input
                  type="text"
                  value={form.schoolName}
                  onChange={(e) => update('schoolName', e.target.value)}
                  placeholder="예: OO초등학교"
                  className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">학교 로고 URL (선택)</label>
                <input
                  type="url"
                  value={form.schoolLogoUrl}
                  onChange={(e) => update('schoolLogoUrl', e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {!showInfraStep && schoolStep === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900">로그인 비밀번호</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">교직원 초기 비밀번호 *</label>
                <input
                  type="password"
                  value={form.schoolPassword}
                  onChange={(e) => update('schoolPassword', e.target.value)}
                  className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">교직원 초기 비밀번호 확인 *</label>
                <input
                  type="password"
                  value={form.schoolPasswordConfirm}
                  onChange={(e) => update('schoolPasswordConfirm', e.target.value)}
                  className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">관리자 비밀번호 *</label>
                <input
                  type="password"
                  value={form.adminPassword}
                  onChange={(e) => update('adminPassword', e.target.value)}
                  className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">관리자 비밀번호 확인 *</label>
                <input
                  type="password"
                  value={form.adminPasswordConfirm}
                  onChange={(e) => update('adminPasswordConfirm', e.target.value)}
                  className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {!showInfraStep && schoolStep === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900">최초 관리자 계정</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">관리자 이름 *</label>
                <input
                  type="text"
                  value={form.adminName}
                  onChange={(e) => update('adminName', e.target.value)}
                  placeholder="홍길동"
                  className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">관리자 이메일 *</label>
                <input
                  type="email"
                  value={form.adminEmail}
                  onChange={(e) => update('adminEmail', e.target.value)}
                  placeholder="admin@school.edu.kr"
                  className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {isCompleteStep && (
            <div className="text-center space-y-4">
              <div className="text-5xl">🎉</div>
              <h2 className="text-2xl font-bold text-gray-900">설정이 완료되었습니다!</h2>
              <p className="text-gray-600">
                <strong>{form.schoolName}</strong> 연수관리 플랫폼이 준비되었습니다.
              </p>
              {deployUrl && (
                <div className="bg-green-50 border border-green-300 rounded-xl p-4">
                  <p className="text-sm text-green-800 font-medium mb-2">학교 플랫폼 링크</p>
                  <a
                    href={deployUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-700 font-bold text-lg break-all hover:underline"
                  >
                    {deployUrl}
                  </a>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between mt-8 pt-4 border-t border-gray-100">
            {step > 0 && !isCompleteStep ? (
              <button
                type="button"
                onClick={() => setStep((prev) => prev - 1)}
                disabled={loading || waitingRedeploy}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                이전
              </button>
            ) : (
              <div />
            )}

            {!isCompleteStep ? (
              <button
                type="button"
                onClick={nextStep}
                disabled={loading || waitingRedeploy}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
              >
                {loading || waitingRedeploy
                  ? '적용 중...'
                  : showInfraStep
                    ? '연결 및 적용'
                    : schoolStep === 2
                      ? '설정 완료'
                      : '다음'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="ml-auto px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
              >
                로그인 페이지로 이동
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SetupWizard
