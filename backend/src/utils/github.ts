import { createHash } from 'crypto'

interface GitHubUser {
  login: string
  id: number
  avatar_url: string
}

export interface GitHubCreateRepoResult {
  owner: string
  repo: string
  repoUrl: string
  visibility: 'public' | 'private'
  id: number
  defaultBranch?: string
}

const GITHUB_API = 'https://api.github.com'

async function githubFetch<T>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'studycheck-template-onboarding',
      ...(init?.headers || {}),
    },
  })

  if (!response.ok) {
    const text = await response.text()
    let detail = text
    try {
      const parsed = JSON.parse(text) as { message?: string; errors?: Array<{ message?: string }> }
      detail = parsed.message || parsed.errors?.map((e) => e.message).filter(Boolean).join(', ') || text
    } catch {
      // raw text 유지
    }
    throw new Error(`GitHub API error (${response.status}): ${detail}`)
  }

  return response.json() as Promise<T>
}

export async function getGitHubUser(token: string): Promise<GitHubUser> {
  return githubFetch<GitHubUser>(token, '/user')
}

/** github.com/owner/repo 또는 owner/repo → { owner, repo } */
export function parseGitHubRepoRef(input: string): { owner: string; repo: string } | null {
  const raw = input.trim()
  if (!raw) return null

  const fromUrl = raw.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+)/i)
  if (fromUrl) {
    return {
      owner: fromUrl[1],
      repo: fromUrl[2].replace(/\.git$/i, ''),
    }
  }

  const fromSlug = raw.match(/^([^/\s]+)\/([^/\s]+)$/)
  if (fromSlug) {
    return {
      owner: fromSlug[1],
      repo: fromSlug[2].replace(/\.git$/i, ''),
    }
  }

  return null
}

export async function getGitHubRepo(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubCreateRepoResult> {
  const result = await githubFetch<{
    id: number
    owner: { login: string }
    name: string
    html_url: string
    private: boolean
    default_branch?: string
  }>(token, `/repos/${owner}/${repo}`)

  return {
    id: result.id,
    owner: result.owner.login,
    repo: result.name,
    repoUrl: result.html_url,
    visibility: result.private ? 'private' : 'public',
    defaultBranch: result.default_branch || 'main',
  }
}

export async function createRepoFromTemplate(options: {
  token: string
  templateOwner: string
  templateRepo: string
  owner?: string
  name: string
  description?: string
  visibility?: 'public' | 'private'
}): Promise<GitHubCreateRepoResult> {
  const user = await getGitHubUser(options.token)
  const owner = options.owner || user.login
  const payload = {
    owner,
    name: options.name,
    description: options.description || '학교별 연수관리 플랫폼 템플릿 복제본',
    private: (options.visibility || 'private') === 'private',
    include_all_branches: false,
  }

  const result = await githubFetch<{
    id?: number
    owner?: { login: string }
    name?: string
    html_url?: string
    private?: boolean
  }>(
    options.token,
    `/repos/${options.templateOwner}/${options.templateRepo}/generate`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )

  // generate API는 비동기로 끝나 owner 필드가 비는 경우가 있어, 조회/유저정보로 보정
  const resolvedOwner = result.owner?.login || owner
  const resolvedRepo = result.name || options.name

  try {
    return await getGitHubRepo(options.token, resolvedOwner, resolvedRepo)
  } catch {
    if (!result.id) {
      throw new Error(
        `GitHub 저장소(${resolvedOwner}/${resolvedRepo})는 생성됐지만 ID를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.`
      )
    }
    return {
      id: result.id,
      owner: resolvedOwner,
      repo: resolvedRepo,
      repoUrl: result.html_url || `https://github.com/${resolvedOwner}/${resolvedRepo}`,
      visibility: result.private ? 'private' : (options.visibility || 'private'),
    }
  }
}

export function getGitHubOAuthConfig() {
  return {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    configured: Boolean(process.env.GITHUB_CLIENT_ID),
  }
}

/** 저장소 파일 내용을 가져옵니다. 없으면 null */
export async function getGitHubFileContent(options: {
  token: string
  owner: string
  repo: string
  path: string
  ref?: string
}): Promise<{ sha: string; content: string } | null> {
  const query = options.ref ? `?ref=${encodeURIComponent(options.ref)}` : ''
  const response = await fetch(
    `${GITHUB_API}/repos/${options.owner}/${options.repo}/contents/${options.path}${query}`,
    {
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'studycheck-template-onboarding',
      },
    }
  )
  if (response.status === 404) return null
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`GitHub 파일 조회 실패(${options.path}): ${text}`)
  }
  const data = (await response.json()) as { sha?: string; content?: string; encoding?: string }
  if (!data.sha || !data.content) return null
  const decoded =
    data.encoding === 'base64'
      ? Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8')
      : data.content
  return { sha: data.sha, content: decoded }
}

