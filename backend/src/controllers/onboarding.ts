import { Request, Response } from 'express'
import {
  createRepoFromTemplate,
  getGitHubOAuthConfig,
  getGitHubUser,
} from '../utils/github'
import {
  createOnboardingSession,
  getSessionTokenFromHeader,
  OnboardingSessionPayload,
  sealOnboardingSession,
  unsealOnboardingSession,
  updateOnboardingSession,
} from '../utils/onboardingSession'
import {
  createSupabaseProject,
  getSupabaseOAuthConfig,
  inferSupabaseProjectUrl,
  listSupabaseOrganizations,
  listSupabaseProjects,
} from '../utils/supabase'
import {
  applyVercelEnvAndRedeploy,
  createVercelProject,
  getVercelOAuthConfig,
  getVercelUser,
  listVercelTeams,
  triggerVercelDeployment,
} from '../utils/vercel'
import { ensureDefaultSettings, pushDatabaseSchema, testDatabaseConnection } from '../utils/dbBootstrap'

const TEMPLATE_OWNER = 'waseok'
const TEMPLATE_REPO = 'studycheck-template'

function readSession(req: Request): OnboardingSessionPayload | null {
  const token = getSessionTokenFromHeader(req.headers.authorization)
  return unsealOnboardingSession(token)
}

function sendSession(res: Response, session: OnboardingSessionPayload, extra?: Record<string, unknown>) {
  res.json({
    success: true,
    session,
    sessionToken: sealOnboardingSession(session),
    ...extra,
  })
}

export const getOnboardingConfig = async (_req: Request, res: Response) => {
  res.json({
    success: true,
    templateRepo: `${TEMPLATE_OWNER}/${TEMPLATE_REPO}`,
    github: getGitHubOAuthConfig(),
    vercel: getVercelOAuthConfig(),
    supabase: getSupabaseOAuthConfig(),
    defaults: {
      repoVisibility: 'private',
      supabaseRegion: 'ap-northeast-2',
    },
  })
}

export const startOnboardingSession = async (req: Request, res: Response) => {
  const { repoName } = req.body as { repoName?: string }
  const session = createOnboardingSession(repoName?.trim())
  sendSession(res, session)
}

export const getOnboardingSession = async (req: Request, res: Response) => {
  const session = readSession(req)
  if (!session) {
    return res.status(401).json({ error: '온보딩 세션이 없습니다. 처음부터 다시 시작해주세요.' })
  }
  sendSession(res, session)
}

export const connectGitHubRepo = async (req: Request, res: Response) => {
  const session = readSession(req)
  if (!session) {
    return res.status(401).json({ error: '온보딩 세션이 없습니다.' })
  }

  const {
    githubToken,
    repoName,
    visibility,
  } = req.body as {
    githubToken?: string
    repoName?: string
    visibility?: 'public' | 'private'
  }

  if (!githubToken?.trim()) {
    return res.status(400).json({ error: 'GitHub 토큰을 입력해주세요.' })
  }

  const finalRepoName = repoName?.trim() || session.repoName
  if (!finalRepoName) {
    return res.status(400).json({ error: '저장소 이름을 입력해주세요.' })
  }

  try {
    const user = await getGitHubUser(githubToken.trim())
    const repo = await createRepoFromTemplate({
      token: githubToken.trim(),
      templateOwner: TEMPLATE_OWNER,
      templateRepo: TEMPLATE_REPO,
      name: finalRepoName,
      visibility: visibility || 'private',
      owner: user.login,
    })

    const updated = updateOnboardingSession(session, {
      repoName: finalRepoName,
      status: 'GITHUB_CONNECTED',
      tokens: { githubToken: githubToken.trim() },
      github: {
        owner: repo.owner,
        repo: repo.repo,
        repoUrl: repo.repoUrl,
        visibility: repo.visibility,
      },
    })

    sendSession(res, updated)
  } catch (error) {
    console.error('GitHub onboarding error:', error)
    res.status(500).json({ error: 'GitHub 템플릿 저장소 생성에 실패했습니다.' })
  }
}

