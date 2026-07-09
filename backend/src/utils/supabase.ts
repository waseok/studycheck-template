interface SupabaseProject {
  id: string
  organization_id: string
  name: string
  region: string
  status: string
}

interface SupabaseOrganization {
  id: string
  name: string
}

const SUPABASE_API = 'https://api.supabase.com/v1'

async function supabaseFetch<T>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${SUPABASE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: token,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Supabase API error (${response.status}): ${text}`)
  }

  return response.json() as Promise<T>
}

export async function listSupabaseOrganizations(token: string): Promise<SupabaseOrganization[]> {
  return supabaseFetch<SupabaseOrganization[]>(token, '/organizations')
}

export async function listSupabaseProjects(token: string): Promise<SupabaseProject[]> {
  return supabaseFetch<SupabaseProject[]>(token, '/projects')
}

export async function createSupabaseProject(options: {
  token: string
  organizationId: string
  name: string
  region: string
  dbPassword: string
}): Promise<SupabaseProject> {
  return supabaseFetch<SupabaseProject>(options.token, '/projects', {
    method: 'POST',
    body: JSON.stringify({
      organization_id: options.organizationId,
      name: options.name,
      region: options.region,
      db_pass: options.dbPassword,
      plan: 'free',
    }),
  })
}

export function inferSupabaseProjectUrl(projectRef: string): string {
  return `https://${projectRef}.supabase.co`
}

export function buildSupabaseDbUrlHint(projectRef: string, regionHost: string, dbPassword: string): string {
  return `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@${regionHost}:5432/postgres?sslmode=require`
}

export function getSupabaseOAuthConfig() {
  return {
    clientId: process.env.SUPABASE_MANAGEMENT_CLIENT_ID || '',
    authorizeUrl: process.env.SUPABASE_MANAGEMENT_AUTHORIZE_URL || 'https://supabase.com/dashboard',
    configured: Boolean(process.env.SUPABASE_MANAGEMENT_CLIENT_ID),
  }
}
