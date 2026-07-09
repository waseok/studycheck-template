import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { completeSetup } from '../api/settings'
import { useSettings } from '../contexts/SettingsContext'

const STEPS = ['학교 정보', '비밀번호', '관리자 계정', '완료']

const SetupWizard = () => {
  const navigate = useNavigate()
  const { refreshSettings } = useSettings()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deployUrl, setDeployUrl] = useState('')

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

  const update = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError('')
  }

  const nextStep = () => {
    setError('')

    if (step === 0 && !form.schoolName.trim()) {
      setError('학교 이름을 입력해주세요.')
      return
    }

    if (step === 1) {
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

    if (step === 2) {
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
        adminName: form.adminName.trim(),
        adminEmail: form.adminEmail.trim(),
      })
      await refreshSettings()
      setDeployUrl(result.vercelAppUrl || window.location.origin)
      setStep(STEPS.length - 1)
    } catch (err: any) {
      setError(err.response?.data?.error || '초기 설정에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const isCompleteStep = step === STEPS.length - 1

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🏫</div>
          <h1 className="text-3xl font-extrabold text-gray-900">학교 연수관리 플랫폼 초기 설정</h1>
          <p className="text-gray-600 mt-2">
            온보딩이 끝난 뒤, 학교 이름과 로그인 정보를 입력하면 학교 전용 사이트가 완성됩니다.
          </p>
        </div>

        <div className="flex justify-between mb-6 gap-1">
          {STEPS.map((label, index) => (
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

          {step === 0 && !isCompleteStep && (
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

          {step === 1 && (
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

          {step === 2 && (
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
                disabled={loading}
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
                disabled={loading}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
              >
                {loading ? '저장 중...' : step === 2 ? '설정 완료' : '다음'}
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
