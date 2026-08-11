/**
 * Hobby 플랜 서버리스 함수 12개 한도 대응:
 * 온보딩 전 경로를 이 catch-all 하나로 처리합니다.
 *
 * /api/onboarding/* → 여기로 라우팅
 */
import {
  createRepoFromTemplate,
  getGitHubRepo,
  getGitHubUser,
  parseGitHubRepoRef,
} from '../backend/src/utils/github'
import {
  createVercelProject,
  ensureVercelProjectGitLinked,
  getVercelUser,
  listVercelTeams,
  sanitizeVercelProjectName,
  applyVercelEnvAndEnsureDeploy,
  type VercelGitSource,
} from '../backend/src/utils/vercel'
import {
  listSupabaseOrganizations,
  listSupabaseProjects,
  createSupabaseProject,
  inferSupabaseProjectUrl,
} from '../backend/src/utils/supabase'
import {
  createOnboardingSession,
  sealOnboardingSession,
  unsealOnboardingSession,
  updateOnboardingSession,
} from '../backend/src/utils/onboardingSession'
import {
  ensureDefaultSettings,
  pushDatabaseSchema,
  testDatabaseConnection,
} from '../backend/src/utils/dbBootstrap'
import { getBearerToken, json, readJsonBody } from './_lib/http'

const TEMPLATE_OWNER = 'waseok'
const TEMPLATE_REPO = 'studycheck-template'

function routePath(req: any): string {
  // vercel.json rewrite: /api/onboarding/(.*) → /api/onboarding-router?path=$1
  const raw = req.query?.path
  if (Array.isArray(raw)) return raw.filter(Boolean).join('/')
  if (typeof raw === 'string' && raw.trim()) {
    return decodeURIComponent(raw).replace(/^\/+|\/+$/g, '')
  }
  const url = String(req.url || '')
  const fromQuery = url.match(/[?&]path=([^&]+)/)
  if (fromQuery?.[1]) {
    return decodeURIComponent(fromQuery[1]).replace(/^\/+|\/+$/g, '')
  }
  const match = url.match(/\/api\/onboarding(?:-router)?\/?([^?]*)/)
  return (match?.[1] || '').replace(/^\/+|\/+$/g, '')
}

function resolveRepoSlug(session: {
  github?: { owner?: string; repo?: string; repoUrl?: string }
  repoName?: string
}): { owner: string; repo: string } | null {
  if (session.github?.owner && session.github?.repo) {
    return { owner: session.github.owner, repo: session.github.repo }
  }
  if (session.github?.repoUrl) {
    const parsed = parseGitHubRepoRef(session.github.repoUrl)
    if (parsed) return parsed
  }
  if (session.github?.repo?.includes('/')) {
    return parseGitHubRepoRef(session.github.repo)
  }
  return null
}

function handleConfig(_req: any, res: any) {
  return json(res, 200, {
    success: true,
    templateRepo: 'waseok/studycheck-template',
    github: {
      clientId: '',
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      configured: false,
    },
    vercel: {
      clientId: '',
      authorizeUrl: 'https://vercel.com/integrations',
      configured: false,
    },
    supabase: {
      clientId: '',
      authorizeUrl: 'https://supabase.com/dashboard',
      configured: false,
    },
    defaults: {
      repoVisibility: 'private',
      supabaseRegion: 'ap-northeast-2',
    },
  })
}

async function handleSession(req: any, res: any) {
  if (req.method === 'POST') {
    const body = await readJsonBody(req)
    const session = createOnboardingSession(String(body.repoName || '').trim() || undefined)
    return json(res, 200, {
      success: true,
      session,
      sessionToken: sealOnboardingSession(session),
    })
  }
  if (req.method === 'GET') {
    const session = unsealOnboardingSession(getBearerToken(req))
    if (!session) {
      return json(res, 401, { error: '온보딩 세션이 없습니다. 처음부터 다시 시작해주세요.' })
    }
    return json(res, 200, {
      success: true,
      session,
      sessionToken: sealOnboardingSession(session),
    })
  }
  return json(res, 405, { error: '허용되지 않은 메서드입니다.' })
}

