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
