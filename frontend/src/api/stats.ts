import apiClient from './client'

export interface DashboardTrainingSummary {
  id: string
  name: string
  total: number
  completed: number
  pending: number
}

export interface DashboardSummary {
  trainings: DashboardTrainingSummary[]
  incomplete: Array<{ id: string; name: string; count: number }>
}

export const getDashboardSummary = async (): Promise<DashboardSummary> => {
  const response = await apiClient.get<DashboardSummary>('/stats/dashboard')
  return response.data
}

export const getTrainingStats = async (trainingId: string) => {
  const response = await apiClient.get(`/stats/training/${trainingId}`)
  return response.data
}

export const getUserStats = async (userId: string) => {
  const response = await apiClient.get(`/stats/user/${userId}`)
  return response.data
}

export const getIncompleteList = async (trainingId?: string) => {
  const params = trainingId ? { trainingId } : {}
  const response = await apiClient.get('/stats/incomplete', { params })
  return response.data
}