async function handleGitHubRepo(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: '허용되지 않은 메서드입니다.' })
  const session = unsealOnboardingSession(getBearerToken(req))
  if (!session) return json(res, 401, { error: '온보딩 세션이 없습니다.' })

  const body = await readJsonBody(req)
  const githubToken = String(body.githubToken || session.tokens.githubToken || '').trim()
  const repoName = String(body.repoName || session.repoName || '').trim()
  const visibility = body.visibility === 'public' ? 'public' : 'private'
  const forceRecreate = Boolean(body.forceRecreate)

  if (!githubToken) return json(res, 400, { error: 'GitHub 토큰을 입력해주세요.' })

  if (!forceRecreate && session.github?.owner && session.github?.repo && session.github?.repoUrl) {
    const updated = updateOnboardingSession(session, {
      status: 'GITHUB_CONNECTED',
      tokens: { githubToken },
    })
    return json(res, 200, {
      success: true,
      session: updated,
      sessionToken: sealOnboardingSession(updated),
      reused: true,
      message: '이미 연결된 GitHub 저장소를 그대로 사용합니다.',
    })
  }

  if (!repoName) return json(res, 400, { error: '저장소 이름을 입력해주세요.' })

  const user = await getGitHubUser(githubToken)
  try {
    const existing = await getGitHubRepo(githubToken, user.login, repoName)
    const updated = updateOnboardingSession(session, {
      repoName: existing.repo,
      status: 'GITHUB_CONNECTED',
      tokens: { githubToken },
      github: {
        owner: existing.owner,
        repo: existing.repo,
        repoUrl: existing.repoUrl,
        visibility: existing.visibility,
      },
    })
    return json(res, 200, {
      success: true,
      session: updated,
      sessionToken: sealOnboardingSession(updated),
      reused: true,
      message: `이미 있는 저장소 ${existing.owner}/${existing.repo} 에 연결했습니다.`,
    })
  } catch {
    // create below
  }

  const repo = await createRepoFromTemplate({
    token: githubToken,
    templateOwner: TEMPLATE_OWNER,
    templateRepo: TEMPLATE_REPO,
    name: repoName,
    visibility,
    owner: user.login,
  })
  const updated = updateOnboardingSession(session, {
    repoName: repo.repo,
    status: 'GITHUB_CONNECTED',
    tokens: { githubToken },
    github: {
      owner: repo.owner,
      repo: repo.repo,
      repoUrl: repo.repoUrl,
      visibility: repo.visibility,
    },
  })
  return json(res, 200, {
    success: true,
    session: updated,
    sessionToken: sealOnboardingSession(updated),
    reused: false,
    message: `GitHub 저장소 ${repo.owner}/${repo.repo} 를 생성했습니다.`,
  })
}

async function handleGitHubConnect(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: '허용되지 않은 메서드입니다.' })
  const session = unsealOnboardingSession(getBearerToken(req))
  if (!session) return json(res, 401, { error: '온보딩 세션이 없습니다.' })

  const body = await readJsonBody(req)
  const githubToken = String(body.githubToken || session.tokens.githubToken || '').trim()
  const repoInput = String(body.repoUrl || body.repo || '').trim()
  if (!githubToken) return json(res, 400, { error: 'GitHub 토큰을 입력해주세요.' })
  if (!repoInput) return json(res, 400, { error: 'GitHub 저장소 URL 또는 owner/repo 를 입력해주세요.' })

  let parsed = parseGitHubRepoRef(repoInput)
  if (!parsed) {
    const user = await getGitHubUser(githubToken)
    parsed = { owner: user.login, repo: repoInput.replace(/\.git$/i, '') }
  }

  const repo = await getGitHubRepo(githubToken, parsed.owner, parsed.repo)
  const updated = updateOnboardingSession(session, {
    repoName: repo.repo,
    status: 'GITHUB_CONNECTED',
    tokens: { githubToken },
    github: {
      owner: repo.owner,
      repo: repo.repo,
      repoUrl: repo.repoUrl,
      visibility: repo.visibility,
    },
  })
  return json(res, 200, {
    success: true,
    session: updated,
    sessionToken: sealOnboardingSession(updated),
    message: `기존 저장소 ${repo.owner}/${repo.repo} 에 연결했습니다.`,
  })
}

