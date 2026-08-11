import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TokenGuidePanel } from '../components/onboarding/TokenGuidePanel'
import {
  connectExistingGitHubRepo,
  connectExistingSupabase,
  connectGitHubRepo,
  connectVercelProject,
  createSupabaseProjectManaged,
  getOnboardingConfig,
  getOnboardingSession,
  getSupabaseResources,
  getVercelTeams,
  OnboardingSession,
  provisionOnboardingInfrastructure,
  startOnboardingSession,
} from '../api/onboarding'

const STORAGE_KEY = 'studycheck-onboarding-session'

const STEPS = ['GitHub', 'Vercel', 'Supabase', '배포', '학교 설정']

/** React child로 쓰기 안전한 문자열로 변환 (객체 렌더링 #31 방지) */
function toErrorText(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value && typeof value === 'object') {
    const obj = value as { message?: unknown; error?: unknown; detail?: unknown; code?: unknown }
    if (typeof obj.message === 'string' && obj.message.trim()) {
      return typeof obj.code === 'string' || typeof obj.code === 'number'
        ? `[${obj.code}] ${obj.message}`
        : obj.message
    }
    if (typeof obj.error === 'string' && obj.error.trim()) return obj.error
    if (typeof obj.detail === 'string' && obj.detail.trim()) return obj.detail
    try {
      return JSON.stringify(value)
    } catch {
      // ignore
    }
  }
  return fallback
}

function generateJwtSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function persistSessionToken(token: string) {
  localStorage.setItem(STORAGE_KEY, token)
}

