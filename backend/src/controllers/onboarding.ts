import { Request, Response } from 'express'
import {
  createRepoFromTemplate,
  getGitHubOAuthConfig,
  getGitHubRepo,
  getGitHubUser,
  mirrorTemplateRepoToSchool,
  syncSchoolRuntimeApiToRepo,
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
  connectCreatedSupabaseProject,
  createSupabaseProject,
  getSupabaseOAuthConfig,
  inferSupabaseProjectUrl,
  listSupabaseOrganizations,
  listSupabaseProjects,
  resolveNewSupabaseProjectDatabaseUrl,
} from '../utils/supabase'
import {
  applyVercelEnvAndEnsureDeploy,
  createVercelProject,
  ensureVercelProjectForProvision,
  getVercelOAuthConfig,
  getVercelUser,
  listVercelTeams,
  type VercelGitSource,
} from '../utils/vercel'
import { ensureDefaultSettings, pushDatabaseSchema, testDatabaseConnection } from '../utils/dbBootstrap'
import {
  readSchoolVercelJson,
  readTemplateApiIndex,
  readTemplateSettingsPublic,
  readTemplateSettingsSetup,
  readTemplateSettingsStatus,
  readTemplateVercelBuildScript,
  readTemplateVercelInstallScript,
} from '../utils/vercelBuildScript'

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
    const detail = error instanceof Error ? error.message : String(error)
    res.status(500).json({
      error: 'GitHub 템플릿 저장소 생성에 실패했습니다.',
      detail,
    })
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
    const detail = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: 'Vercel 팀 목록을 불러오지 못했습니다.', detail })
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
    const detail = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: 'Vercel 프로젝트 생성에 실패했습니다.', detail })
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

    const connectResult = await connectCreatedSupabaseProject({
      token,
      projectRef: project.id,
      dbPassword,
      maxWaitMs: 45_000,
    })

    const updated = updateOnboardingSession(session, {
      status: connectResult.autoConnected ? 'SUPABASE_CONNECTED' : session.status,
      tokens: { supabaseToken: token },
      supabase: {
        organizationId: organizationId.trim(),
        projectRef: project.id,
        projectUrl: inferSupabaseProjectUrl(project.id),
        region: project.region,
        ...(connectResult.autoConnected ? { databaseUrl: connectResult.databaseUrl } : {}),
      },
    })

    sendSession(res, updated, {
      autoConnected: connectResult.autoConnected,
      needsAutoConnect: !connectResult.autoConnected,
      hint: connectResult.autoConnected
        ? 'Supabase 프로젝트 생성과 Transaction pooler DB 연결이 완료됐습니다. 이제 4단계로 진행하세요.'
        : connectResult.hint,
    })
  } catch (error) {
    console.error('Supabase project creation error:', error)
    res.status(500).json({ error: 'Supabase 프로젝트 생성에 실패했습니다.' })
  }
}