async function handleVercelTeams(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: '허용되지 않은 메서드입니다.' })
  const session = unsealOnboardingSession(getBearerToken(req))
  if (!session) return json(res, 401, { error: '온보딩 세션이 없습니다.' })

  const body = await readJsonBody(req)
  const token = String(body.vercelToken || session.tokens.vercelToken || '').trim()
  if (!token) return json(res, 400, { error: 'Vercel 토큰을 입력해주세요.' })

  const [user, teams] = await Promise.all([getVercelUser(token), listVercelTeams(token)])
  const updated = updateOnboardingSession(session, { tokens: { vercelToken: token } })
  return json(res, 200, {
    success: true,
    session: updated,
    sessionToken: sealOnboardingSession(updated),
    user,
    teams,
  })
}

async function handleVercelProject(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: '허용되지 않은 메서드입니다.' })
  const session = unsealOnboardingSession(getBearerToken(req))
  if (!session) return json(res, 401, { error: '온보딩 세션이 없습니다.' })

  const body = await readJsonBody(req)
  const token = String(body.vercelToken || session.tokens.vercelToken || '').trim()
  if (!token) return json(res, 400, { error: 'Vercel 토큰을 입력해주세요.' })

  let repoRef = resolveRepoSlug(session)
  if (!repoRef && session.tokens.githubToken && (session.github?.repo || session.repoName)) {
    const user = await getGitHubUser(session.tokens.githubToken)
    repoRef = { owner: user.login, repo: session.github?.repo || session.repoName || '' }
  }
  if (!repoRef?.owner || !repoRef.repo) {
    return json(res, 400, {
      error: 'GitHub 저장소 정보(owner/repo)가 없습니다. 1단계를 다시 연결해주세요.',
    })
  }

  const repoSlug = `${repoRef.owner}/${repoRef.repo}`
  const projectName = sanitizeVercelProjectName(
    String(body.projectName || session.repoName || repoRef.repo).trim()
  )
  const created = await createVercelProject({
    token,
    githubToken: session.tokens.githubToken,
    teamId: body.teamId?.trim() || undefined,
    projectName,
    repo: repoSlug,
  })
  const updated = updateOnboardingSession(session, {
    status: 'VERCEL_CONNECTED',
    tokens: { vercelToken: token },
    github: {
      owner: repoRef.owner,
      repo: repoRef.repo,
      repoUrl: session.github?.repoUrl || `https://github.com/${repoSlug}`,
      visibility: session.github?.visibility,
    },
    vercel: {
      teamId: body.teamId?.trim() || undefined,
      projectId: created.id,
      projectName: created.name,
      deploymentUrl: created.deploymentUrl || session.vercel?.deploymentUrl,
      gitLinked: created.gitLinked,
    },
  })
  return json(res, 200, {
    success: true,
    session: updated,
    sessionToken: sealOnboardingSession(updated),
    gitLinked: created.gitLinked,
    needsGitHubApp: created.needsGitHubApp || false,
    installUrl: created.installUrl,
    message: created.warning || `Vercel 프로젝트 연결 완료 (${repoSlug})`,
    hint: created.warning,
  })
}

async function handleVercelLink(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: '허용되지 않은 메서드입니다.' })
  const session = unsealOnboardingSession(getBearerToken(req))
  if (!session) return json(res, 401, { error: '온보딩 세션이 없습니다.' })

  const body = await readJsonBody(req)
  const token = String(body.vercelToken || session.tokens.vercelToken || '').trim()
  if (!token) return json(res, 400, { error: 'Vercel 토큰을 입력해주세요.' })

  let repoRef = resolveRepoSlug(session)
  if (!repoRef && session.tokens.githubToken && (session.github?.repo || session.repoName)) {
    const user = await getGitHubUser(session.tokens.githubToken)
    repoRef = { owner: user.login, repo: session.github?.repo || session.repoName || '' }
  }
  if (!repoRef?.owner || !repoRef.repo) {
    return json(res, 400, { error: 'GitHub 저장소 정보가 없습니다. 1단계를 다시 연결해주세요.' })
  }

  const repoSlug = `${repoRef.owner}/${repoRef.repo}`
  const projectName = sanitizeVercelProjectName(
    String(body.projectName || session.vercel?.projectName || session.repoName || repoRef.repo).trim()
  )
  const teamId = body.teamId?.trim() || session.vercel?.teamId || undefined
  const linked = await ensureVercelProjectGitLinked({
    token,
    githubToken: session.tokens.githubToken,
    projectName,
    projectId: session.vercel?.projectId,
    repo: repoSlug,
    teamId,
  })
  const updated = updateOnboardingSession(session, {
    status: 'VERCEL_CONNECTED',
    tokens: { vercelToken: token },
    github: {
      owner: repoRef.owner,
      repo: repoRef.repo,
      repoUrl: session.github?.repoUrl || `https://github.com/${repoSlug}`,
      visibility: session.github?.visibility,
    },
    vercel: {
      teamId,
      projectId: linked.id,
      projectName: linked.name,
      deploymentUrl: linked.deploymentUrl || session.vercel?.deploymentUrl,
      gitLinked: linked.gitLinked,
    },
  })
  return json(res, 200, {
    success: true,
    session: updated,
    sessionToken: sealOnboardingSession(updated),
    gitLinked: linked.gitLinked,
    needsGitHubApp: linked.needsGitHubApp || false,
    installUrl: linked.installUrl,
    message: linked.gitLinked
      ? `GitHub 저장소 연결 완료 (${repoSlug})`
      : linked.warning || '아직 GitHub 앱 설치가 완료되지 않은 것 같습니다.',
    hint: linked.warning,
  })
}

