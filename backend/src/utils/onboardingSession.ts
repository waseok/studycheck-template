import crypto from 'crypto'

export interface ProviderTokens {
  githubToken?: string
  vercelToken?: string
  supabaseToken?: string
}

export interface GitHubState {
  owner?: string
  repo?: string
  repoUrl?: string
  visibility?: 'public' | 'private'
}

export interface VercelState {
  teamId?: string
  projectId?: string
  projectName?: string
  deploymentUrl?: string
}

export interface SupabaseState {
  organizationId?: string
  projectRef?: string
  projectUrl?: string
  databaseUrl?: string
  region?: string
}

export interface SchoolSetupDraft {
  schoolName?: string
  schoolLogoUrl?: string
  schoolPassword?: string
  adminPassword?: string
  adminName?: string
  adminEmail?: string
}

export interface OnboardingSessionPayload {
  version: 1
  id: string
  status:
    | 'CREATED'
    | 'GITHUB_CONNECTED'
    | 'VERCEL_CONNECTED'
    | 'SUPABASE_CONNECTED'
    | 'DEPLOYED'
    | 'READY_FOR_SETUP'
  repoName?: string
  providerMode: {
    github: 'oauth' | 'token'
    vercel: 'oauth' | 'token'
    supabase: 'oauth' | 'token'
  }
  tokens: ProviderTokens
  github?: GitHubState
  vercel?: VercelState
  supabase?: SupabaseState
  setupDraft?: SchoolSetupDraft
  createdAt: string
  updatedAt: string
}

const DEFAULT_SECRET = 'studycheck-onboarding-dev-secret'

function getSessionSecret(): Buffer {
  const secret = process.env.ONBOARDING_SESSION_SECRET || process.env.JWT_SECRET || DEFAULT_SECRET
  return crypto.createHash('sha256').update(secret).digest()
}

function base64UrlEncode(input: Buffer): string {
  return input.toString('base64url')
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

export function createOnboardingSession(repoName?: string): OnboardingSessionPayload {
  const timestamp = new Date().toISOString()
  return {
    version: 1,
    id: crypto.randomUUID(),
    status: 'CREATED',
    repoName,
    providerMode: {
      github: process.env.GITHUB_CLIENT_ID ? 'oauth' : 'token',
      vercel: process.env.VERCEL_CLIENT_ID ? 'oauth' : 'token',
      supabase: process.env.SUPABASE_MANAGEMENT_CLIENT_ID ? 'oauth' : 'token',
    },
    tokens: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function sealOnboardingSession(session: OnboardingSessionPayload): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getSessionSecret(), iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return [iv, tag, encrypted].map(base64UrlEncode).join('.')
}

export function unsealOnboardingSession(token?: string): OnboardingSessionPayload | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null

  try {
    const [ivPart, tagPart, payloadPart] = parts
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getSessionSecret(),
      base64UrlDecode(ivPart)
    )
    decipher.setAuthTag(base64UrlDecode(tagPart))
    const decrypted = Buffer.concat([
      decipher.update(base64UrlDecode(payloadPart)),
      decipher.final(),
    ])
    return JSON.parse(decrypted.toString('utf8')) as OnboardingSessionPayload
  } catch {
    return null
  }
}

export function updateOnboardingSession(
  session: OnboardingSessionPayload,
  patch: Partial<OnboardingSessionPayload>
): OnboardingSessionPayload {
  return {
    ...session,
    ...patch,
    providerMode: patch.providerMode ?? session.providerMode,
    tokens: patch.tokens ? { ...session.tokens, ...patch.tokens } : session.tokens,
    github: patch.github ? { ...session.github, ...patch.github } : session.github,
    vercel: patch.vercel ? { ...session.vercel, ...patch.vercel } : session.vercel,
    supabase: patch.supabase ? { ...session.supabase, ...patch.supabase } : session.supabase,
    setupDraft: patch.setupDraft
      ? { ...session.setupDraft, ...patch.setupDraft }
      : session.setupDraft,
    updatedAt: new Date().toISOString(),
  }
}

export function getSessionTokenFromHeader(header?: string): string | undefined {
  if (!header) return undefined
  if (!header.startsWith('Bearer ')) return undefined
  return header.slice('Bearer '.length).trim()
}