export const getVercelTeams = async (req: Request, res: Response) => {
  const session = readSession(req)
  if (!session) {
    return res.status(401).json({ error: '온보딩 세션이 없습니다.' })
  }

  const { vercelToken } = req.body as { vercelToken?: string }
  const token = vercelToken?.trim() || session.tokens.vercelToken
  if (!token) {
    return res.status(400).json({ error: 'Vercel 토큰을 입력해주세요.' })
  }

  try {
    const [user, teams] = await Promise.all([getVercelUser(token), listVercelTeams(token)])
    const updated = updateOnboardingSession(session, {
      tokens: { vercelToken: token },
      status: session.status === 'CREATED' ? 'CREATED' : session.status,
    })
    res.json({
      success: true,
      session: updated,
      sessionToken: sealOnboardingSession(updated),
      user,
      teams,
    })
  } catch (error) {
    console.error('Vercel team lookup error:', error)
    res.status(500).json({ error: 'Vercel 팀 목록을 불러오지 못했습니다.' })
  }
}

export const connectVercelProject = async (req: Request, res: Response) => {
  const session = readSession(req)
  if (!session) {
    return res.status(401).json({ error: '온보딩 세션이 없습니다.' })
  }
  if (!session.github?.owner || !session.github.repo) {
    return res.status(400).json({ error: '먼저 GitHub 저장소를 생성해주세요.' })
  }

  const {
    vercelToken,
    teamId,
    projectName,
  } = req.body as {
    vercelToken?: string
    teamId?: string
    projectName?: string
  }

  const token = vercelToken?.trim() || session.tokens.vercelToken
  if (!token) {
    return res.status(400).json({ error: 'Vercel 토큰을 입력해주세요.' })
  }

  try {
    const created = await createVercelProject({
      token,
      teamId: teamId?.trim() || undefined,
      projectName: projectName?.trim() || session.repoName || session.github.repo,
      repo: `${session.github.owner}/${session.github.repo}`,
    })

    const updated = updateOnboardingSession(session, {
      status: 'VERCEL_CONNECTED',
      tokens: { vercelToken: token },
      vercel: {
        teamId: teamId?.trim() || undefined,
        projectId: created.id,
        projectName: created.name,
      },
    })

    sendSession(res, updated)
  } catch (error) {
    console.error('Vercel project creation error:', error)
    res.status(500).json({ error: 'Vercel 프로젝트 생성에 실패했습니다.' })
  }
}

export const getSupabaseResources = async (req: Request, res: Response) => {
  const session = readSession(req)
  if (!session) {
    return res.status(401).json({ error: '온보딩 세션이 없습니다.' })
  }
  const { supabaseToken } = req.body as { supabaseToken?: string }
  const token = supabaseToken?.trim() || session.tokens.supabaseToken
  if (!token) {
    return res.status(400).json({ error: 'Supabase 토큰을 입력해주세요.' })
  }

  try {
    const [organizations, projects] = await Promise.all([
      listSupabaseOrganizations(token),
      listSupabaseProjects(token),
    ])
    const updated = updateOnboardingSession(session, {
      tokens: { supabaseToken: token },
    })
    res.json({
      success: true,
      session: updated,
      sessionToken: sealOnboardingSession(updated),
      organizations,
      projects,
    })
  } catch (error) {
    console.error('Supabase resources error:', error)
    res.status(500).json({ error: 'Supabase 조직/프로젝트 목록을 불러오지 못했습니다.' })
  }
}

export const createSupabaseManagedProject = async (req: Request, res: Response) => {
  const session = readSession(req)
  if (!session) {
    return res.status(401).json({ error: '온보딩 세션이 없습니다.' })
  }

  const {
    supabaseToken,
    organizationId,
    projectName,
    region,
    dbPassword,
  } = req.body as {
    supabaseToken?: string
    organizationId?: string
    projectName?: string
    region?: string
    dbPassword?: string
  }

  const token = supabaseToken?.trim() || session.tokens.supabaseToken
  if (!token || !organizationId?.trim() || !projectName?.trim() || !region?.trim() || !dbPassword) {
    return res.status(400).json({ error: 'Supabase 프로젝트 생성 정보가 부족합니다.' })
  }

  try {
    const project = await createSupabaseProject({
      token,
      organizationId: organizationId.trim(),
      name: projectName.trim(),
      region: region.trim(),
      dbPassword,
    })

    const updated = updateOnboardingSession(session, {
      status: 'SUPABASE_CONNECTED',
      tokens: { supabaseToken: token },
      supabase: {
        organizationId: organizationId.trim(),
        projectRef: project.id,
        projectUrl: inferSupabaseProjectUrl(project.id),
        region: project.region,
      },
    })

    sendSession(res, updated, {
      hint: 'Supabase 프로젝트가 생성되었습니다. Session pooler DATABASE_URL은 Connect 화면에서 복사해 다음 단계에 입력해주세요.',
    })
  } catch (error) {
    console.error('Supabase project creation error:', error)
    res.status(500).json({ error: 'Supabase 프로젝트 생성에 실패했습니다.' })
  }
}