async function handleSupabaseResources(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: '허용되지 않은 메서드입니다.' })
  const session = unsealOnboardingSession(getBearerToken(req))
  if (!session) return json(res, 401, { error: '온보딩 세션이 없습니다.' })

  const body = await readJsonBody(req)
  const token = String(body.supabaseToken || session.tokens.supabaseToken || '').trim()
  if (!token) return json(res, 400, { error: 'Supabase 토큰을 입력해주세요.' })

  const [organizations, projects] = await Promise.all([
    listSupabaseOrganizations(token),
    listSupabaseProjects(token),
  ])
  const updated = updateOnboardingSession(session, { tokens: { supabaseToken: token } })
  return json(res, 200, {
    success: true,
    session: updated,
    sessionToken: sealOnboardingSession(updated),
    organizations,
    projects,
  })
}

async function handleSupabaseProject(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: '허용되지 않은 메서드입니다.' })
  const session = unsealOnboardingSession(getBearerToken(req))
  if (!session) return json(res, 401, { error: '온보딩 세션이 없습니다.' })

  const body = await readJsonBody(req)
  const token = String(body.supabaseToken || session.tokens.supabaseToken || '').trim()
  const organizationId = String(body.organizationId || '').trim()
  const projectName = String(body.projectName || '').trim()
  const region = String(body.region || '').trim()
  const dbPassword = String(body.dbPassword || '')
  if (!token || !organizationId || !projectName || !region || !dbPassword) {
    return json(res, 400, { error: 'Supabase 프로젝트 생성 정보가 부족합니다.' })
  }

  const project = await createSupabaseProject({
    token,
    organizationId,
    name: projectName,
    region,
    dbPassword,
  })
  const updated = updateOnboardingSession(session, {
    status: 'SUPABASE_CONNECTED',
    tokens: { supabaseToken: token },
    supabase: {
      organizationId,
      projectRef: project.id,
      projectUrl: inferSupabaseProjectUrl(project.id),
      region: project.region,
    },
  })
  return json(res, 200, {
    success: true,
    session: updated,
    sessionToken: sealOnboardingSession(updated),
    hint: 'Supabase 프로젝트가 생성되었습니다. Session pooler DATABASE_URL은 Connect 화면에서 복사해 다음 단계에 입력해주세요.',
  })
}

async function handleSupabaseConnect(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: '허용되지 않은 메서드입니다.' })
  const session = unsealOnboardingSession(getBearerToken(req))
  if (!session) return json(res, 401, { error: '온보딩 세션이 없습니다.' })

  const body = await readJsonBody(req)
  const databaseUrl = String(body.databaseUrl || '').trim()
  if (!databaseUrl) {
    return json(res, 400, { error: 'Supabase Session pooler DATABASE_URL을 입력해주세요.' })
  }

  try {
    await testDatabaseConnection(databaseUrl)
  } catch {
    return json(res, 400, { error: 'Supabase DATABASE_URL 연결에 실패했습니다.' })
  }

  const updated = updateOnboardingSession(session, {
    status: 'SUPABASE_CONNECTED',
    supabase: {
      projectUrl: String(body.projectUrl || session.supabase?.projectUrl || '').trim() || undefined,
      projectRef: String(body.projectRef || session.supabase?.projectRef || '').trim() || undefined,
      databaseUrl,
      region: String(body.region || session.supabase?.region || '').trim() || undefined,
    },
  })
  return json(res, 200, {
    success: true,
    session: updated,
    sessionToken: sealOnboardingSession(updated),
  })
}

