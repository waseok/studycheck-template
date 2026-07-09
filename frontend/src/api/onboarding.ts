import apiClient from './client'

export interface ProviderModeConfig {
  clientId: string
  authorizeUrl: string
  configured: boolean
}

export interface OnboardingSession {
  version: 1
  id: string
  status: 'CREATED' | 'GITHUB_CONNECTED' | 'VERCEL_CONNECTED' | 'SUPABASE_CONNECTED' | 'DEPLOYED' | 'READY_FOR_SETUP'
  repoName?: string
  providerMode: {
    github: 'oauth' | 'token'
    vercel: 'oauth' | 'token'
    supabase: 'oauth' | 'token'
  }
  tokens: {
    githubToken?: string
    vercelToken?: string
    supabaseToken?: string
  }
  github?: {
    owner?: string
    repo?: string
    repoUrl?: string
    visibility?: 'public' | 'private'
  }
  vercel?: {
    teamId?: string
    projectId?: string
    projectName?: string
    deploymentUrl?: string
  }
  supabase?: {
    organizationId?: string
    projectRef?: string
    projectUrl?: string
    databaseUrl?: string
    region?: string
  }
  createdAt: string
  updatedAt: string
}

interface SessionResponse {
  success: boolean
  session: OnboardingSession
  sessionToken: string
  message?: string
  deploymentUrl?: string
  hint?: string
}

function withSessionToken(sessionToken?: string) {
  return sessionToken
    ? { headers: { Authorization: `Bearer ${sessionToken}` } }
    : undefined
}

export async function getOnboardingConfig() {
  const response = await apiClient.get<{
    success: boolean
    templateRepo: string
    github: ProviderModeConfig
    vercel: ProviderModeConfig
    supabase: ProviderModeConfig
    defaults: {
      repoVisibility: 'public' | 'private'
      supabaseRegion: string
    }
  }>('/onboarding/config')
  return response.data
}

export async function startOnboardingSession(repoName?: string) {
  const response = await apiClient.post<SessionResponse>('/onboarding/session', { repoName })
  return response.data
}

export async function getOnboardingSession(sessionToken: string) {
  const response = await apiClient.get<SessionResponse>('/onboarding/session', withSessionToken(sessionToken))
  return response.data
}

export async function connectGitHubRepo(
  sessionToken: string,
  payload: { githubToken: string; repoName: string; visibility: 'public' | 'private' }
) {
  const response = await apiClient.post<SessionResponse>(
    '/onboarding/github/repo',
    payload,
    withSessionToken(sessionToken)
  )
  return response.data
}

export async function getVercelTeams(sessionToken: string, vercelToken: string) {
  const response = await apiClient.post<
    SessionResponse & {
      user: { id: string; username: string; email: string }
      teams: Array<{ id: string; slug: string; name: string }>
    }
  >('/onboarding/vercel/teams', { vercelToken }, withSessionToken(sessionToken))
  return response.data
}

export async function connectVercelProject(
  sessionToken: string,
  payload: { vercelToken: string; teamId?: string; projectName?: string }
) {
  const response = await apiClient.post<SessionResponse>(
    '/onboarding/vercel/project',
    payload,
    withSessionToken(sessionToken)
  )
  return response.data
}

export async function getSupabaseResources(sessionToken: string, supabaseToken: string) {
  const response = await apiClient.post<
    SessionResponse & {
      organizations: Array<{ id: string; name: string }>
      projects: Array<{ id: string; organization_id: string; name: string; region: string; status: string }>
    }
  >('/onboarding/supabase/resources', { supabaseToken }, withSessionToken(sessionToken))
  return response.data
}

export async function createSupabaseProjectManaged(
  sessionToken: string,
  payload: {
    supabaseToken: string
    organizationId: string
    projectName: string
    region: string
    dbPassword: string
  }
) {
  const response = await apiClient.post<SessionResponse>(
    '/onboarding/supabase/project',
    payload,
    withSessionToken(sessionToken)
  )
  return response.data
}

export async function connectExistingSupabase(
  sessionToken: string,
  payload: {
    projectUrl?: string
    projectRef?: string
    databaseUrl: string
    region?: string
  }
) {
  const response = await apiClient.post<SessionResponse>(
    '/onboarding/supabase/connect',
    payload,
    withSessionToken(sessionToken)
  )
  return response.data
}

export async function provisionOnboardingInfrastructure(
  sessionToken: string,
  payload: { jwtSecret: string }
) {
  const response = await apiClient.post<SessionResponse>(
    '/onboarding/provision',
    payload,
    withSessionToken(sessionToken)
  )
  return response.data
}
