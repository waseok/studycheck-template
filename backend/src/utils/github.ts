interface GitHubUser {
  login: string
  id: number
  avatar_url: string
}

interface GitHubCreateRepoResult {
  owner: string
  repo: string
  repoUrl: string
  visibility: 'public' | 'private'
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
  const payload = {
    owner: options.owner || user.login,
    name: options.name,
    description: options.description || '학교별 연수관리 플랫폼 템플릿 복제본',
    private: (options.visibility || 'private') === 'private',
    include_all_branches: false,
  }

  const result = await githubFetch<{
    owner: { login: string }
    name: string
    html_url: string
    private: boolean
  }>(
    options.token,
    `/repos/${options.templateOwner}/${options.templateRepo}/generate`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )

  return {
    owner: result.owner.login,
    repo: result.name,
    repoUrl: result.html_url,
    visibility: result.private ? 'private' : 'public',
  }
}

export function getGitHubOAuthConfig() {
  return {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    configured: Boolean(process.env.GITHUB_CLIENT_ID),
  }
}
