import apiClient from './client'

export interface PublicSettings {
  schoolName: string
  schoolLogoUrl: string | null
  vercelAppUrl: string | null
  setupCompleted: boolean
}

export interface SetupStatus {
  setupCompleted: boolean
  needsInfra: boolean
  dbConnected: boolean
  onVercel: boolean
}

export interface SetupPayload {
  schoolName: string
  schoolLogoUrl?: string
  schoolPassword: string
  adminPassword: string
  supabaseProjectUrl?: string
  vercelAppUrl?: string
  adminName: string
  adminEmail: string
}

export interface BootstrapInfraPayload {
  databaseUrl: string
  jwtSecret: string
  vercelToken?: string
  supabaseProjectUrl?: string
}

export const getSetupStatus = async (): Promise<SetupStatus> => {
  const response = await apiClient.get<SetupStatus>('/settings/status')
  return response.data
}

export const getPublicSettings = async (): Promise<PublicSettings> => {
  const response = await apiClient.get<PublicSettings>('/settings/public')
  return response.data
}

export const bootstrapInfra = async (payload: BootstrapInfraPayload): Promise<{
  success: boolean
  message: string
  dbConnected: boolean
  redeployTriggered: boolean
  vercelEnvApplied: boolean
  manualEnvRequired?: boolean
}> => {
  const response = await apiClient.post('/settings/bootstrap-infra', payload)
  return response.data
}

export const completeSetup = async (payload: SetupPayload): Promise<{
  success: boolean
  message: string
  vercelAppUrl?: string
  schoolName?: string
}> => {
  const response = await apiClient.post('/settings/setup', payload)
  return response.data
}