/** 저장소 파일을 생성하거나 덮어씁니다 */
export async function upsertGitHubFile(options: {
  token: string
  owner: string
  repo: string
  path: string
  content: string
  message: string
  branch?: string
}): Promise<void> {
  const existing = await getGitHubFileContent({
    token: options.token,
    owner: options.owner,
    repo: options.repo,
    path: options.path,
    ref: options.branch,
  })

  // 내용이 동일하면 API 호출 생략
  if (existing && existing.content.replace(/\r\n/g, '\n') === options.content.replace(/\r\n/g, '\n')) {
    return
  }

  await githubFetch(options.token, `/repos/${options.owner}/${options.repo}/contents/${options.path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: options.message,
      content: Buffer.from(options.content, 'utf8').toString('base64'),
      ...(existing?.sha ? { sha: existing.sha } : {}),
      ...(options.branch ? { branch: options.branch } : {}),
    }),
  })
}

/**
 * 학교 저장소의 vercel-build.mjs 가 빌드 중 db push 를 하면
 * 기존 DB의 다른 앱 테이블(예: rankings) 때문에 배포가 실패한다.
 * 템플릿의 최신 스크립트로 교체해 첫 배포가 통과되도록 한다.
 */
export async function syncVercelBuildScriptToRepo(options: {
  token: string
  owner: string
  repo: string
  branch?: string
  scriptContent: string
}): Promise<{ updated: boolean }> {
  const path = 'scripts/vercel-build.mjs'
  const existing = await getGitHubFileContent({
    token: options.token,
    owner: options.owner,
    repo: options.repo,
    path,
    ref: options.branch,
  })

  const needsPatch =
    !existing ||
    /\[\s*['"]db['"]\s*,\s*['"]push['"]\s*\]/.test(existing.content) ||
    /db\s+push/.test(existing.content)

  if (!needsPatch) {
    return { updated: false }
  }

  await upsertGitHubFile({
    token: options.token,
    owner: options.owner,
    repo: options.repo,
    path,
    content: options.scriptContent,
    message: 'fix: skip prisma db push during Vercel build to protect existing tables',
    branch: options.branch,
  })
  return { updated: true }
}

/** GitHub 저장소 파일 삭제 (없으면 무시) */
export async function deleteGitHubFile(options: {
  token: string
  owner: string
  repo: string
  path: string
  message: string
  branch?: string
}): Promise<boolean> {
  const existing = await getGitHubFileContent({
    token: options.token,
    owner: options.owner,
    repo: options.repo,
    path: options.path,
    ref: options.branch,
  })
  if (!existing) return false

  const response = await fetch(
    `${GITHUB_API}/repos/${options.owner}/${options.repo}/contents/${options.path}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'studycheck-template-onboarding',
      },
      body: JSON.stringify({
        message: options.message,
        sha: existing.sha,
        ...(options.branch ? { branch: options.branch } : {}),
      }),
    }
  )
  if (!response.ok && response.status !== 404) {
    const text = await response.text()
    throw new Error(`GitHub 파일 삭제 실패(${options.path}): ${text}`)
  }
  return response.ok
}

/**
 * 학교 저장소에 Express API 진입점·경량 settings 게이트·vercel.json 을 맞춥니다.
 */