export const autoConnectSupabaseProject = async (req: Request, res: Response) => {
  const session = readSession(req)
  if (!session) {
    return res.status(401).json({ error: '온보딩 세션이 없습니다.' })
  }

  const { supabaseToken, projectRef, dbPassword } = req.body as {
    supabaseToken?: string
    projectRef?: string
    dbPassword?: string
  }

  const token = supabaseToken?.trim() || session.tokens.supabaseToken
  const ref = projectRef?.trim() || session.supabase?.projectRef
  if (!token) {
    return res.status(400).json({ error: 'Supabase management token이 필요합니다.' })
  }
  if (!ref) {
    return res.status(400).json({ error: '먼저 새 Supabase 프로젝트를 생성해주세요.' })
  }
  if (!dbPassword) {
    return res.status(400).json({ error: '프로젝트 생성 시 입력한 DB 비밀번호가 필요합니다.' })
  }

  try {
    const databaseUrl = await resolveNewSupabaseProjectDatabaseUrl({
      token,
      projectRef: ref,
      dbPassword,
      maxWaitMs: 50_000,
    })

    const updated = updateOnboardingSession(session, {
      status: 'SUPABASE_CONNECTED',
      tokens: { supabaseToken: token },
      supabase: {
        ...session.supabase,
        projectRef: ref,
        projectUrl: session.supabase?.projectUrl || inferSupabaseProjectUrl(ref),
        databaseUrl,
      },
    })

    sendSession(res, updated, {
      autoConnected: true,
      hint: 'Transaction pooler DB 연결이 완료됐습니다. 이제 4단계로 진행하세요.',
    })
  } catch (error) {
    console.error('Supabase auto-connect error:', error)
    const detail = error instanceof Error ? error.message : String(error)
    res.status(400).json({ error: detail })
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
    return res.status(400).json({ error: 'Supabase Transaction 또는 Session pooler DATABASE_URL을 입력해주세요.' })
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
    return res.status(400).json({
      error:
        session.supabase?.projectRef && !session.supabase?.databaseUrl
          ? 'Supabase DATABASE_URL이 아직 연결되지 않았습니다. 3단계에서 「DB 자동 연결」을 완료하거나 pooler URI를 직접 입력해주세요.'
          : 'Supabase DATABASE_URL이 연결되지 않았습니다.',
    })
  }

  const { jwtSecret } = req.body as { jwtSecret?: string }
  if (!jwtSecret?.trim() || jwtSecret.trim().length < 16) {
    return res.status(400).json({ error: 'JWT_SECRET은 16자 이상이어야 합니다.' })
  }

  try {
    const ensured = await ensureVercelProjectForProvision({
      token: session.tokens.vercelToken,
      githubToken: session.tokens.githubToken,
      projectId: session.vercel.projectId,
      projectName: session.vercel.projectName,
      teamId: session.vercel.teamId,
      repoOwner: session.github?.owner,
      repoName: session.github?.repo,
    })
    if (ensured.recreated) {
      console.log(`Recreated missing Vercel project: ${ensured.name} (${ensured.id})`)
    }
    const vercelProjectId = ensured.id
    const vercelProjectName = ensured.name
    const vercelTeamId = session.vercel.teamId
    const databaseUrl = session.supabase.databaseUrl

    try {
      await pushDatabaseSchema(databaseUrl)
      await ensureDefaultSettings(databaseUrl, session.supabase.projectUrl || undefined)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(
        `DB 준비에 실패했습니다. Pooler DATABASE_URL과 실제 DB 비밀번호를 확인하세요. (${detail})`
      )
    }

    // 환경변수를 먼저 반영한 뒤 Git 동기화 (webhook 배포에 env가 포함되도록)
    await applyVercelEnvAndEnsureDeploy({
      token: session.tokens.vercelToken,
      projectId: vercelProjectId,
      projectName: vercelProjectName,
      teamId: vercelTeamId,
      databaseUrl,
      jwtSecret: jwtSecret.trim(),
      skipExplicitDeploy: true,
    })

    // 학교 저장소를 템플릿 최신 코드로 미러링 (실패 시 핵심 파일만 개별 동기화)
    let gitPushed = false
    if (session.tokens.githubToken && session.github?.owner && session.github?.repo) {
      try {
        const mirror = await mirrorTemplateRepoToSchool({
          token: session.tokens.githubToken,
          templateOwner: TEMPLATE_OWNER,
          templateRepo: TEMPLATE_REPO,
          owner: session.github.owner,
          repo: session.github.repo,
          branch: 'main',
          overrides: { 'vercel.json': readSchoolVercelJson() },
        })
        if (mirror.updated) gitPushed = true
      } catch (error) {
        console.warn('Template mirror warning, falling back to file sync:', error)
        try {
          const apiSync = await syncSchoolRuntimeApiToRepo({
            token: session.tokens.githubToken,
            owner: session.github.owner,
            repo: session.github.repo,
            branch: 'main',
            indexTsContent: readTemplateApiIndex(),
            vercelJsonContent: readSchoolVercelJson(),
            settingsStatusContent: readTemplateSettingsStatus(),
            settingsPublicContent: readTemplateSettingsPublic(),
            settingsSetupContent: readTemplateSettingsSetup(),
            installScriptContent: readTemplateVercelInstallScript(),
            buildScriptContent: readTemplateVercelBuildScript(),
          })
          if (apiSync.updated) gitPushed = true
        } catch (fallbackError) {
          console.warn('School repo runtime API sync warning:', fallbackError)
        }
      }
    }

    let gitSource: VercelGitSource | undefined
    if (session.tokens.githubToken && session.github?.owner && session.github?.repo) {
      try {
        const gh = await getGitHubRepo(
          session.tokens.githubToken,
          session.github.owner,
          session.github.repo
        )
        if (gh.id) {
          gitSource = {
            type: 'github',
            repoId: gh.id,
            ref: gh.defaultBranch || 'main',
            org: session.github.owner,
            repo: session.github.repo,
          }
        }
      } catch (error) {
        console.warn('GitHub repo lookup for deploy:', error)
      }
    }

    const deployResult = await applyVercelEnvAndEnsureDeploy({
      token: session.tokens.vercelToken,
      projectId: vercelProjectId,
      projectName: vercelProjectName,
      teamId: vercelTeamId,
      databaseUrl,
      jwtSecret: jwtSecret.trim(),
      gitSource,
      // env는 Git push 전에 저장됨: Git 변경 시 webhook 1회, 변경 없을 때 수동 배포 1회
      skipExplicitDeploy: gitPushed,
    })

    const deploymentUrl =
      deployResult.deploymentUrl ||
      session.vercel.deploymentUrl ||
      `https://${vercelProjectName}.vercel.app`

    const updated = updateOnboardingSession(session, {
      status: 'READY_FOR_SETUP',
      vercel: {
        ...session.vercel,
        projectId: vercelProjectId,
        projectName: vercelProjectName,
        gitLinked: ensured.gitLinked,
        deploymentUrl,
      },
    })

    sendSession(res, updated, {
      deploymentUrl,
      gitSynced: gitPushed,
      message: gitPushed
        ? '환경변수를 저장했고, Git 동기화로 배포를 1회 시작했습니다. Vercel에서 Ready가 되면 5단계로 이동하세요.'
        : '환경변수를 저장하고 Production 배포를 1회 시작했습니다. Vercel에서 Ready가 되면 5단계로 이동하세요.',
    })
  } catch (error) {
    console.error('Onboarding provision error:', error)
    const detail = error instanceof Error ? error.message : String(error)
    res.status(500).json({
      error: detail.length > 500 ? `${detail.slice(0, 500)}…` : detail,
      detail,
    })
  }
}