async function handleProvision(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: '허용되지 않은 메서드입니다.' })
  const session = unsealOnboardingSession(getBearerToken(req))
  if (!session) return json(res, 401, { error: '온보딩 세션이 없습니다.' })

  if (!session.vercel?.projectId || !session.vercel.projectName || !session.tokens.vercelToken) {
    return json(res, 400, { error: 'Vercel 프로젝트가 연결되지 않았습니다.' })
  }
  if (!session.supabase?.databaseUrl) {
    return json(res, 400, { error: 'Supabase DATABASE_URL이 연결되지 않았습니다.' })
  }

  const body = await readJsonBody(req)
  const jwtSecret = String(body.jwtSecret || '').trim()
  if (!jwtSecret || jwtSecret.length < 16) {
    return json(res, 400, { error: 'JWT_SECRET은 16자 이상이어야 합니다.' })
  }

  // 1) DB 스키마/기본 설정
  try {
    await pushDatabaseSchema(session.supabase.databaseUrl)
    await ensureDefaultSettings(session.supabase.databaseUrl, session.supabase.projectUrl || undefined)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`DB 준비에 실패했습니다. Session pooler DATABASE_URL과 비밀번호를 확인하세요. (${detail})`)
  }

  // 2) 세션의 GitHub 정보로 gitSource 준비 (없어도 Vercel link에서 재조회)
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

  // 3) 환경변수 + 재배포/첫 배포
  const deployResult = await applyVercelEnvAndEnsureDeploy({
    token: session.tokens.vercelToken,
    projectId: session.vercel.projectId,
    projectName: session.vercel.projectName,
    teamId: session.vercel.teamId,
    databaseUrl: session.supabase.databaseUrl,
    jwtSecret,
    gitSource,
  })

  const deploymentUrl =
    deployResult.deploymentUrl ||
    session.vercel.deploymentUrl ||
    `https://${session.vercel.projectName}.vercel.app`

  const updated = updateOnboardingSession(session, {
    status: 'READY_FOR_SETUP',
    vercel: { ...session.vercel, deploymentUrl },
  })
  return json(res, 200, {
    success: true,
    session: updated,
    sessionToken: sealOnboardingSession(updated),
    deploymentUrl,
    message:
      deployResult.mode === 'first_deploy'
        ? '환경변수를 저장하고 첫 배포를 시작했습니다. 배포가 끝나면 학교 정보 설정으로 이동하세요.'
        : '환경변수를 저장하고 재배포를 시작했습니다. 잠시 후 학교 정보 설정으로 이동하세요.',
  })
}

export default async function handler(req: any, res: any) {
  const path = routePath(req)
  try {
    if (path === 'config' && req.method === 'GET') return handleConfig(req, res)
    if (path === 'session') return handleSession(req, res)
    if (path === 'github/repo') return handleGitHubRepo(req, res)
    if (path === 'github/connect') return handleGitHubConnect(req, res)
    if (path === 'vercel/teams') return handleVercelTeams(req, res)
    if (path === 'vercel/project') return handleVercelProject(req, res)
    if (path === 'vercel/link') return handleVercelLink(req, res)
    if (path === 'supabase/resources') return handleSupabaseResources(req, res)
    if (path === 'supabase/project') return handleSupabaseProject(req, res)
    if (path === 'supabase/connect') return handleSupabaseConnect(req, res)
    if (path === 'provision') return handleProvision(req, res)

    return json(res, 404, { error: `온보딩 경로를 찾을 수 없습니다: ${path || '(empty)'}` })
  } catch (error) {
    console.error(`onboarding/${path} error:`, error)
    const detail = error instanceof Error ? error.message : String(error)
    let hint = ''
    if (/403|not accessible by personal access token/i.test(detail)) {
      hint =
        ' GitHub 토큰은 Tokens (classic) + repo 스코프를 사용하세요. Fine-grained는 템플릿 복제에서 자주 거부됩니다.'
    }
    // 화면에서 detail만 안 보고 error만 보는 경우 대비: 핵심 원인을 error에 넣음
    const short = `${detail}${hint}`
    return json(res, 500, {
      error: short.length > 500 ? `${short.slice(0, 500)}…` : short,
      detail: short,
    })
  }
}