export async function syncSchoolRuntimeApiToRepo(options: {
  token: string
  owner: string
  repo: string
  branch?: string
  indexTsContent: string
  vercelJsonContent: string
  /** 경량 GET /api/settings/status (없으면 생략) */
  settingsStatusContent?: string
  /** 경량 GET /api/settings/public (없으면 생략) */
  settingsPublicContent?: string
  /** 경량 POST /api/settings/setup (없으면 생략) */
  settingsSetupContent?: string
  /** 병렬 install 스크립트 (없으면 생략) */
  installScriptContent?: string
  buildScriptContent?: string
}): Promise<{ updated: boolean }> {
  const branch = options.branch || 'main'
  let updated = false
  const norm = (s: string) => s.replace(/\r\n/g, '\n')

  const syncFile = async (path: string, content: string, message: string) => {
    const existing = await getGitHubFileContent({
      token: options.token,
      owner: options.owner,
      repo: options.repo,
      path,
      ref: branch,
    })
    if (existing && norm(existing.content) === norm(content)) return
    await upsertGitHubFile({
      token: options.token,
      owner: options.owner,
      repo: options.repo,
      path,
      content,
      message,
      branch,
    })
    updated = true
  }

  await syncFile(
    'api/index.ts',
    options.indexTsContent,
    'fix: restore Express API entry so school site can leave onboarding'
  )
  await syncFile(
    'vercel.json',
    options.vercelJsonContent,
    'fix: school Vercel config (Express + lightweight settings gate)'
  )

  if (options.settingsStatusContent) {
    await syncFile(
      'api/settings/status.ts',
      options.settingsStatusContent,
      'fix: lightweight /api/settings/status for fast SetupGate'
    )
  }
  if (options.settingsPublicContent) {
    await syncFile(
      'api/settings/public.ts',
      options.settingsPublicContent,
      'fix: lightweight /api/settings/public without full Express boot'
    )
  }
  if (options.settingsSetupContent) {
    await syncFile(
      'api/settings/setup.ts',
      options.settingsSetupContent,
      'fix: lightweight /api/settings/setup without full Express boot'
    )
  }

  if (options.installScriptContent) {
    await syncFile(
      'scripts/vercel-install.mjs',
      options.installScriptContent,
      'fix: parallel npm install for faster Vercel builds'
    )
  }
  if (options.buildScriptContent) {
    await syncFile(
      'scripts/vercel-build.mjs',
      options.buildScriptContent,
      'fix: parallel backend/frontend build; skip frontend tsc on deploy'
    )
  }

  return { updated }
}

interface GitTreeEntry {
  path: string
  mode: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
}

