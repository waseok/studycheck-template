import { useEffect, useMemo, useRef, useState } from 'react'
import { TokenGuidePanel } from '../components/onboarding/TokenGuidePanel'
import {
  connectExistingGitHubRepo,
  connectExistingSupabase,
  connectExistingVercelProject,
  connectGitHubRepo,
  connectVercelProject,
  createSupabaseProjectManaged,
  getOnboardingConfig,
  getOnboardingSession,
  getSupabaseResources,
  getVercelTeams,
  OnboardingSession,
  provisionOnboardingInfrastructure,
  relinkVercelGit,
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

/** 5단계 진단 결과 한 줄 */
interface SetupDiagItem {
  label: string
  state: 'ok' | 'fail' | 'warn'
  detail?: string
}

const Onboarding = () => {
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
  // 재방문 사용자가 실수로 저장소를 다시 만들지 않도록 기존 연결을 기본값으로 둡니다.
  const [githubMode, setGithubMode] = useState<'create' | 'existing'>('existing')
  const [vercelForm, setVercelForm] = useState({
    vercelToken: '',
    teamId: '',
    projectName: '',
    existingProject: '',
  })
  const [vercelMode, setVercelMode] = useState<'create' | 'existing'>('existing')
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
  const [vercelGitPending, setVercelGitPending] = useState<{ installUrl: string } | null>(null)
  const [vercelGitRetrying, setVercelGitRetrying] = useState(false)
  const [setupDiag, setSetupDiag] = useState<{ checking: boolean; items: SetupDiagItem[] } | null>(null)
  const [deploymentModal, setDeploymentModal] = useState({
    open: false,
    message: '',
    startedAt: 0,
  })
  const [deploymentElapsedSeconds, setDeploymentElapsedSeconds] = useState(0)
  const vercelRelinkPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const vercelRelinkBusyRef = useRef(false)
  const vercelFocusHandlerRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!deploymentModal.open) {
      setDeploymentElapsedSeconds(0)
      return
    }

    const updateElapsed = () => {
      setDeploymentElapsedSeconds(Math.floor((Date.now() - deploymentModal.startedAt) / 1000))
    }
    updateElapsed()
    const timer = window.setInterval(updateElapsed, 1000)
    return () => window.clearInterval(timer)
  }, [deploymentModal.open, deploymentModal.startedAt])

  const stopVercelRelinkPolling = () => {
    if (vercelRelinkPollRef.current) {
      clearInterval(vercelRelinkPollRef.current)
      vercelRelinkPollRef.current = null
    }
    if (vercelFocusHandlerRef.current) {
      window.removeEventListener('focus', vercelFocusHandlerRef.current)
      vercelFocusHandlerRef.current = null
    }
  }

  const tryRelinkVercelGit = async (opts?: { silent?: boolean }) => {
    const token = sessionToken || loadSessionToken()
    if (!token || vercelRelinkBusyRef.current) return false
    if (!vercelForm.vercelToken.trim() && !session?.vercel?.projectId) return false

    vercelRelinkBusyRef.current = true
    if (!opts?.silent) setVercelGitRetrying(true)
    try {
      const result = await relinkVercelGit(token, {
        vercelToken: vercelForm.vercelToken.trim() || undefined,
        teamId: vercelForm.teamId || undefined,
        projectName: vercelForm.projectName || undefined,
      })
      persistSessionToken(result.sessionToken)
      setSessionToken(result.sessionToken)
      setSession(result.session)

      if (result.gitLinked) {
        stopVercelRelinkPolling()
        setVercelGitPending(null)
        setHint(result.message || 'GitHub 저장소가 Vercel에 연결되었습니다.')
        setError('')
        return true
      }

      if (result.installUrl) {
        setVercelGitPending({ installUrl: result.installUrl })
      }
      if (!opts?.silent) {
        setHint(
          result.message ||
            result.hint ||
            '아직 GitHub 앱 설치가 반영되지 않았습니다. 잠시 후 다시 시도합니다.'
        )
      }
      return false
    } catch (err) {
      if (!opts?.silent) {
        setError(toErrorText(err, 'Git 재연결에 실패했습니다.'))
      }
      return false
    } finally {
      vercelRelinkBusyRef.current = false
      if (!opts?.silent) setVercelGitRetrying(false)
    }
  }

  const startVercelRelinkPolling = (installUrl: string) => {
    setVercelGitPending({ installUrl })
    stopVercelRelinkPolling()

    const onFocus = () => {
      void tryRelinkVercelGit({ silent: true })
    }
    vercelFocusHandlerRef.current = onFocus
    window.addEventListener('focus', onFocus)

    let attempts = 0
    vercelRelinkPollRef.current = setInterval(() => {
      attempts += 1
      if (attempts > 40) {
        stopVercelRelinkPolling()
        setHint('GitHub 앱 설치 대기 시간이 지났습니다. 「Git 다시 연결」을 눌러 재시도해주세요.')
        return
      }
      void tryRelinkVercelGit({ silent: true })
    }, 3000)
  }

  useEffect(() => {
    return () => {
      stopVercelRelinkPolling()
    }
  }, [])

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

      if (result.gitLinked) {
        stopVercelRelinkPolling()
        setVercelGitPending(null)
        setHint(result.message || 'Vercel 프로젝트와 GitHub 저장소가 연결되었습니다.')
        return
      }

      const installUrl = result.installUrl || 'https://github.com/apps/vercel/installations/new'
      setHint(
        result.hint ||
          result.message ||
          'Vercel GitHub 앱 설치가 필요합니다. 설치 창을 연 뒤 자동으로 다시 연결합니다.'
      )
      window.open(installUrl, 'vercel-github-app', 'popup=yes,width=1100,height=900')
      startVercelRelinkPolling(installUrl)
    })
  }

  const handleConnectExistingVercel = async () => {
    if (!session?.github?.repo) {
      setError('먼저 1단계에서 기존 GitHub 저장소를 연결해주세요.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (!vercelForm.vercelToken.trim()) {
      setError('Vercel 토큰을 입력해주세요.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (!vercelForm.existingProject.trim()) {
      setError('기존 Vercel 프로젝트 이름 또는 Project ID를 입력해주세요.')
      return
    }

    await withSubmit(async (token) => {
      const result = await connectExistingVercelProject(token, {
        vercelToken: vercelForm.vercelToken.trim(),
        teamId: vercelForm.teamId || undefined,
        projectIdOrName: vercelForm.existingProject.trim(),
      })
      persistSessionToken(result.sessionToken)
      setSessionToken(result.sessionToken)
      setSession(result.session)
      setHint(result.message || '기존 Vercel 프로젝트에 연결했습니다.')
      setError('')

      if (!result.gitLinked) {
        setVercelGitPending({
          installUrl: 'https://github.com/apps/vercel/installations/new',
        })
      } else {
        stopVercelRelinkPolling()
        setVercelGitPending(null)
      }
    })
  }

  const handleInstallVercelGitHubApp = () => {
    const url = vercelGitPending?.installUrl || 'https://github.com/apps/vercel/installations/new'
    window.open(url, 'vercel-github-app', 'popup=yes,width=1100,height=900')
    startVercelRelinkPolling(url)
    setHint('설치가 끝나면 이 창으로 돌아와 주세요. 자동으로 Git 연결을 다시 시도합니다.')
  }

  const handleRelinkVercelGit = async () => {
    setError('')
    await tryRelinkVercelGit()
  }

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
                existingProject:
                  prev.existingProject ||
                  existing.session.vercel?.projectName ||
                  existing.session.repoName ||
                  existing.session.github?.repo ||
                  '',
                teamId: prev.teamId || existing.session.vercel?.teamId || '',
              }))
            }
            if (existing.session.vercel?.projectId && !existing.session.vercel?.gitLinked) {
              const installUrl = 'https://github.com/apps/vercel/installations/new'
              setVercelGitPending({ installUrl })
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
      // detail에 더 구체적인 원인이 있으면 함께/우선 표시
      const combined =
        detail && detail !== message
          ? detail.length >= message.length
            ? detail
            : `${message}\n${detail}`
          : message
      setError(combined)
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
        existingProject: prev.existingProject || result.session.repoName || githubForm.repoName,
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
        existingProject:
          prev.existingProject || result.session.repoName || result.session.github?.repo || '',
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
    const databaseUrl = supabaseForm.databaseUrl.trim()
    if (!databaseUrl) {
      setError('Supabase Transaction 또는 Session pooler DATABASE_URL을 입력해주세요.')
      return
    }
    if (/\[?YOUR-PASSWORD\]?/i.test(databaseUrl)) {
      setError(
        '복사한 주소의 [YOUR-PASSWORD]를 실제 Supabase 데이터베이스 비밀번호로 바꿔주세요. 특수문자가 있으면 URL 인코딩이 필요합니다.'
      )
      return
    }

    await withSubmit(async (token) => {
      const result = await connectExistingSupabase(token, {
        projectUrl: supabaseForm.projectUrl.trim() || undefined,
        projectRef: supabaseForm.projectRef.trim() || undefined,
        databaseUrl,
        region: supabaseForm.createRegion.trim() || undefined,
      })
      persistSessionToken(result.sessionToken)
      setSessionToken(result.sessionToken)
      setSession(result.session)
    })
  }

  /**
   * Git webhook 배포는 provision API가 끝난 뒤에도 계속될 수 있습니다.
   * 학교 사이트의 경량 상태 API가 DB 연결까지 성공할 때까지 최대 5분간 확인합니다.
   */
  const waitForSchoolDeployment = async (deploymentUrl?: string): Promise<boolean> => {
    const base = (deploymentUrl || '').replace(/\/+$/, '')
    if (!base) return false

    const deadline = Date.now() + 5 * 60 * 1000
    setDeploymentModal((prev) => ({
      ...prev,
      message: '배포 요청이 Vercel에 전달됐습니다. 새 빌드가 시작되기를 기다리고 있습니다.',
    }))
    // Git webhook 등록 직후에는 이전 Production 응답이 잠시 유지될 수 있습니다.
    await new Promise((resolve) => window.setTimeout(resolve, 12_000))

    while (Date.now() < deadline) {
      setDeploymentModal((prev) => ({
        ...prev,
        message: 'Vercel이 새 코드를 빌드하고 학교 사이트를 시작하는 중입니다.',
      }))

      try {
        const response = await fetch(`${base}/api/settings/status`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(15_000),
        })
        if (response.ok) {
          const status = (await response.json()) as {
            dbConnected?: boolean
            hasDatabaseUrl?: boolean
          }
          if (status.hasDatabaseUrl && status.dbConnected) return true
        }
      } catch {
        // 배포 중에는 404, 5xx, 네트워크 단절이 정상적으로 잠시 발생할 수 있습니다.
      }

      await new Promise((resolve) => window.setTimeout(resolve, 8_000))
    }
    return false
  }

  const handleProvision = async () => {
    setDeploymentModal({
      open: true,
      message: '환경변수를 안전하게 저장하고 최신 코드를 준비하고 있습니다.',
      startedAt: Date.now(),
    })

    try {
      await withSubmit(async (token) => {
        const result = await provisionOnboardingInfrastructure(token, {
          jwtSecret: deployForm.jwtSecret.trim(),
        })
        persistSessionToken(result.sessionToken)
        setSessionToken(result.sessionToken)
        setSession(result.session)

        const ready = await waitForSchoolDeployment(result.session.vercel?.deploymentUrl)
        if (ready) {
          setDeploymentModal((prev) => ({
            ...prev,
            message: '준비가 완료됐습니다! 이제 학교 정보를 설정할 수 있습니다.',
          }))
          await new Promise((resolve) => window.setTimeout(resolve, 1_200))
        }
        setHint(
          ready
            ? '배포가 완료되었습니다. 5단계에서 학교 정보 설정으로 이동하세요.'
            : '배포 요청은 완료됐지만 5분 안에 준비 상태를 확인하지 못했습니다. Vercel 배포가 Ready가 된 뒤 5단계에서 다시 확인해주세요.'
        )
      })
    } finally {
      setDeploymentModal((prev) => ({ ...prev, open: false }))
    }
  }

  /**
   * 5단계: 학교 사이트 상태를 진단하고, 준비됐으면 학교 사이트의 /setup 을 새 탭으로 엽니다.
   * (학교 정보 설정은 이 온보딩 사이트가 아니라 "새로 배포된 학교 사이트"에서 진행합니다)
   */
  const handleGoToSchoolSetup = async () => {
    const base = (session?.vercel?.deploymentUrl || '').replace(/\/+$/, '')
    if (!base) {
      setSetupDiag({
        checking: false,
        items: [
          {
            label: '학교 사이트 배포 주소',
            state: 'fail',
            detail: '4단계 배포가 아직 완료되지 않았습니다. 「Vercel 환경변수 주입 + 재배포」를 먼저 실행해주세요.',
          },
        ],
      })
      return
    }

    setSetupDiag({ checking: true, items: [] })
    const items: SetupDiagItem[] = [{ label: '학교 사이트 배포 주소', state: 'ok', detail: base }]

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 15000)
      const response = await fetch(`${base}/api/settings/status`, { signal: controller.signal })
      clearTimeout(timer)

      if (!response.ok) {
        items.push({
          label: '학교 API 응답',
          state: 'fail',
          detail: `HTTP ${response.status} — 배포가 진행 중이거나 실패했을 수 있습니다. Vercel 대시보드에서 최신 배포가 Ready 인지 확인한 뒤 다시 시도해주세요.`,
        })
      } else {
        const status = (await response.json()) as {
          dbConnected?: boolean
          setupCompleted?: boolean
          hasDatabaseUrl?: boolean
          reason?: string
          dbError?: string
        }
        items.push({ label: '학교 API 응답', state: 'ok' })

        if (status.dbConnected) {
          items.push({ label: '데이터베이스 연결', state: 'ok' })
          if (status.setupCompleted) {
            items.push({
              label: '학교 정보 설정',
              state: 'warn',
              detail: '이미 설정이 완료된 사이트입니다. 로그인 화면을 새 탭으로 엽니다.',
            })
            window.open(`${base}/login`, '_blank', 'noopener')
          } else {
            // DB 상태만 확인하면 setup 함수의 번들 오류를 놓칠 수 있으므로
            // 실제 setup 함수가 로드되는지 별도의 경량 GET으로 검증합니다.
            const setupResponse = await fetch(`${base}/api/settings/setup`, {
              method: 'GET',
              cache: 'no-store',
              signal: AbortSignal.timeout(15_000),
            })
            const setupProbe = setupResponse.ok
              ? ((await setupResponse.json()) as { ready?: boolean })
              : undefined

            if (setupResponse.ok && setupProbe?.ready) {
              items.push({ label: '초기 설정 API', state: 'ok', detail: '설정 화면을 새 탭으로 엽니다.' })
              window.open(`${base}/setup`, '_blank', 'noopener')
            } else {
              items.push({
                label: '초기 설정 API',
                state: 'fail',
                detail:
                  `HTTP ${setupResponse.status} — 최신 setup 함수가 아직 배포되지 않았습니다. ` +
                  '4단계를 다시 실행한 뒤 학교 프로젝트의 최신 배포가 Ready가 되면 재확인해주세요.',
              })
            }
          }
        } else if (status.hasDatabaseUrl === false || status.reason === 'missing_DATABASE_URL') {
          items.push({
            label: '데이터베이스 연결',
            state: 'fail',
            detail:
              '프로젝트 Settings에는 DATABASE_URL이 있어도, 현재 Production 배포 런타임에는 없습니다. 4단계 「Vercel 환경변수 주입 + 재배포」를 다시 실행해 env가 붙은 배포가 Ready가 될 때까지 기다린 뒤 다시 확인해주세요. (Vercel 대시보드 → Deployments → Redeploy도 동일)',
          })
        } else {
          items.push({
            label: '데이터베이스 연결',
            state: 'fail',
            detail:
              `DATABASE_URL은 있지만 DB에 연결하지 못했습니다.${status.dbError ? ` (${status.dbError})` : ''} ` +
              'Supabase Connect → Direct → Transaction pooler(6543, 권장) 또는 Session pooler(5432) URI와 실제 DB 비밀번호를 확인한 뒤 3단계부터 다시 진행해주세요.',
          })
        }
      }
    } catch {
      items.push({
        label: '학교 API 응답',
        state: 'fail',
        detail:
          '응답이 없거나 시간이 초과됐습니다. 배포가 아직 진행 중일 수 있으니 1~2분 뒤 다시 시도해주세요. (예전 버전으로 배포된 사이트라면 4단계를 다시 실행해 최신 코드로 재배포해야 합니다)',
      })
    }

    setSetupDiag({ checking: false, items })
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
    <>
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
              <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-sm font-medium text-indigo-900">기존 저장소 연결 방법</p>
                <ol className="list-decimal space-y-1 pl-5 text-xs text-indigo-800">
                  <li>
                    위에 GitHub 토큰을 입력합니다. 기존 저장소 확인과 최신 템플릿 코드
                    동기화에 <strong>repo 쓰기 권한</strong>이 필요합니다.
                  </li>
                  <li>
                    아래에 저장소 주소(예: https://github.com/계정/my-school-studycheck)를
                    붙여 넣습니다.
                  </li>
                  <li>「기존 저장소 연결」을 누르면 새 저장소를 만들지 않고 그대로 이어갑니다.</li>
                </ol>
                <input
                  value={githubForm.existingRepoUrl}
                  onChange={(e) => setGithubForm((prev) => ({ ...prev, existingRepoUrl: e.target.value }))}
                  placeholder="https://github.com/owner/repo 또는 owner/repo"
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-3 py-2 focus:border-indigo-500 focus:outline-none"
                />
                {(!githubForm.githubToken.trim() || !githubForm.existingRepoUrl.trim()) && (
                  <p className="text-xs text-amber-700">
                    {!githubForm.githubToken.trim()
                      ? '먼저 위 GitHub 토큰을 입력해주세요. 링크만으로는 저장소를 수정·동기화할 권한을 확인할 수 없습니다.'
                      : '이제 기존 저장소 링크를 입력해주세요.'}
                  </p>
                )}
                <button type="button" onClick={handleConnectExistingGitHub} disabled={submitting} className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                  {submitting ? '연결 중...' : '기존 저장소 연결'}
                </button>
              </div>
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
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVercelMode('existing')}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  vercelMode === 'existing'
                    ? 'bg-indigo-600 text-white'
                    : 'border border-gray-300 bg-white text-gray-700'
                }`}
              >
                기존 프로젝트 연결
              </button>
              <button
                type="button"
                onClick={() => setVercelMode('create')}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  vercelMode === 'create'
                    ? 'bg-indigo-600 text-white'
                    : 'border border-gray-300 bg-white text-gray-700'
                }`}
              >
                새 프로젝트 생성
              </button>
            </div>

            {vercelMode === 'existing' ? (
              <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-sm text-indigo-900">
                  어제 만든 프로젝트가 있다면 새로 만들지 말고 프로젝트 이름을 입력하세요.
                  Vercel 대시보드의 프로젝트 카드에 표시되는 이름입니다.
                </p>
                <input
                  value={vercelForm.existingProject}
                  onChange={(e) =>
                    setVercelForm((prev) => ({ ...prev, existingProject: e.target.value }))
                  }
                  placeholder="예: my-school-studycheck (또는 prj_로 시작하는 Project ID)"
                  className="w-full rounded-lg border-2 border-gray-300 bg-white px-3 py-2 focus:border-indigo-500 focus:outline-none"
                />
                {(!vercelForm.vercelToken.trim() || !vercelForm.existingProject.trim()) && (
                  <p className="text-xs text-amber-700">
                    {!vercelForm.vercelToken.trim()
                      ? '먼저 위 Vercel 토큰을 입력해주세요. 프로젝트 조회·환경변수 반영에는 계정 권한이 필요합니다.'
                      : '이제 기존 Vercel 프로젝트 이름 또는 Project ID를 입력해주세요.'}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleConnectExistingVercel}
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? '연결 확인 중...' : '기존 Vercel 프로젝트 연결'}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  value={vercelForm.projectName}
                  onChange={(e) =>
                    setVercelForm((prev) => ({ ...prev, projectName: e.target.value }))
                  }
                  placeholder="새 Vercel 프로젝트 이름 (소문자/숫자/하이픈)"
                  className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                />
                <p className="text-xs text-gray-500">
                  정말 새 프로젝트가 필요할 때만 사용하세요. 이름은 자동으로 소문자·하이픈
                  형식으로 정리됩니다.
                </p>
                <button
                  type="button"
                  onClick={handleVercel}
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? '생성 중... (최대 1분)' : '새 Vercel 프로젝트 생성'}
                </button>
              </div>
            )}
            {(!session?.github?.repo || !vercelForm.vercelToken.trim()) && (
              <p className="text-xs text-amber-700">
                {!session?.github?.repo
                  ? '아직 GitHub 저장소 생성이 완료되지 않았습니다.'
                  : 'Vercel 토큰을 입력한 뒤 버튼을 눌러주세요.'}
              </p>
            )}
            {session?.vercel?.projectId && (
              <div className="space-y-2">
                <p className={`text-sm ${session.vercel.gitLinked ? 'text-green-700' : 'text-amber-700'}`}>
                  {session.vercel.gitLinked
                    ? `✓ Vercel + GitHub 연결 완료: ${session.vercel.projectName}`
                    : `△ Vercel 프로젝트는 생성됨 (${session.vercel.projectName}) — GitHub 연결 대기 중`}
                </p>
                {(vercelGitPending || (session.vercel.projectId && !session.vercel.gitLinked)) && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
                    <p className="text-sm text-amber-900">
                      Vercel이 저장소를 보려면 <strong>해당 GitHub 계정/조직</strong>에 Vercel 앱이 설치되어야 합니다.
                      설치 후 이 페이지가 자동으로 다시 연결을 시도합니다.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleInstallVercelGitHubApp}
                        className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm hover:bg-gray-800"
                      >
                        Vercel GitHub 앱 설치
                      </button>
                      <button
                        type="button"
                        onClick={handleRelinkVercelGit}
                        disabled={submitting || vercelGitRetrying}
                        className="px-4 py-2 rounded-lg border border-amber-400 bg-white text-sm text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {vercelGitRetrying ? '연결 재시도 중...' : 'Git 다시 연결'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="space-y-3 border-t border-gray-100 pt-6">
            <h2 className="text-xl font-bold text-gray-900">3. Supabase 연결</h2>
            <p className="text-sm text-gray-600">
              무료 티어를 이미 쓰신 경우 <strong>새 프로젝트를 만들지 마세요.</strong> 아래 「기존 프로젝트 연결」에 DATABASE_URL만 넣으면 됩니다.
            </p>

            <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-3 space-y-3">
              <div>
                <p className="text-sm font-semibold text-indigo-950">기존 프로젝트 연결 (추천)</p>
                <p className="text-xs text-indigo-900/80 mt-1">
                  필수 값은 Pooler DATABASE_URL 하나입니다. Vercel에는 Transaction pooler(6543)를 권장하며 Session pooler(5432)도 지원합니다. 프로젝트 URL·ref는 선택입니다.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">프로젝트 URL (선택)</label>
                  <input
                    value={supabaseForm.projectUrl}
                    onChange={(e) => {
                      const projectUrl = e.target.value
                      const match = projectUrl.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)
                      setSupabaseForm((prev) => ({
                        ...prev,
                        projectUrl,
                        // URL을 붙이면 ref를 자동으로 채움 (예: abcdxyz.supabase.co → abcdxyz)
                        projectRef: match?.[1] || prev.projectRef,
                      }))
                    }}
                    placeholder="예: https://abcdxyz.supabase.co"
                    className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-gray-500">Project Settings → API 의 Project URL</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">Project Ref (선택)</label>
                  <input
                    value={supabaseForm.projectRef}
                    onChange={(e) => setSupabaseForm((prev) => ({ ...prev, projectRef: e.target.value }))}
                    placeholder="예: abcdxyz"
                    className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-gray-500">
                    URL의 가운데 짧은 ID입니다. <code className="bg-white/80 px-1 rounded">https://[이부분].supabase.co</code>
                  </p>
                </div>
              </div>
              {/* 접지 않아도 보이도록 핵심 경로를 항상 노출 */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950 space-y-1">
                <p className="font-semibold">DATABASE_URL 복사 경로 (Supabase 최신 Connect 화면)</p>
                <p>
                  프로젝트 화면 <span className="font-semibold">상단 Connect</span> → Direct →{' '}
                  <span className="font-semibold">Transaction pooler (6543, 권장)</span> 또는
                  Session pooler (5432) → Type: URI → Copy →{' '}
                  <code className="rounded bg-white/80 px-1">[YOUR-PASSWORD]</code> 를 DB 비밀번호로 교체
                </p>
                <p className="font-medium text-amber-800">
                  주의: <code className="rounded bg-white/80 px-1">[YOUR-PASSWORD]</code> 문구를
                  그대로 넣으면 연결되지 않습니다. 실제 DB 비밀번호에 @, :, /, # 같은 특수문자가
                  있으면 percent-encode 하거나 영문·숫자 비밀번호로 재설정하세요.
                </p>
                <p className="text-emerald-900/80">
                  host에 <code className="rounded bg-white/80 px-1">pooler.supabase.com</code>이
                  들어가야 합니다. <strong>Direct connection(db.*.supabase.co)</strong>은 무료
                  프로젝트의 Vercel IPv4 환경에서 실패할 수 있으므로 선택하지 마세요.
                </p>
              </div>
              <TokenGuidePanel guideId="supabase-database" defaultOpen />
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Transaction/Session pooler DATABASE_URL (필수)</label>
                <textarea
                  value={supabaseForm.databaseUrl}
                  onChange={(e) => setSupabaseForm((prev) => ({ ...prev, databaseUrl: e.target.value }))}
                  placeholder="postgresql://postgres.xxxx:비밀번호@aws-0-....pooler.supabase.com:5432/postgres"
                  rows={3}
                  className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <button type="button" onClick={handleConnectSupabase} disabled={submitting || !supabaseForm.databaseUrl} className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                {submitting ? '확인 중...' : '기존 Supabase 연결 확인'}
              </button>
              {session?.supabase?.databaseUrl && <p className="text-sm text-green-700">✓ Supabase 연결 완료</p>}
            </div>

            <details className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-gray-800">
                새 Supabase 프로젝트 만들기 (선택 · 무료 티어가 남아 있을 때만)
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-xs text-gray-600">
                  이미 무료 프로젝트를 다 쓰셨다면 이 구간은 건너뛰세요. 관리 토큰으로 조직/프로젝트를 새로 만들 때만 사용합니다.
                </p>
                <TokenGuidePanel guideId="supabase-token" />
                <input
                  type="password"
                  value={supabaseForm.supabaseToken}
                  onChange={(e) => setSupabaseForm((prev) => ({ ...prev, supabaseToken: e.target.value }))}
                  placeholder="Supabase management token"
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
              </div>
            </details>
          </section>

          <section className="space-y-3 border-t border-gray-100 pt-6">
            <h2 className="text-xl font-bold text-gray-900">4. 환경변수 주입 및 첫 배포</h2>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-bold">버튼을 누른 뒤 창을 닫거나 새로고침하지 마세요.</p>
              <p className="mt-1 leading-6">
                환경변수 저장 → 최신 코드 동기화 → Vercel 빌드 → 학교 사이트 시작 순서로 진행됩니다.
                보통 1~3분, 처음 배포하거나 Vercel이 혼잡할 때는 <strong>최대 5분</strong>이 걸릴 수 있습니다.
                진행 팝업이 자동으로 닫힐 때까지 기다려주세요.
              </p>
            </div>
            <input
              value={deployForm.jwtSecret}
              onChange={(e) => setDeployForm({ jwtSecret: e.target.value })}
              placeholder="JWT_SECRET"
              className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none"
            />
            <button type="button" onClick={handleProvision} disabled={submitting || !session?.supabase?.databaseUrl || !session?.vercel?.projectId} className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              {deploymentModal.open ? '배포 진행 중... 잠시만 기다려주세요' : 'Vercel 환경변수 주입 + 재배포'}
            </button>
            {session?.vercel?.deploymentUrl && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900 space-y-1">
                <p className="font-medium">공개 배포 주소 (이 주소로 들어가세요)</p>
                <a className="underline break-all" href={session.vercel.deploymentUrl} target="_blank" rel="noreferrer">
                  {session.vercel.deploymentUrl}
                </a>
                <p className="text-xs text-green-800/80">
                  해시가 들어간 긴 배포 URL은 Vercel 로그인 보호 때문에 「You Need Access」가 뜰 수 있습니다.
                  위 <code className="rounded bg-white/80 px-1">프로젝트이름.vercel.app</code> 주소를 사용하세요.
                </p>
              </div>
            )}
          </section>

          <section className="space-y-3 border-t border-gray-100 pt-6">
            <h2 className="text-xl font-bold text-gray-900">5. 학교 정보 설정</h2>
            <p className="text-sm text-gray-600">
              학교 정보 설정은 이 온보딩 사이트가 아니라 <strong>새로 배포된 학교 사이트</strong>에서 진행합니다.
              아래 버튼을 누르면 학교 사이트 상태를 점검한 뒤 준비됐을 때 설정 화면을 새 탭으로 엽니다.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleGoToSchoolSetup}
                disabled={session?.status !== 'READY_FOR_SETUP' || setupDiag?.checking}
                className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {setupDiag?.checking ? '학교 사이트 점검 중...' : '학교 정보 설정으로 이동'}
              </button>
              {session?.vercel?.deploymentUrl && (
                <a
                  className="text-sm text-indigo-600 underline break-all"
                  href={`${session.vercel.deploymentUrl.replace(/\/+$/, '')}/setup`}
                  target="_blank"
                  rel="noreferrer"
                >
                  바로 열기: {session.vercel.deploymentUrl.replace(/\/+$/, '')}/setup
                </a>
              )}
            </div>
            {setupDiag && !setupDiag.checking && setupDiag.items.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                {setupDiag.items.map((item) => (
                  <li key={item.label} className="text-sm">
                    <span
                      className={
                        item.state === 'ok'
                          ? 'text-green-700'
                          : item.state === 'warn'
                            ? 'text-amber-700'
                            : 'text-red-700'
                      }
                    >
                      {item.state === 'ok' ? '✓' : item.state === 'warn' ? '△' : '✕'} {item.label}
                    </span>
                    {item.detail && <span className="text-gray-600"> — {item.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      </div>

      {deploymentModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deployment-title"
        >
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/20 bg-slate-950 px-7 py-8 text-white shadow-2xl">
            <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-indigo-500/30 blur-3xl" />
            <div className="absolute -bottom-20 -left-12 h-44 w-44 rounded-full bg-sky-400/20 blur-3xl" />

            <div className="relative">
              <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center">
                <div className="absolute h-24 w-24 animate-spin rounded-full border-2 border-transparent border-t-sky-300 border-r-indigo-400 motion-reduce:animate-none" />
                <div className="absolute h-16 w-16 animate-pulse rounded-full bg-indigo-500/20 ring-1 ring-indigo-300/50 motion-reduce:animate-none" />
                <span className="text-3xl" aria-hidden="true">🚀</span>
              </div>

              <p className="text-center text-xs font-bold uppercase tracking-[0.28em] text-sky-300">
                Deployment in progress
              </p>
              <h2 id="deployment-title" className="mt-2 text-center text-2xl font-extrabold">
                학교 사이트를 만들고 있어요
              </h2>
              <p className="mt-3 min-h-12 text-center text-sm leading-6 text-slate-300" aria-live="polite">
                {deploymentModal.message}
              </p>

              <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-400 transition-[width] duration-1000"
                  style={{ width: `${Math.min(92, Math.max(6, (deploymentElapsedSeconds / 300) * 100))}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-slate-400">
                <span>
                  경과 {Math.floor(deploymentElapsedSeconds / 60)}분 {deploymentElapsedSeconds % 60}초
                </span>
                <span>최대 약 5분</span>
              </div>

              <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-200/10 px-4 py-3 text-center text-sm leading-6 text-amber-100">
                오류가 아닙니다. 창을 닫거나 새로고침하지 말고<br />
                준비 완료 안내가 나올 때까지 기다려주세요.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Onboarding