export const connectExistingSupabase = async (req: Request, res: Response) => {
  const session = readSession(req)
  if (!session) {
    return res.status(401).json({ error: '온보딩 세션이 없습니다.' })
  }

  const {
    projectUrl,
    projectRef,
    databaseUrl,
    region,
  } = req.body as {
    projectUrl?: string
    projectRef?: string
    databaseUrl?: string
    region?: string
  }

  if (!databaseUrl?.trim()) {
    return res.status(400).json({ error: 'Supabase Session pooler DATABASE_URL을 입력해주세요.' })
  }

  try {
    await testDatabaseConnection(databaseUrl.trim())
  } catch {
    return res.status(400).json({ error: 'Supabase DATABASE_URL 연결에 실패했습니다.' })
  }

  const updated = updateOnboardingSession(session, {
    status: 'SUPABASE_CONNECTED',
    supabase: {
      projectUrl: projectUrl?.trim() || session.supabase?.projectUrl,
      projectRef: projectRef?.trim() || session.supabase?.projectRef,
      databaseUrl: databaseUrl.trim(),
      region: region?.trim() || session.supabase?.region,
    },
  })

  sendSession(res, updated)
}

export const provisionInfrastructure = async (req: Request, res: Response) => {
  const session = readSession(req)
  if (!session) {
    return res.status(401).json({ error: '온보딩 세션이 없습니다.' })
  }
  if (!session.vercel?.projectId || !session.vercel.projectName || !session.tokens.vercelToken) {
    return res.status(400).json({ error: 'Vercel 프로젝트가 연결되지 않았습니다.' })
  }
  if (!session.supabase?.databaseUrl) {
    return res.status(400).json({ error: 'Supabase DATABASE_URL이 연결되지 않았습니다.' })
  }

  const { jwtSecret } = req.body as { jwtSecret?: string }
  if (!jwtSecret?.trim() || jwtSecret.trim().length < 16) {
    return res.status(400).json({ error: 'JWT_SECRET은 16자 이상이어야 합니다.' })
  }

  try {
    pushDatabaseSchema(session.supabase.databaseUrl)
    await ensureDefaultSettings(
      session.supabase.databaseUrl,
      session.supabase.projectUrl || undefined
    )
    await applyVercelEnvAndRedeploy({
      token: session.tokens.vercelToken,
      projectId: session.vercel.projectId,
      teamId: session.vercel.teamId,
      databaseUrl: session.supabase.databaseUrl,
      jwtSecret: jwtSecret.trim(),
    })

    let deploymentUrl = session.vercel.deploymentUrl
    try {
      const deployment = await triggerVercelDeployment({
        token: session.tokens.vercelToken,
        projectName: session.vercel.projectName,
        teamId: session.vercel.teamId,
      })
      deploymentUrl = `https://${deployment.url}`
    } catch (error) {
      console.warn('Vercel deploy trigger warning:', error)
      deploymentUrl = deploymentUrl || `https://${session.vercel.projectName}.vercel.app`
    }

    const updated = updateOnboardingSession(session, {
      status: 'READY_FOR_SETUP',
      vercel: {
        ...session.vercel,
        deploymentUrl,
      },
    })

    sendSession(res, updated, {
      deploymentUrl,
      message: 'Vercel 환경변수 주입과 재배포를 시작했습니다. 잠시 후 학교 정보 설정으로 이동하세요.',
    })
  } catch (error) {
    console.error('Onboarding provision error:', error)
    res.status(500).json({ error: '인프라 연결 및 배포 자동화에 실패했습니다.' })
  }
}