async function getBranchHead(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<{ commitSha: string; treeSha: string }> {
  const data = await githubFetch<{
    commit: { sha: string; commit: { tree: { sha: string } } }
  }>(token, `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`)
  return { commitSha: data.commit.sha, treeSha: data.commit.commit.tree.sha }
}

async function getRecursiveTree(
  token: string,
  owner: string,
  repo: string,
  treeSha: string
): Promise<GitTreeEntry[]> {
  const data = await githubFetch<{ tree: GitTreeEntry[]; truncated: boolean }>(
    token,
    `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`
  )
  if (data.truncated) {
    throw new Error('저장소 파일 트리가 너무 커서 미러링할 수 없습니다.')
  }
  return data.tree.filter((entry) => entry.type === 'blob')
}

/** 문자열 내용의 git blob SHA-1 (변경 여부 판단용) */
function gitBlobSha(content: string): string {
  const body = Buffer.from(content, 'utf8')
  return createHash('sha1').update(`blob ${body.length}\0`).update(body).digest('hex')
}

/**
 * 템플릿 저장소의 최신 코드를 학교 저장소로 통째로 미러링합니다.
 *
 * 배경: 학교 저장소는 생성 시점에 한 번 복제된 뒤 재사용되므로,
 * 템플릿에서 고친 버그(프론트엔드 포함)가 학교 사이트에 반영되지 않았습니다.
 * Git Data API로 변경된 파일만 blob 으로 올려 단일 커밋을 만들기 때문에
 * Vercel 배포도 1회만 트리거됩니다.
 *
 * @param overrides 학교 전용으로 내용이 달라야 하는 파일 (예: vercel.json)
 */
export async function mirrorTemplateRepoToSchool(options: {
  token: string
  templateOwner: string
  templateRepo: string
  owner: string
  repo: string
  branch?: string
  overrides?: Record<string, string>
}): Promise<{ updated: boolean; changedFiles: string[]; deletedFiles: string[] }> {
  const branch = options.branch || 'main'
  const overrides = options.overrides || {}

  // 자기 자신에게 미러링하는 실수 방지 (템플릿 저장소 오염 금지)
  if (
    options.owner.toLowerCase() === options.templateOwner.toLowerCase() &&
    options.repo.toLowerCase() === options.templateRepo.toLowerCase()
  ) {
    return { updated: false, changedFiles: [], deletedFiles: [] }
  }

  const [templateHead, schoolHead] = await Promise.all([
    getBranchHead(options.token, options.templateOwner, options.templateRepo, branch),
    getBranchHead(options.token, options.owner, options.repo, branch),
  ])
  const [templateTree, schoolTree] = await Promise.all([
    getRecursiveTree(options.token, options.templateOwner, options.templateRepo, templateHead.treeSha),
    getRecursiveTree(options.token, options.owner, options.repo, schoolHead.treeSha),
  ])

  const templateMap = new Map(templateTree.map((e) => [e.path, e]))
  const schoolMap = new Map(schoolTree.map((e) => [e.path, e]))

  // 1) 템플릿 대비 내용이 다른 파일 (override 경로는 override 내용 기준으로 비교)
  const changed: Array<{ path: string; mode: string; templateSha?: string; content?: string }> = []
  for (const [path, entry] of templateMap) {
    if (path in overrides) continue
    const school = schoolMap.get(path)
    if (!school || school.sha !== entry.sha) {
      changed.push({ path, mode: entry.mode, templateSha: entry.sha })
    }
  }
  for (const [path, content] of Object.entries(overrides)) {
    const school = schoolMap.get(path)
    if (!school || school.sha !== gitBlobSha(content)) {
      changed.push({ path, mode: schoolMap.get(path)?.mode || '100644', content })
    }
  }

  // 2) 템플릿에 없는 학교 파일 삭제 (override 경로 제외)
  const deleted: string[] = []
  for (const path of schoolMap.keys()) {
    if (!templateMap.has(path) && !(path in overrides)) deleted.push(path)
  }

  if (changed.length === 0 && deleted.length === 0) {
    return { updated: false, changedFiles: [], deletedFiles: [] }
  }

  // 3) 변경 파일을 학교 저장소 blob 으로 생성 (동시 8개)
  const treeEntries: Array<{ path: string; mode: string; type: 'blob'; sha: string | null }> = []
  const queue = [...changed]
  const workers = Array.from({ length: 8 }, async () => {
    for (;;) {
      const item = queue.shift()
      if (!item) return
      let base64: string
      if (item.content !== undefined) {
        base64 = Buffer.from(item.content, 'utf8').toString('base64')
      } else {
        const blob = await githubFetch<{ content: string }>(
          options.token,
          `/repos/${options.templateOwner}/${options.templateRepo}/git/blobs/${item.templateSha}`
        )
        base64 = blob.content.replace(/\n/g, '')
      }
      const created = await githubFetch<{ sha: string }>(
        options.token,
        `/repos/${options.owner}/${options.repo}/git/blobs`,
        { method: 'POST', body: JSON.stringify({ content: base64, encoding: 'base64' }) }
      )
      treeEntries.push({ path: item.path, mode: item.mode, type: 'blob', sha: created.sha })
    }
  })
  await Promise.all(workers)

  for (const path of deleted) {
    treeEntries.push({ path, mode: '100644', type: 'blob', sha: null })
  }

  // 4) 단일 트리/커밋 생성 후 브랜치 이동 → Vercel webhook 배포 1회
  const newTree = await githubFetch<{ sha: string }>(
    options.token,
    `/repos/${options.owner}/${options.repo}/git/trees`,
    {
      method: 'POST',
      body: JSON.stringify({ base_tree: schoolHead.treeSha, tree: treeEntries }),
    }
  )
  const commit = await githubFetch<{ sha: string }>(
    options.token,
    `/repos/${options.owner}/${options.repo}/git/commits`,
    {
      method: 'POST',
      body: JSON.stringify({
        message: `chore: sync ${changed.length} files (+${deleted.length} removed) from template ${options.templateOwner}/${options.templateRepo}`,
        tree: newTree.sha,
        parents: [schoolHead.commitSha],
      }),
    }
  )
  await githubFetch(
    options.token,
    `/repos/${options.owner}/${options.repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) }
  )

  return {
    updated: true,
    changedFiles: changed.map((c) => c.path),
    deletedFiles: deleted,
  }
}