function loadSessionToken(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

type ConfigState = Awaited<ReturnType<typeof getOnboardingConfig>>

const Onboarding = () => {
  const navigate = useNavigate()
  const [config, setConfig] = useState<ConfigState | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(loadSessionToken())
  const [session, setSession] = useState<OnboardingSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')

  const [githubForm, setGithubForm] = useState({
    repoName: 'my-school-studycheck',
    githubToken: '',
    visibility: 'private' as 'public' | 'private',
    existingRepoUrl: '',
  })
  const [githubMode, setGithubMode] = useState<'create' | 'existing'>('create')
  const [vercelForm, setVercelForm] = useState({
    vercelToken: '',
    teamId: '',
    projectName: '',
  })
  const [supabaseForm, setSupabaseForm] = useState({
    supabaseToken: '',
    organizationId: '',
    createProjectName: '',
    createRegion: 'ap-northeast-2',
    dbPassword: '',
    projectUrl: '',
    projectRef: '',
    databaseUrl: '',
  })
  const [deployForm, setDeployForm] = useState({
    jwtSecret: generateJwtSecret(),
  })
  const [vercelTeams, setVercelTeams] = useState<Array<{ id: string; slug: string; name: string }>>([])
  const [supabaseOrganizations, setSupabaseOrganizations] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true)
      try {
        const cfg = await getOnboardingConfig()
        setConfig(cfg)

        if (sessionToken) {
          try {
            const existing = await getOnboardingSession(sessionToken)
            setSession(existing.session)
            if (existing.session.repoName) {
              setGithubForm((prev) => ({ ...prev, repoName: existing.session.repoName || prev.repoName }))
            }
            if (existing.session.github?.repoUrl) {
              setGithubForm((prev) => ({
                ...prev,
                existingRepoUrl: existing.session.github?.repoUrl || prev.existingRepoUrl,
              }))
              setVercelForm((prev) => ({
                ...prev,
                projectName: prev.projectName || existing.session.repoName || existing.session.github?.repo || '',
              }))
            }
          } catch {
            localStorage.removeItem(STORAGE_KEY)
            setSessionToken(null)
          }
        }
      } catch (err: any) {
        const data = err?.response?.data
        setError(
          toErrorText(
            data?.error ?? data?.message ?? data,
            err?.message || '온보딩 설정을 불러오지 못했습니다.'
          )
        )
      } finally {
        setLoading(false)
      }
    }

    void bootstrap()
  }, [sessionToken])

  const activeStep = useMemo(() => {
    switch (session?.status) {
      case 'GITHUB_CONNECTED':
        return 1
      case 'VERCEL_CONNECTED':
        return 2
      case 'SUPABASE_CONNECTED':
        return 3
      case 'READY_FOR_SETUP':
        return 4
      default:
        return 0
    }
  }, [session?.status])

  const startSession = async () => {
    const created = await startOnboardingSession(githubForm.repoName.trim())
    persistSessionToken(created.sessionToken)
    setSessionToken(created.sessionToken)
    setSession(created.session)
    return created.sessionToken
  }

  const withSubmit = async (task: (token: string) => Promise<void>) => {
    setSubmitting(true)
    setError('')
    setHint('')
    try {
      const token = sessionToken || (await startSession())
      await task(token)
    } catch (err: any) {
      const data = err?.response?.data
      const message = toErrorText(
        data?.error ?? data?.message ?? data,
        err?.message || '요청을 처리하지 못했습니다.'
      )
      const detail = toErrorText(data?.detail, '')
      setError(detail && detail !== message ? `${message}\n${detail}` : message)
      // 에러가 화면 위쪽에만 있어 못 보는 경우 대비
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleGitHub = async () => {
    await withSubmit(async (token) => {
      const result = await connectGitHubRepo(token, githubForm)
      persistSessionToken(result.sessionToken)
      setSessionToken(result.sessionToken)
      setSession(result.session)
      setVercelForm((prev) => ({
        ...prev,
        projectName: result.session.repoName || githubForm.repoName,
      }))
      if (result.message) setHint(result.message)
    })
  }

  const handleConnectExistingGitHub = async () => {
    if (!githubForm.githubToken.trim()) {
      setError('GitHub 토큰을 입력해주세요.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (!githubForm.existingRepoUrl.trim()) {
      setError('기존 GitHub 저장소 URL 또는 owner/repo 를 입력해주세요.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    await withSubmit(async (token) => {
      const result = await connectExistingGitHubRepo(token, {
        githubToken: githubForm.githubToken.trim(),
        repoUrl: githubForm.existingRepoUrl.trim(),
      })
      persistSessionToken(result.sessionToken)
      setSessionToken(result.sessionToken)
      setSession(result.session)
      setVercelForm((prev) => ({
        ...prev,
        projectName: result.session.repoName || result.session.github?.repo || prev.projectName,
      }))
      if (result.message) setHint(result.message)
    })
  }

  const handleContinueFromGitHub = () => {
    if (!session?.github?.repoUrl) {
      setError('연결된 GitHub 저장소가 없습니다.')
      return
    }
    setError('')
    setHint(`1단계 완료 상태입니다. 아래 2단계 Vercel로 진행하세요. (${session.github.owner}/${session.github.repo})`)
    const el = document.getElementById('onboarding-step-vercel')
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleLoadVercelTeams = async () => {
    await withSubmit(async (token) => {
      const result = await getVercelTeams(token, vercelForm.vercelToken.trim())
      persistSessionToken(result.sessionToken)
      setSession(result.session)
      setVercelTeams(result.teams)
    })
  }

  const handleVercel = async () => {
    if (!session?.github?.repo) {
      setError('먼저 1단계 GitHub 저장소 생성을 완료해주세요.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (!vercelForm.vercelToken.trim()) {
      setError('Vercel 토큰을 입력해주세요.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    await withSubmit(async (token) => {
      const result = await connectVercelProject(token, {
        vercelToken: vercelForm.vercelToken.trim(),
        teamId: vercelForm.teamId || undefined,
        projectName: vercelForm.projectName || undefined,
      })
      persistSessionToken(result.sessionToken)
      setSessionToken(result.sessionToken)
      setSession(result.session)
      if (result.hint || result.message) {
        setHint(result.hint || result.message || '')
      }
    })
  }

  const handleLoadSupabaseResources = async () => {
    await withSubmit(async (token) => {
      const result = await getSupabaseResources(token, supabaseForm.supabaseToken.trim())
      persistSessionToken(result.sessionToken)
      setSession(result.session)
      setSupabaseOrganizations(result.organizations)
    })
  }

  const handleCreateSupabaseProject = async () => {
    await withSubmit(async (token) => {
      const result = await createSupabaseProjectManaged(token, {
        supabaseToken: supabaseForm.supabaseToken.trim(),
        organizationId: supabaseForm.organizationId,
        projectName: supabaseForm.createProjectName.trim(),
        region: supabaseForm.createRegion.trim(),
        dbPassword: supabaseForm.dbPassword,
      })
      persistSessionToken(result.sessionToken)
      setSessionToken(result.sessionToken)
      setSession(result.session)
      setHint(result.hint || '')
      setSupabaseForm((prev) => ({
        ...prev,
        projectRef: result.session.supabase?.projectRef || '',
        projectUrl: result.session.supabase?.projectUrl || '',
      }))
    })
  }

  const handleConnectSupabase = async () => {
    await withSubmit(async (token) => {
      const result = await connectExistingSupabase(token, {
        projectUrl: supabaseForm.projectUrl.trim() || undefined,
        projectRef: supabaseForm.projectRef.trim() || undefined,
        databaseUrl: supabaseForm.databaseUrl.trim(),
        region: supabaseForm.createRegion.trim() || undefined,
      })
      persistSessionToken(result.sessionToken)
      setSessionToken(result.sessionToken)
      setSession(result.session)
    })
  }

  const handleProvision = async () => {
    await withSubmit(async (token) => {
      const result = await provisionOnboardingInfrastructure(token, {
        jwtSecret: deployForm.jwtSecret.trim(),
      })
      persistSessionToken(result.sessionToken)
      setSessionToken(result.sessionToken)
      setSession(result.session)
      setHint(result.message || '')
    })
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">온보딩을 준비하는 중...</div>
  }

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-indigo-50 to-white px-4">
        <div className="max-w-md w-full rounded-2xl border border-red-200 bg-white p-6 shadow-lg text-center space-y-4">
          <h1 className="text-xl font-bold text-gray-900">온보딩을 불러오지 못했습니다</h1>
          <p className="text-sm text-red-700">{error || '서버 설정을 가져오지 못했습니다. 잠시 후 다시 시도해주세요.'}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900">학교 사이트 원클릭 온보딩</h1>
          <p className="text-gray-600 mt-2">
            GitHub 저장소 생성부터 Vercel 프로젝트, Supabase 연결, 첫 배포까지 이 화면에서 순서대로 진행합니다.
          </p>
        </div>

        <div className="grid grid-cols-5 gap-2 mb-8">
          {STEPS.map((label, index) => (
            <div key={label} className="text-center">
              <div className={`w-9 h-9 mx-auto rounded-full flex items-center justify-center font-bold ${index <= activeStep ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {index + 1}
              </div>
              <p className={`text-xs mt-2 ${index <= activeStep ? 'text-indigo-700 font-medium' : 'text-gray-400'}`}>{label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-6 space-y-6">
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">
              {error}
            </div>
          )}
          {hint && <div className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-800">{hint}</div>}
          {submitting && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
              요청을 처리하는 중입니다. 잠시만 기다려주세요...
            </div>
          )}

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-gray-900">1. GitHub 템플릿 복제 (필수 · 먼저)</h2>
            <p className="text-sm text-gray-600">
              이미 만든 저장소가 있으면 <strong>다시 만들 필요 없습니다.</strong> 아래에서 기존 저장소를 연결하거나, 완료된 1단계를 그대로 사용하세요.
            </p>

            {session?.github?.repoUrl && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 space-y-2">
                <p className="text-sm text-green-800 font-medium">
                  ✓ 1단계 완료:{' '}
                  <a className="underline" href={session.github.repoUrl} target="_blank" rel="noreferrer">
                    {session.github.owner}/{session.github.repo}
                  </a>
                </p>
                <button
                  type="button"
                  onClick={handleContinueFromGitHub}
                  className="px-4 py-2 rounded-lg bg-green-700 text-white text-sm hover:bg-green-800"
                >
                  재생성 없이 2단계로 계속
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2 text-sm">
              <button
                type="button"
                onClick={() => setGithubMode('create')}
                className={`px-3 py-1.5 rounded-lg border ${githubMode === 'create' ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-gray-300 text-gray-600'}`}
              >
                새로 생성
              </button>
              <button
                type="button"
                onClick={() => setGithubMode('existing')}
                className={`px-3 py-1.5 rounded-lg border ${githubMode === 'existing' ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-gray-300 text-gray-600'}`}
              >
                기존 저장소 연결
              </button>
            </div>

            <TokenGuidePanel guideId="github" />
            <input
              type="password"
              value={githubForm.githubToken}
              onChange={(e) => setGithubForm((prev) => ({ ...prev, githubToken: e.target.value }))}
              placeholder="GitHub token (repo 권한)"
              className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
            />

            {githubMode === 'create' ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <input
                    value={githubForm.repoName}
                    onChange={(e) => setGithubForm((prev) => ({ ...prev, repoName: e.target.value }))}
                    placeholder="새 저장소 이름"
                    className="rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                  />
                  <select
                    value={githubForm.visibility}
                    onChange={(e) => setGithubForm((prev) => ({ ...prev, visibility: e.target.value as 'public' | 'private' }))}
                    className="rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="private">private</option>
                    <option value="public">public</option>
                  </select>
                </div>
                <button type="button" onClick={handleGitHub} disabled={submitting || !githubForm.githubToken.trim()} className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                  {submitting ? '처리 중...' : session?.github?.repoUrl ? '이미 연결됨 (누르면 재사용)' : 'GitHub 저장소 생성'}
                </button>
                <p className="text-xs text-gray-500">같은 이름이 이미 있으면 새로 만들지 않고 그 저장소에 연결합니다.</p>
              </>
            ) : (
              <>
                <input
                  value={githubForm.existingRepoUrl}
                  onChange={(e) => setGithubForm((prev) => ({ ...prev, existingRepoUrl: e.target.value }))}
                  placeholder="https://github.com/owner/repo 또는 owner/repo"
                  className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                />
                <button type="button" onClick={handleConnectExistingGitHub} disabled={submitting || !githubForm.githubToken.trim()} className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                  {submitting ? '연결 중...' : '기존 저장소 연결'}
                </button>
              </>
            )}
          </section>

          <section id="onboarding-step-vercel" className="space-y-3 border-t border-gray-100 pt-6">
            <h2 className="text-xl font-bold text-gray-900">2. Vercel 프로젝트 연결</h2>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 space-y-1">
              <p className="font-medium">진행 상태</p>
              <p>
                {session?.github?.owner && session?.github?.repo
                  ? `✓ GitHub: ${session.github.owner}/${session.github.repo}`
                  : '○ 1단계 GitHub 저장소 연결 필요'}
              </p>
              <p>{vercelForm.vercelToken.trim() ? '✓ Vercel 토큰 입력됨' : '○ Vercel 토큰 입력'}</p>
              <p className="text-xs text-gray-500 pt-1">
                「팀 목록 불러오기」는 GitHub 연결이 아닙니다. 개인 계정이면 건너뛰어도 됩니다.
              </p>
            </div>
            <TokenGuidePanel guideId="vercel" />
            <input
              type="password"
              value={vercelForm.vercelToken}
              onChange={(e) => setVercelForm((prev) => ({ ...prev, vercelToken: e.target.value }))}
              placeholder="Vercel token"
              className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
            />
            <div className="flex flex-wrap gap-2 items-center">
              <button type="button" onClick={handleLoadVercelTeams} disabled={submitting || !vercelForm.vercelToken.trim()} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50">
                팀 목록 불러오기 (선택)
              </button>
              <span className="text-xs text-gray-500">개인 계정이면 안 눌러도 됨</span>
              {vercelTeams.length > 0 && (
                <select
                  value={vercelForm.teamId}
                  onChange={(e) => setVercelForm((prev) => ({ ...prev, teamId: e.target.value }))}
                  className="rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">개인 계정 사용</option>
                  {vercelTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <input
              value={vercelForm.projectName}
              onChange={(e) => setVercelForm((prev) => ({ ...prev, projectName: e.target.value }))}
              placeholder="Vercel 프로젝트 이름 (소문자/숫자/하이픈)"
              className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
            />
            <p className="text-xs text-gray-500">
              프로젝트 이름은 자동으로 소문자·하이픈 형식으로 정리됩니다. Vercel 계정에 GitHub가 연결되어 있어야 저장소가 붙습니다.
            </p>
            <button
              type="button"
              onClick={handleVercel}
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? '생성 중... (최대 1분)' : 'Vercel 프로젝트 생성'}
            </button>
            {(!session?.github?.repo || !vercelForm.vercelToken.trim()) && (
              <p className="text-xs text-amber-700">
                {!session?.github?.repo
                  ? '아직 GitHub 저장소 생성이 완료되지 않았습니다.'
                  : 'Vercel 토큰을 입력한 뒤 버튼을 눌러주세요.'}
              </p>
            )}
            {session?.vercel?.projectId && (
              <p className="text-sm text-green-700">
                ✓ Vercel 프로젝트 연결 완료: {session.vercel.projectName}
              </p>
            )}
          </section>

          <section className="space-y-3 border-t border-gray-100 pt-6">
            <h2 className="text-xl font-bold text-gray-900">3. Supabase 연결</h2>
            <p className="text-sm text-gray-600">완전 자동 생성이 어려울 수 있어, 관리 토큰으로 프로젝트를 만들거나 기존 Session pooler URI를 직접 연결할 수 있습니다.</p>
            <TokenGuidePanel guideId="supabase-token" />
            <input
              type="password"
              value={supabaseForm.supabaseToken}
              onChange={(e) => setSupabaseForm((prev) => ({ ...prev, supabaseToken: e.target.value }))}
              placeholder="Supabase management token (선택)"
              className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleLoadSupabaseResources} disabled={submitting || !supabaseForm.supabaseToken} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50">
                조직 목록 불러오기
              </button>
              {supabaseOrganizations.length > 0 && (
                <select
                  value={supabaseForm.organizationId}
                  onChange={(e) => setSupabaseForm((prev) => ({ ...prev, organizationId: e.target.value }))}
                  className="rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">조직 선택</option>
                  {supabaseOrganizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                value={supabaseForm.createProjectName}
                onChange={(e) => setSupabaseForm((prev) => ({ ...prev, createProjectName: e.target.value }))}
                placeholder="새 Supabase 프로젝트명"
                className="rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
              />
              <input
                value={supabaseForm.createRegion}
                onChange={(e) => setSupabaseForm((prev) => ({ ...prev, createRegion: e.target.value }))}
                placeholder="region (예: ap-northeast-2)"
                className="rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
              />
              <input
                type="password"
                value={supabaseForm.dbPassword}
                onChange={(e) => setSupabaseForm((prev) => ({ ...prev, dbPassword: e.target.value }))}
                placeholder="DB 비밀번호"
                className="rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <button type="button" onClick={handleCreateSupabaseProject} disabled={submitting || !supabaseForm.supabaseToken || !supabaseForm.organizationId} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50">
              Supabase 프로젝트 생성
            </button>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={supabaseForm.projectUrl}
                onChange={(e) => setSupabaseForm((prev) => ({ ...prev, projectUrl: e.target.value }))}
                placeholder="Supabase 프로젝트 URL"
                className="rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
              />
              <input
                value={supabaseForm.projectRef}
                onChange={(e) => setSupabaseForm((prev) => ({ ...prev, projectRef: e.target.value }))}
                placeholder="project ref"
                className="rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <TokenGuidePanel guideId="supabase-database" />
            <textarea
              value={supabaseForm.databaseUrl}
              onChange={(e) => setSupabaseForm((prev) => ({ ...prev, databaseUrl: e.target.value }))}
              placeholder="Session pooler DATABASE_URL"
              rows={3}
              className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none"
            />
            <button type="button" onClick={handleConnectSupabase} disabled={submitting || !supabaseForm.databaseUrl} className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              Supabase 연결 확인
            </button>
            {session?.supabase?.databaseUrl && <p className="text-sm text-green-700">Supabase 연결 완료</p>}
          </section>

          <section className="space-y-3 border-t border-gray-100 pt-6">
            <h2 className="text-xl font-bold text-gray-900">4. 환경변수 주입 및 첫 배포</h2>
            <input
              value={deployForm.jwtSecret}
              onChange={(e) => setDeployForm({ jwtSecret: e.target.value })}
              placeholder="JWT_SECRET"
              className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none"
            />
            <button type="button" onClick={handleProvision} disabled={submitting || !session?.supabase?.databaseUrl || !session?.vercel?.projectId} className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              Vercel 환경변수 주입 + 재배포
            </button>
            {session?.vercel?.deploymentUrl && <p className="text-sm text-green-700">배포 주소: <a className="underline" href={session.vercel.deploymentUrl} target="_blank" rel="noreferrer">{session.vercel.deploymentUrl}</a></p>}
          </section>

          <section className="space-y-3 border-t border-gray-100 pt-6">
            <h2 className="text-xl font-bold text-gray-900">5. 학교 정보 설정</h2>
            <p className="text-sm text-gray-600">인프라 연결이 끝나면 기존 `/setup` 화면에서 학교 이름, 비밀번호, 관리자 계정을 마무리합니다.</p>
            <button
              type="button"
              onClick={() => navigate('/setup')}
              disabled={session?.status !== 'READY_FOR_SETUP'}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              학교 정보 설정으로 이동
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}

export default Onboarding
